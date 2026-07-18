import { Player, opponent } from '../domain/player';
import { Board } from '../domain/board';
import { DiceRoll, type Die } from '../domain/dice';
import type { RandomSource } from '../domain/rng';
import { generateTurns, type Turn } from '../domain/turn';
import type { GameState } from '../domain/game-state';
import { evaluate } from './evaluate';
import { evaluateLong } from '../long-narda/evaluate';

/** AI difficulty tiers. */
export type AiLevel = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT' | 'GRANDMASTER';

/** All 21 distinct dice rolls with their probabilities (out of 36). */
const DICE_ROLLS: ReadonlyArray<{ roll: DiceRoll; p: number }> = (() => {
  const out: { roll: DiceRoll; p: number }[] = [];
  for (let a = 1; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) {
      out.push({ roll: new DiceRoll(a as Die, b as Die), p: a === b ? 1 / 36 : 2 / 36 });
    }
  }
  return out;
})();

interface LevelConfig {
  /** Use the full positional evaluation vs. a simple race-only one. */
  full: boolean;
  /** Random score perturbation magnitude (weaker play, more human error). */
  noise: number;
  /** Number of top 1-ply candidates to refine with 2-ply lookahead (0 = none). */
  lookaheadCandidates: number;
}

const LEVELS: Record<AiLevel, LevelConfig> = {
  EASY: { full: false, noise: 8, lookaheadCandidates: 0 },
  MEDIUM: { full: true, noise: 3, lookaheadCandidates: 0 },
  HARD: { full: true, noise: 0, lookaheadCandidates: 0 },
  EXPERT: { full: true, noise: 0, lookaheadCandidates: 6 },
  GRANDMASTER: { full: true, noise: 0, lookaheadCandidates: 12 },
};

/** Race-only evaluation used by the easiest level. */
function simpleEvaluate(board: Board, player: Player): number {
  const opp = opponent(player);
  return (
    board.off(player) * 16 -
    board.off(opp) * 16 +
    (board.pipCount(opp) - board.pipCount(player)) * 0.4 -
    board.bar(player) * 10
  );
}

/**
 * Chooses a turn for the AI. All levels pick from the *legal* turns produced by
 * the engine, so the AI can never cheat; they differ only in how well they
 * judge which legal turn is best.
 */
export function chooseTurn(
  board: Board,
  player: Player,
  roll: DiceRoll,
  level: AiLevel,
  rng: RandomSource,
): Turn {
  const turns = generateTurns(board, player, roll);
  if (turns.length === 0) return { moves: [], resultingBoard: board };
  if (turns.length === 1) return turns[0]!;

  const config = LEVELS[level];
  const scoreOf = (b: Board): number =>
    config.full ? evaluate(b, player) : simpleEvaluate(b, player);

  // 1-ply: score every legal turn (with optional noise for weaker levels).
  const ranked = turns
    .map((turn) => ({
      turn,
      score: scoreOf(turn.resultingBoard) + noise(config.noise, rng),
    }))
    .sort((a, b) => b.score - a.score);

  // Strong levels refine the top candidates with a 2-ply expectimax search.
  if (config.lookaheadCandidates > 0) {
    const candidates = ranked.slice(0, config.lookaheadCandidates);
    let best = candidates[0]!;
    let bestValue = -Infinity;
    for (const c of candidates) {
      const value = expectedAfterReply(c.turn.resultingBoard, player);
      if (value > bestValue) {
        bestValue = value;
        best = c;
      }
    }
    return best.turn;
  }

  return ranked[0]!.turn;
}

/**
 * Expected evaluation after the opponent's best reply, averaged over all dice
 * rolls (2-ply expectimax). The opponent is assumed to minimise our score.
 */
function expectedAfterReply(board: Board, player: Player): number {
  const opp = opponent(player);
  let total = 0;
  for (const { roll, p } of DICE_ROLLS) {
    const replies = generateTurns(board, opp, roll);
    let worst = evaluate(board, player);
    for (const reply of replies) {
      const value = evaluate(reply.resultingBoard, player);
      if (value < worst) worst = value;
    }
    total += p * worst;
  }
  return total;
}

function noise(magnitude: number, rng: RandomSource): number {
  if (magnitude <= 0) return 0;
  const scale = 1000;
  return (rng.nextInt(0, 2 * magnitude * scale) / scale) - magnitude;
}

/**
 * Variant-aware AI move: uses the game's own legal turns (so it is always
 * rule-correct for backgammon *or* Long Narda) and the matching evaluation.
 * Long Narda uses a 1-ply scored selection (no blots to look ahead for).
 */
export function chooseTurnFor(game: GameState, level: AiLevel, rng: RandomSource): Turn {
  if (game.dice === null) return { moves: [], resultingBoard: game.board };
  if (game.config.variant !== 'LONG_NARDA') {
    return chooseTurn(game.board, game.activePlayer, game.dice, level, rng);
  }

  const turns = game.legalTurns();
  if (turns.length <= 1) return turns[0] ?? { moves: [], resultingBoard: game.board };

  const player = game.activePlayer;
  // In Long Narda move choice matters less (the head rule forces much of the
  // play), so tiers are spread wider: EASY plays randomly, MEDIUM races with
  // noise, HARD+ use the full positional evaluation.
  if (level === 'EASY') return turns[rng.nextInt(0, turns.length - 1)]!;

  // Structure (blocks) is what wins Long Narda, so all skilled tiers use the
  // full evaluation; MEDIUM just adds enough noise to make human errors.
  const noiseMag = level === 'MEDIUM' ? 4 : 0;
  return turns
    .map((turn) => ({ turn, score: evaluateLong(turn.resultingBoard, player) + noise(noiseMag, rng) }))
    .sort((a, b) => b.score - a.score)[0]!.turn;
}
