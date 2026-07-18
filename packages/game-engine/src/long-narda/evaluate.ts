import { Player, opponent } from '../domain/player';
import { Board } from '../domain/board';
import { POINT_COUNT } from '../domain/geometry';
import { pipToOff } from './geometry';

/**
 * Positional evaluation for Long Narda (higher = better for `player`).
 *
 * There is no hitting, so there are no blots to fear; the game is about the pip
 * race and about building blocks that stall the opponent. The weights favour
 * progress (borne-off + race) and reward made points, especially those that sit
 * directly in front of an opponent checker (a block).
 */
// Long Narda is dominated by the pip race and bearing off; structure is a
// minor tie-breaker, so race weights lead and blocks stay modest.
const W_OFF = 20;
const W_PIP = 0.6;
const W_MADE = 0.2;
const W_BLOCK = 0.5; // a made point standing in front of an opponent checker
const W_PRIME = 0.12;

/** Total pips `player` must still travel (lower is better). */
export function pipCountLong(board: Board, player: Player): number {
  let pips = 0;
  for (let point = 1; point <= POINT_COUNT; point += 1) {
    if (board.ownerOf(point) === player) pips += board.countAt(point) * pipToOff(player, point);
  }
  return pips;
}

export function evaluateLong(board: Board, player: Player): number {
  const foe = opponent(player);
  let score = 0;

  score += board.off(player) * W_OFF;
  score -= board.off(foe) * W_OFF;
  score += (pipCountLong(board, foe) - pipCountLong(board, player)) * W_PIP;

  // The opponent's furthest-back pip: points beyond it can block them.
  let foeMaxPip = 0;
  for (let point = 1; point <= POINT_COUNT; point += 1) {
    if (board.ownerOf(point) === foe) foeMaxPip = Math.max(foeMaxPip, pipToOff(foe, point));
  }

  let run = 0;
  for (let point = 1; point <= POINT_COUNT; point += 1) {
    const state = board.pointState(point);
    if (state.owner === player && state.count >= 2) {
      score += W_MADE;
      // A block only matters if it sits ahead of an opponent checker.
      if (pipToOff(foe, point) < foeMaxPip) score += W_BLOCK;
      run += 1;
    } else {
      if (run >= 2) score += run * run * W_PRIME;
      run = 0;
    }
  }
  if (run >= 2) score += run * run * W_PRIME;

  return score;
}
