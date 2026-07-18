import { io } from 'socket.io-client';
import { createHmac } from 'node:crypto';

const A = 'http://localhost:3000'; // node A
const B = 'http://localhost:3001'; // node B
const HTTP = `${A}/api/v1`;
const TOKEN = process.env.TEST_BOT_TOKEN;

const sign = (fields, token) => {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
};
async function login(id, name) {
  const user = JSON.stringify({ id, first_name: name });
  const initData = sign({ user, auth_date: String(Math.floor(Date.now() / 1000)) }, TOKEN);
  const res = await (await fetch(`${HTTP}/auth/telegram`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData }),
  })).json();
  return { userId: res.user.id, token: res.tokens.accessToken };
}
const connect = (base, token) => {
  const s = io(`${base}/game`, { auth: { token }, transports: ['websocket'], forceNew: true });
  return new Promise((res, rej) => { s.on('connect', () => res(s)); s.on('connect_error', rej); });
};
const emit = (s, ev, p) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`ack timeout ${ev}`)), 6000);
  s.emit(ev, p, (a) => { clearTimeout(t); res(a); });
});
const once = (s, ev, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`event timeout ${ev}`)), ms);
  s.once(ev, (d) => { clearTimeout(t); res(d); });
});

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${e}`); } };

const host = await login(999123, 'Host');
const opp = await login(888222, 'Opp');

const created = await (await fetch(`${HTTP}/games`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${host.token}` },
  body: JSON.stringify({ opponentId: opp.userId }),
})).json();
const matchId = created.matchId;

// host → node A (3000), opp → node B (3001)
const hostSock = await connect(A, host.token);
const oppSock = await connect(B, opp.token);
await emit(hostSock, 'game:join', { matchId });
await emit(oppSock, 'game:join', { matchId });
check('players connected to two different nodes', hostSock.connected && oppSock.connected);

// Identify the player on the clock and the two sockets by node.
const starterId = created.players[created.activePlayer].userId;
const starterSock = starterId === host.userId ? hostSock : oppSock;
const otherSock = starterId === host.userId ? oppSock : hostSock; // guaranteed on the OTHER node

// Illegal move by the active player → rejected (records a violation).
const illegal = await emit(starterSock, 'game:move', { matchId, moves: [{ from: 1, to: 2, die: 0, hits: false }] });
check('illegal move rejected', illegal.ok === false, JSON.stringify(illegal));

// Cross-node broadcast: starter (node X) moves; the other node's socket must
// receive the game:state broadcast — only possible via the Redis adapter.
const crossNode = once(otherSock, 'game:state', 6000);
const legal = await emit(starterSock, 'game:legalMoves', { matchId });
const moved = await emit(starterSock, 'game:move', { matchId, moves: legal.moves[0] ?? [] });
check('legal move applied', moved.ok === true, JSON.stringify(moved.error));
const stateOnOtherNode = await crossNode;
check('CROSS-NODE broadcast delivered via Redis adapter', !!stateOnOtherNode?.matchId, JSON.stringify(stateOnOtherNode)?.slice(0, 80));

// Anti-cheat: flood intents from one player → some get rate-limited.
const spam = await Promise.all(
  Array.from({ length: 20 }, () => emit(hostSock, 'game:roll', { matchId }).catch(() => ({ ok: false, error: 'err' }))),
);
const rateLimited = spam.filter((a) => a.error && a.error.includes('Too many actions')).length;
check('intent flood is rate-limited', rateLimited > 0, `rateLimited=${rateLimited}`);

hostSock.disconnect(); oppSock.disconnect();
console.log(`\nMATCHID ${matchId}`);
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
