import { io } from 'socket.io-client';
import { createHmac } from 'node:crypto';

const HTTP = 'http://localhost:3000/api/v1';
const WS = 'http://localhost:3000/game';
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
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
  })).json();
  return { userId: res.user.id, token: res.tokens.accessToken };
}

const connect = (token) => {
  const s = io(WS, { auth: { token }, transports: ['websocket'], forceNew: true });
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${e}`); } };

const host = await login(999123, 'Host');
const opp = await login(888222, 'Opp');
const spec = await login(777333, 'Spectator');

async function createGame(token, opponentId) {
  return (await fetch(`${HTTP}/games`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ opponentId }),
  })).json();
}

// ── Part 1: spectator + presence + reconnect ──────────────────────────────
const gameA = await createGame(host.token, opp.userId);
const hostSock = await connect(host.token);
const presenceSeen = [];
hostSock.on('game:presence', (p) => presenceSeen.push(p.online.length));

await emit(hostSock, 'game:join', { matchId: gameA.matchId });
let oppSock = await connect(opp.token);
const oppJoin = await emit(oppSock, 'game:join', { matchId: gameA.matchId });
check('player join returns role=player', oppJoin.role === 'player', JSON.stringify(oppJoin.role));

const specSock = await connect(spec.token);
const specJoin = await emit(specSock, 'game:join', { matchId: gameA.matchId });
check('third user joins as spectator', specJoin.ok && specJoin.role === 'spectator', JSON.stringify(specJoin));

const specAct = await emit(specSock, 'game:roll', { matchId: gameA.matchId });
check('spectator cannot send intents', specAct.ok === false, JSON.stringify(specAct));

await sleep(150);
check('presence broadcast reached 2 online players', Math.max(0, ...presenceSeen) === 2, JSON.stringify(presenceSeen));

// Reconnect: drop opp, expect presence drop, then rejoin and resume state.
const presenceDrop = once(hostSock, 'game:presence', 4000);
oppSock.disconnect();
const afterDrop = await presenceDrop;
check('disconnect drops player from presence', afterDrop.online.length === 1, JSON.stringify(afterDrop.online));

const oppSock2 = await connect(opp.token);
const rejoin = await emit(oppSock2, 'game:join', { matchId: gameA.matchId });
check('reconnect resumes authoritative state', rejoin.ok && !!rejoin.view && rejoin.view.matchId === gameA.matchId, JSON.stringify(rejoin.error));

hostSock.disconnect(); specSock.disconnect(); oppSock2.disconnect();

// ── Part 2: turn timeout → forfeit ────────────────────────────────────────
const gameB = await createGame(host.token, opp.userId);
const starter = gameB.activePlayer; // this player is on the clock and will time out
const expectedWinner = starter === 'WHITE' ? 'BLACK' : 'WHITE';

const hb = await connect(host.token);
const ob = await connect(opp.token);
await emit(hb, 'game:join', { matchId: gameB.matchId });
await emit(ob, 'game:join', { matchId: gameB.matchId });

const endedP = once(hb, 'game:ended', 12000);
console.log('  ...waiting for turn timeout (~5s, nobody acts)');
const ended = await endedP;
check('game ends automatically on turn timeout', !!ended?.result, JSON.stringify(ended));
check('timeout forfeits the player on the clock', ended?.result?.winner === expectedWinner,
  `winner=${ended?.result?.winner} expected=${expectedWinner}`);
check('forfeit result reason is FORFEIT', ended?.result?.reason === 'FORFEIT', JSON.stringify(ended?.result));

hb.disconnect(); ob.disconnect();

console.log(`\nMATCHID_B ${gameB.matchId}`);
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
