import { io } from 'socket.io-client';
import { createHmac } from 'node:crypto';

const HTTP = 'http://localhost:3000/api/v1';
const WS = 'http://localhost:3000/matchmaking';
const TOKEN = process.env.TEST_BOT_TOKEN;

function sign(fields, token) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

async function login(id, name) {
  const user = JSON.stringify({ id, first_name: name });
  const initData = sign({ user, auth_date: String(Math.floor(Date.now() / 1000)) }, TOKEN);
  const res = await (await fetch(`${HTTP}/auth/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
  })).json();
  return { userId: res.user.id, token: res.tokens.accessToken };
}

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

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const a = await login(999123, 'Ranked-A');
const b = await login(888222, 'Ranked-B');
check('two players logged in', a.userId && b.userId && a.userId !== b.userId);

const sockA = io(WS, { auth: { token: a.token }, transports: ['websocket'], forceNew: true });
const sockB = io(WS, { auth: { token: b.token }, transports: ['websocket'], forceNew: true });
await Promise.all([
  new Promise((r, j) => { sockA.on('connect', r); sockA.on('connect_error', j); }),
  new Promise((r, j) => { sockB.on('connect', r); sockB.on('connect_error', j); }),
]);
check('both connected to /matchmaking', sockA.connected && sockB.connected);

// Invalid mode is rejected.
const badMode = await emit(sockA, 'matchmaking:join', { mode: 'BLITZ' });
check('invalid mode rejected', badMode.ok === false, JSON.stringify(badMode));

// Arm the found listeners, then both join RANKED.
const foundA = once(sockA, 'matchmaking:found');
const foundB = once(sockB, 'matchmaking:found');

const joinA = await emit(sockA, 'matchmaking:join', { mode: 'RANKED' });
check('player A searching', joinA.ok && joinA.status === 'searching', JSON.stringify(joinA));
const joinB = await emit(sockB, 'matchmaking:join', { mode: 'RANKED' });
check('player B searching', joinB.ok, JSON.stringify(joinB));

const [fa, fb] = await Promise.all([foundA, foundB]);
check('both received matchmaking:found', !!fa?.matchId && !!fb?.matchId, JSON.stringify({ fa, fb }));
check('both were paired into the SAME match', fa.matchId === fb.matchId, `${fa?.matchId} vs ${fb?.matchId}`);
check('match mode is RANKED', fa.mode === 'RANKED');

// The announced match is a real, playable game containing both players.
const view = await (await fetch(`${HTTP}/games/${fa.matchId}`, {
  headers: { authorization: `Bearer ${a.token}` },
})).json();
const seatUsers = view.players ? [view.players.WHITE.userId, view.players.BLACK.userId].sort() : [];
check('created game contains both players', JSON.stringify(seatUsers) === JSON.stringify([a.userId, b.userId].sort()), JSON.stringify(seatUsers));

// Leave works and returns ok.
const leave = await emit(sockA, 'matchmaking:leave', {});
check('leave returns ok', leave.ok === true);

sockA.disconnect();
sockB.disconnect();

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
