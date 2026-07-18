/* Long Narda: self-play + AI-level matchup to confirm the variant + AI work. */
import { GameState, GamePhase, Player, SeededRandom, chooseTurnFor } from '@narda/game-engine';

function playAiGame(levelWhite, levelBlack, seed) {
  const rng = new SeededRandom(seed);
  let g = GameState.start(rng, { variant: 'LONG_NARDA', useDoublingCube: false });
  let guard = 0;
  while (!g.isOver && guard++ < 8000) {
    if (g.phase === GamePhase.AwaitingRoll) g = g.roll(rng);
    else if (g.phase === GamePhase.AwaitingMove) {
      const level = g.activePlayer === Player.White ? levelWhite : levelBlack;
      const turn = chooseTurnFor(g, level, rng);
      g = g.playTurn([...turn.moves]);
    } else break;
  }
  return g.result;
}

const A = process.argv[2] || 'GRANDMASTER';
const B = process.argv[3] || 'EASY';
const N = Number(process.argv[4] || 20);
let aWins = 0;
let bWins = 0;
let completed = 0;
for (let i = 0; i < N; i += 1) {
  const aIsWhite = i % 2 === 0;
  const res = playAiGame(aIsWhite ? A : B, aIsWhite ? B : A, 500 + i * 17);
  if (!res) continue;
  completed += 1;
  const aWon = (res.winner === Player.White) === aIsWhite;
  if (aWon) aWins += 1;
  else bWins += 1;
}
console.log(`Long Narda AI: ${A} vs ${B} over ${N} games (${completed} completed)`);
console.log(`  ${A}: ${aWins} | ${B}: ${bWins} | ${A} win rate: ${Math.round((aWins / (aWins + bWins)) * 100)}%`);
