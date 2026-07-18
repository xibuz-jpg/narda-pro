/* A scripted opponent: dev-logs in, matchmakes CASUAL, and plays legal moves
   until the game ends. Used to exercise the browser client end-to-end. */
import { io } from 'socket.io-client';
import { GameState, generateTurns } from '@narda/game-engine';

const HTTP = 'http://localhost:3000/api/v1';
const WS = 'http://localhost:3000';

const telegramId = Number(process.env.BOT_ID || 700700700);
const mode = process.env.MODE || 'CASUAL';

const res = await (await fetch(`${HTTP}/auth/dev`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ telegramId, firstName: 'Bot' }),
})).json();
const token = res.tokens.accessToken;
const myUserId = res.user.id;
console.log('opponent-bot logged in as', myUserId);

const mm = io(`${WS}/matchmaking`, { auth: { token }, transports: ['websocket'], forceNew: true });
await new Promise((r) => mm.on('connect', r));

const matchId = await new Promise((resolve) => {
  mm.on('matchmaking:found', (p) => resolve(p.matchId));
  mm.emit('matchmaking:join', { mode }, (a) => console.log('bot searching:', a.ok, mode));
});
console.log('bot matched →', matchId);
mm.disconnect();

const game = io(`${WS}/game`, { auth: { token }, transports: ['websocket'], forceNew: true });
await new Promise((r) => game.on('connect', r));

const ack = (ev, body) => new Promise((r) => game.emit(ev, body, r));
let done = false;

const play = async (view) => {
  if (!view || view.result) return;
  const myColor = view.players.WHITE.userId === myUserId ? 'WHITE'
    : view.players.BLACK.userId === myUserId ? 'BLACK' : null;
  if (myColor !== view.activePlayer) return;

  if (view.phase === 'AWAITING_ROLL') {
    await ack('game:roll', { matchId });
  } else if (view.phase === 'AWAITING_MOVE' && view.dice) {
    // Rebuild the position and pick any legal complete turn.
    const gs = GameState.fromSnapshot({
      board: view.board, activePlayer: view.activePlayer, phase: 'AWAITING_MOVE',
      dice: view.dice, cube: view.cube, pendingDoubler: view.pendingDoubler,
      result: null, config: { useDoublingCube: true, maxCube: 64, jacobyRule: false }, events: [],
    });
    const turns = generateTurns(gs.board, myColor, gs.dice);
    const moves = turns[0] ? turns[0].moves : [];
    await ack('game:move', { matchId, moves });
  }
};

game.on('game:state', (view) => {
  if (view.result && !done) {
    done = true;
    console.log('bot sees result:', JSON.stringify(view.result));
    setTimeout(() => { game.disconnect(); process.exit(0); }, 300);
    return;
  }
  void play(view);
});

const joined = await ack('game:join', { matchId });
void play(joined.view);

// Safety timeout.
setTimeout(() => { console.log('bot timeout'); game.disconnect(); process.exit(1); }, 60000);
