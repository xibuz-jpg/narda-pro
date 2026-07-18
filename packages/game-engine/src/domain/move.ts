import { Player } from './player';
import { Board } from './board';
import {
  POINT_COUNT,
  homeBoard,
  entryPoint,
  pipDistance,
  isInHomeBoard,
  assertDie,
} from './geometry';
import type { Die } from './dice';

/** Sentinel for the bar (where hit checkers wait to re-enter). */
export const BAR = 'bar';
/** Sentinel for the off tray (where borne-off checkers go). */
export const OFF = 'off';

export type Bar = typeof BAR;
export type Off = typeof OFF;

/** Origin of a checker move: a board point (1..24) or the bar. */
export type MoveFrom = number | Bar;
/** Destination of a checker move: a board point (1..24) or the off tray. */
export type MoveTo = number | Off;

/**
 * A single checker move consuming exactly one die.
 *
 * Three shapes exist, distinguished by the `from`/`to` sentinels:
 *   • **enter**   `from: BAR`  → a board point
 *   • **bear off** a board point → `to: OFF`
 *   • **point**   a board point → a board point
 */
export interface Move {
  readonly from: MoveFrom;
  readonly to: MoveTo;
  /** The die value this move consumes. */
  readonly die: Die;
  /** True when the move sends an opponent blot to the bar. */
  readonly hits: boolean;
}

/** Whether a move re-enters a checker from the bar. */
export function isEnter(move: Move): boolean {
  return move.from === BAR;
}

/** Whether a move bears a checker off. */
export function isBearOff(move: Move): boolean {
  return move.to === OFF;
}

/**
 * True when every one of `player`'s checkers is in their home board (and none
 * on the bar) — the precondition for bearing off.
 */
export function allCheckersInHome(board: Board, player: Player): boolean {
  if (board.hasBarCheckers(player)) return false;
  for (let point = 1; point <= POINT_COUNT; point += 1) {
    if (board.ownerOf(point) === player && !isInHomeBoard(player, point)) {
      return false;
    }
  }
  return true;
}

/** True if `player` has a home checker strictly farther from the tray than `pip`. */
function hasHomeCheckerFartherThan(board: Board, player: Player, pip: number): boolean {
  for (const point of homeBoard(player)) {
    if (board.ownerOf(point) === player && pipDistance(player, point) > pip) {
      return true;
    }
  }
  return false;
}

/**
 * Generates every legal move that consumes a single `die` for `player` on
 * `board`, honouring the core movement rules:
 *
 *   1. If any checker is on the bar, the *only* legal moves are re-entries.
 *   2. A checker may land on an empty point, a point it owns, or a lone
 *      opponent blot (hitting it). Points with 2+ opposing checkers are blocked.
 *   3. Bearing off is allowed only when all checkers are home:
 *        • exact bear-off when the die equals the point's pip distance;
 *        • overshoot bear-off with a larger die only from the farthest point.
 *
 * This function does **not** enforce turn-level rules (using the maximum number
 * of dice, the higher-die rule). Those compose in the turn generator (1.3).
 */
export function generateSingleMoves(board: Board, player: Player, die: Die): Move[] {
  assertDie(die);

  // Rule 1: bar checkers must re-enter before anything else may move.
  if (board.hasBarCheckers(player)) {
    const entry = entryPoint(player, die);
    if (board.canLandOn(player, entry)) {
      return [{ from: BAR, to: entry, die, hits: board.isBlot(player, entry) }];
    }
    return [];
  }

  const moves: Move[] = [];
  const canBearOff = allCheckersInHome(board, player);
  const step = player === Player.White ? -die : die;

  for (let point = 1; point <= POINT_COUNT; point += 1) {
    if (board.ownerOf(point) !== player) continue;
    const target = point + step;

    if (target >= 1 && target <= POINT_COUNT) {
      // Rule 2: an ordinary move within the board.
      if (board.canLandOn(player, target)) {
        moves.push({ from: point, to: target, die, hits: board.isBlot(player, target) });
      }
      continue;
    }

    // Target lies past the tray → a bearing-off candidate.
    if (!canBearOff) continue;
    const pip = pipDistance(player, point); // guaranteed <= die here
    const exact = pip === die;
    const overshoot = pip < die && !hasHomeCheckerFartherThan(board, player, pip);
    if (exact || overshoot) {
      moves.push({ from: point, to: OFF, die, hits: false });
    }
  }

  return moves;
}

/**
 * Applies a single {@link Move} to `board`, returning the resulting board.
 *
 * Hits are resolved from the *current* board state rather than trusting the
 * move's `hits` flag, so an out-of-date or hand-built move cannot corrupt the
 * board. The underlying {@link Board} mutators throw on any mechanically
 * impossible move, providing a final safety net.
 */
export function applyMove(board: Board, player: Player, move: Move): Board {
  let next = board;

  // Resolve a hit at the destination first (bearing off never hits).
  if (move.to !== OFF && board.isBlot(player, move.to)) {
    next = next.hitBlot(player, move.to);
  }

  if (move.from === BAR) {
    next = next.enterFromBar(player, move.to as number);
  } else if (move.to === OFF) {
    next = next.bearOff(player, move.from);
  } else {
    next = next.removeChecker(player, move.from).addChecker(player, move.to);
  }

  return next;
}
