import { Player, opponent } from '../domain/player';
import { Board } from '../domain/board';
import { POINT_COUNT, assertDie } from '../domain/geometry';
import { BAR, OFF, type Move } from '../domain/move';
import type { Die } from '../domain/dice';
import { pipToOff, pointAtPip, isInHome } from './geometry';

/**
 * Generates every legal single-die move for `player` in **Long Narda**.
 *
 * Key differences from backgammon:
 *   • No hitting — a point with *any* opponent checker is blocked (you may only
 *     land on an empty point or one you already own).
 *   • No bar — since nothing is ever hit.
 *   • Movement is pip-based along the shared travel direction.
 *   • Bearing off works once all checkers are home (exact, or overshoot from the
 *     farthest point).
 *
 * The per-turn "head rule" (at most one checker off the head) is enforced at the
 * turn level, not here.
 */
export function generateSingleMovesLong(board: Board, player: Player, die: Die): Move[] {
  assertDie(die);
  const moves: Move[] = [];
  const canBearOff = allCheckersHome(board, player);
  const foe = opponent(player);

  for (let point = 1; point <= POINT_COUNT; point += 1) {
    if (board.ownerOf(point) !== player) continue;
    const remaining = pipToOff(player, point) - die;

    if (remaining >= 1) {
      const target = pointAtPip(player, remaining);
      // Blocked only by an opponent-occupied point (no hitting in Long Narda).
      if (board.ownerOf(target) !== foe) {
        moves.push({ from: point, to: target, die, hits: false });
      }
      continue;
    }

    if (!canBearOff) continue;
    const pip = pipToOff(player, point);
    const exact = remaining === 0;
    const overshoot = remaining < 0 && !hasHomeCheckerFartherThan(board, player, pip);
    if (exact || overshoot) {
      moves.push({ from: point, to: OFF, die, hits: false });
    }
  }

  return moves;
}

/** True if every one of `player`'s checkers is in their home board. */
export function allCheckersHome(board: Board, player: Player): boolean {
  for (let point = 1; point <= POINT_COUNT; point += 1) {
    if (board.ownerOf(point) === player && !isInHome(player, point)) return false;
  }
  return true;
}

/** Applies a single Long Narda move (never hits) and returns the new board. */
export function applyMoveLong(board: Board, player: Player, move: Move): Board {
  if (move.from === BAR) {
    // Long Narda has no bar; treated as a no-op guard.
    throw new Error('Long Narda has no bar');
  }
  if (move.to === OFF) {
    return board.bearOff(player, move.from);
  }
  return board.removeChecker(player, move.from).addChecker(player, move.to);
}

function hasHomeCheckerFartherThan(board: Board, player: Player, pip: number): boolean {
  for (let point = 1; point <= POINT_COUNT; point += 1) {
    if (
      board.ownerOf(point) === player &&
      isInHome(player, point) &&
      pipToOff(player, point) > pip
    ) {
      return true;
    }
  }
  return false;
}
