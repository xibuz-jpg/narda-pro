import { io } from 'socket.io-client';

const HTTP = 'http://localhost:3000/api/v1';
const MM = 'http://localhost:3000/matchmaking';
const GAME = 'http://localhost:3000/game';

async function devLogin(telegramId, firstName) {
  const res = await fetch(`${HTTP}/auth/dev`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telegramId, firstName }),
  });
  if (!res.ok) throw new Error(`dev login failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { userId: data.user.id, token: data.tokens.accessToken };
}

const post = async (path, token, body) => {
  const res = await fetch(`${HTTP}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
};

const emit = (sock, ev, payload) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${ev}`)), 5000);
    sock.emit(ev, payload, (ack) => { clearTimeout(timer); resolve(ack); });
  });

const once = (sock, ev, ms = 8000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`event timeout: ${ev}`)), ms);
    sock.once(ev, (data) => { clearTimeout(timer); resolve(data); });
  });

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

// ── Host (A) and friend (B) ─────────────────────────────────────────────────
const A = await devLogin(770001, 'Host-A');
const B = await devLogin(770002, 'Friend-B');
check('two users logged in', A.userId && B.userId && A.userId !== B.userId);

// A creates an invite.
const inv = await post('/games/invite', A.token);
check('invite created', inv.status === 201 && typeof inv.body?.code === 'string', JSON.stringify(inv));
const code = inv.body?.code;
check('code is 6 unambiguous chars', /^[A-HJ-NP-Z2-9]{6}$/.test(code || ''), code);

// A can't accept their own invite.
const self = await post(`/games/invite/${code}/accept`, A.token);
check('host cannot accept own invite', self.status === 400, JSON.stringify(self));

// A parks on matchmaking waiting for the friend.
const sockA = io(MM, { auth: { token: A.token }, transports: ['websocket'], forceNew: true });
await new Promise((r, j) => { sockA.on('connect', r); sockA.on('connect_error', j); });
const waitAck = await emit(sockA, 'invite:wait', {});
check('host parked on invite:wait', waitAck.ok === true, JSON.stringify(waitAck));
const hostFound = once(sockA, 'matchmaking:found');

// B redeems the code.
const acc = await post(`/games/invite/${code}/accept`, B.token);
check('friend accepted invite', acc.status === 201 && !!acc.body?.matchId, JSON.stringify(acc));
const matchId = acc.body?.matchId;

// A is notified with the same matchId.
const fa = await hostFound;
check('host notified via matchmaking:found', fa?.matchId === matchId, JSON.stringify(fa));
check('friend game is CASUAL', fa?.mode === 'CASUAL', JSON.stringify(fa));

// The match contains exactly the two humans, no AI.
const view = await (await fetch(`${HTTP}/games/${matchId}`, { headers: { authorization: `Bearer ${A.token}` } })).json();
const seats = [view.players.WHITE, view.players.BLACK];
const seatUsers = seats.map((s) => s.userId).sort();
check('match has both humans', JSON.stringify(seatUsers) === JSON.stringify([A.userId, B.userId].sort()), JSON.stringify(seatUsers));
check('no AI seat', seats.every((s) => s.isAI === false));

// Re-accepting a consumed code fails.
const reuse = await post(`/games/invite/${code}/accept`, B.token);
check('used code cannot be reused', reuse.status === 404, JSON.stringify(reuse));

// Both actually join the live game as players.
const gA = io(GAME, { auth: { token: A.token }, transports: ['websocket'], forceNew: true });
const gB = io(GAME, { auth: { token: B.token }, transports: ['websocket'], forceNew: true });
await Promise.all([
  new Promise((r, j) => { gA.on('connect', r); gA.on('connect_error', j); }),
  new Promise((r, j) => { gB.on('connect', r); gB.on('connect_error', j); }),
]);
const joinA = await emit(gA, 'game:join', { matchId });
const joinB = await emit(gB, 'game:join', { matchId });
check('host joins as player', joinA.ok && joinA.role === 'player', JSON.stringify(joinA.role));
check('friend joins as player', joinB.ok && joinB.role === 'player', JSON.stringify(joinB.role));
check('clock armed once both present', !!joinA.view?.clock || !!joinB.view?.clock);

// Bad code is rejected cleanly.
const bad = await post(`/games/invite/ZZZZZZ/accept`, B.token);
check('unknown code rejected', bad.status === 404, JSON.stringify(bad));

sockA.disconnect();
gA.disconnect();
gB.disconnect();

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
