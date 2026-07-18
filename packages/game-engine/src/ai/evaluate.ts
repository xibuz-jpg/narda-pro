import { Player, opponent } from '../domain/player';
import { Board } from '../domain/board';
import { POINT_COUNT, direction, pipDistance, isInHomeBoard } from '../domain/geometry';

/**
 * Static evaluation of a board position from `player`'s perspective — higher is
 * better. This is the heart of the AI: a weighted sum of the classic backgammon
 * positional factors (race, safety, structure, progress).
 *
 * The weights are deliberately readable rather than tuned to perfection; they
 * produce a competent opponent and are the natural place to strengthen the AI.
 */

const W_OFF = 16; // per borne-off checker (progress toward winning)
const W_PIP = 0.4; // race: own pip vs opponent pip
const W_BAR_SELF = 12; // penalty per own checker stuck on the bar
const W_BAR_OPP = 8; // reward for pinning an opponent on the bar
const W_MADE_POINT = 2; // per made point (2+ checkers)
const W_HOME_POINT = 1.6; // extra for made points in the home board
const W_PRIME = 0.6; // per-square-squared bonus for a wall of made points

export function evaluate(board: Board, player: Player): number {
  const opp = opponent(player);
  let score = 0;

  // Progress: borne-off checkers dominate as the game resolves.
  score += board.off(player) * W_OFF;
  score -= board.off(opp) * W_OFF;

  // Race: fewer pips than the opponent is good.
  score += (board.pipCount(opp) - board.pipCount(player)) * W_PIP;

  // The bar: your checkers there are wasted; theirs are trapped.
  score -= board.bar(player) * W_BAR_SELF;
  score += board.bar(opp) * W_BAR_OPP;

  // Points and blots.
  for (let point = 1; point <= POINT_COUNT; point += 1) {
    const state = board.pointState(point);
    if (state.owner !== player) continue;
    if (state.count >= 2) {
      score += W_MADE_POINT;
      if (isInHomeBoard(player, point)) score += W_HOME_POINT;
    } else if (state.count === 1) {
      score -= blotPenalty(board, player, point);
    }
  }

  // Priming: a wall of consecutive made points is hard to pass.
  score += primeBonus(board, player);

  return score;
}

/** Penalty for a blot on `point`, scaled by how easily it is hit and by loss. */
function blotPenalty(board: Board, player: Player, point: number): number {
  const opp = opponent(player);
  const dir = direction(opp);
  let directShots = 0;
  for (let die = 1; die <= 6; die += 1) {
    const from = point - dir * die; // opponent square that lands on `point`
    if (from >= 1 && from <= POINT_COUNT && board.ownerOf(from) === opp) {
      directShots += 1;
    }
  }
  const hitRisk = directShots / 6; // rough per-die probability
  const pipAtRisk = pipDistance(player, point); // pips lost if sent back
  return hitRisk * (3 + pipAtRisk * 0.12);
}

/** Bonus for the longest run of consecutive made points (a prime). */
function primeBonus(board: Board, player: Player): number {
  let best = 0;
  let run = 0;
  for (let point = 1; point <= POINT_COUNT; point += 1) {
    const state = board.pointState(point);
    if (state.owner === player && state.count >= 2) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best >= 2 ? best * best * W_PRIME : 0;
}
