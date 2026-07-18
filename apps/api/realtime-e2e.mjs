import { io } from 'socket.io-client';
import { createHmac } from 'node:crypto';

const HTTP = 'http://localhost:3000/api/v1';
const WS = 'http://localhost:3000/realtime';
const TOKEN = process.env.TEST_BOT_TOKEN;

function sign(fields, token) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};
const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`timeout: ${label}`)), ms))]);

// Log in to obtain a real access token.
const user = JSON.stringify({ id: 999123, first_name: 'E2E', username: 'e2e_tester' });
const initData = sign({ user, auth_date: String(Math.floor(Date.now() / 1000)) }, TOKEN);
const login = await (await fetch(`${HTTP}/auth/telegram`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ initData }),
})).json();
const access = login?.tokens?.accessToken;
check('obtained access token via HTTP login', typeof access === 'string');

// 1) Authenticated socket connects and receives `connected`.
const socket = io(WS, { auth: { token: access }, transports: ['websocket'], forceNew: true });
try {
  const connected = await withTimeout(
    new Promise((res, rej) => {
      socket.on('connected', res);
      socket.on('connect_error', rej);
    }),
    5000,
    'connected',
  );
  check('authenticated socket receives `connected`', connected?.userId === login?.user?.id, JSON.stringify(connected));

  // 2) Heartbeat ping → pong.
  socket.emit('ping');
  const pong = await withTimeout(new Promise((res) => socket.once('pong', res)), 5000, 'pong');
  check('ping → pong heartbeat', typeof pong?.serverTime === 'number');

  // 3) Presence count (via ack) is at least 1.
  const presence = await withTimeout(
    new Promise((res) => socket.emit('presence:count', res)),
    5000,
    'presence:count',
  );
  check('presence count >= 1 while connected', presence?.online >= 1, JSON.stringify(presence));
} catch (e) {
  check('authenticated socket flow', false, String(e));
} finally {
  socket.disconnect();
}

// 4) Unauthenticated socket is rejected at the handshake.
const anon = io(WS, { transports: ['websocket'], forceNew: true });
try {
  const err = await withTimeout(
    new Promise((res, rej) => {
      anon.on('connect', () => rej(new Error('unexpectedly connected')));
      anon.on('connect_error', (e) => res(e.message));
    }),
    5000,
    'connect_error',
  );
  check('unauthenticated socket rejected', String(err).includes('unauthorized'), String(err));
} catch (e) {
  check('unauthenticated socket rejected', false, String(e));
} finally {
  anon.disconnect();
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
