import { io } from 'socket.io-client';
import { createHmac } from 'node:crypto';

const HTTP = 'http://localhost:3000/api/v1';
const WS = 'http://localhost:3000/game';
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

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

// Two players log in.
const host = await login(999123, 'Host');
const opp = await login(888222, 'Opponent');
check('two players logged in', host.userId && opp.userId && host.userId !== opp.userId);

// Host creates the game over REST.
const created = await (await fetch(`${HTTP}/games`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${host.token}` },
  body: JSON.stringify({ opponentId: opp.userId }),
})).json();
check('game created with two seats', !!created.matchId && !!created.players, JSON.stringify(created));
const matchId = created.matchId;

// Connect both sockets and join the room.
const hostSock = io(WS, { auth: { token: host.token }, transports: ['websocket'], forceNew: true });
const oppSock = io(WS, { auth: { token: opp.token }, transports: ['websocket'], forceNew: true });
await Promise.all([
  new Promise((r, j) => { hostSock.on('connect', r); hostSock.on('connect_error', j); }),
  new Promise((r, j) => { oppSock.on('connect', r); oppSock.on('connect_error', j); }),
]);
const joinHost = await emit(hostSock, 'game:join', { matchId });
await emit(oppSock, 'game:join', { matchId });
check('both joined; initial state delivered', joinHost.ok && !!joinHost.view, JSON.stringify(joinHost.error));

const sockOf = (userId) => (userId === host.userId ? hostSock : oppSock);
const other = (userId) => (userId === host.userId ? opp : host);

let view = created;

// Negative: the non-active player cannot act.
{
  const actingUserId = view.players[view.activePlayer].userId;
  const wrong = sockOf(other(actingUserId).userId);
  const bad = await emit(wrong, 'game:roll', { matchId });
  check('non-active player is rejected', bad.ok === false, JSON.stringify(bad));
}

// Drive the game to completion using only legal, server-validated actions.
let ended = false;
let guard = 0;
let sawTurnHandoff = false;
let firstActor = view.players[view.activePlayer].userId;

hostSock.on('game:ended', () => { ended = true; });

while (!view.result && guard < 800) {
  guard += 1;
  const color = view.activePlayer;
  const actingUserId = view.players[color].userId;
  if (actingUserId !== firstActor) sawTurnHandoff = true;
  const sock = sockOf(actingUserId);

  let ack;
  if (view.phase === 'AWAITING_ROLL') {
    ack = await emit(sock, 'game:roll', { matchId });
  } else if (view.phase === 'AWAITING_MOVE') {
    const legal = await emit(sock, 'game:legalMoves', { matchId });
    const moves = legal.moves && legal.moves.length > 0 ? legal.moves[0] : [];
    ack = await emit(sock, 'game:move', { matchId, moves });
  } else {
    check('unexpected phase', false, view.phase);
    break;
  }
  if (!ack.ok) { check('intent applied', false, `${view.phase}: ${ack.error}`); break; }
  view = ack.view;
}

check('turns alternated between players', sawTurnHandoff);
check('game reached a result', !!view.result, `after ${guard} intents`);
if (view.result) {
  check('result has winner/points/reason',
    !!view.result.winner && view.result.points >= 1 && !!view.result.reason,
    JSON.stringify(view.result));
}
// Give the broadcast a moment.
await new Promise((r) => setTimeout(r, 200));
check('game:ended broadcast received', ended);

// Live room is evicted after completion → REST view now 404s.
const gone = await fetch(`${HTTP}/games/${matchId}`, {
  headers: { authorization: `Bearer ${host.token}` },
});
check('finished game evicted from live store (404)', gone.status === 404, `got ${gone.status}`);

hostSock.disconnect();
oppSock.disconnect();

console.log(`\nMATCHID ${matchId}`);
console.log(`RESULT ${JSON.stringify(view.result)}`);
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
