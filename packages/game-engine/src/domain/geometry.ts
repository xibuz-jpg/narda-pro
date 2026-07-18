import { Player } from './player';

/**
 * Board geometry & coordinate conventions.
 *
 * ── Coordinate system ─────────────────────────────────────────────────────
 * Points are numbered 1..24 using a single absolute frame (White's frame):
 *
 *   13 14 15 16 17 18   19 20 21 22 23 24
 *  ┌─────────────────┬─────────────────┐
 *  │  outer board    │  BLACK home     │   ← Black bears off here (19..24)
 *  │                 │                 │
 *  │  White home     │  outer board    │   ← White bears off here (1..6)
 *  └─────────────────┴─────────────────┘
 *   12 11 10  9  8  7    6  5  4  3  2  1
 *
 * ── Direction of travel ───────────────────────────────────────────────────
 *   • White moves from high points to low points (24 → 1) and bears off past 1.
 *   • Black moves from low points to high points (1 → 24) and bears off past 24.
 *
 * ── Bar re-entry ──────────────────────────────────────────────────────────
 * A hit checker goes to the bar and must re-enter in the *opponent's* home
 * board with a die equal to the entry distance:
 *   • White enters on point (25 − die): die 1 → 24 … die 6 → 19.
 *   • Black enters on point (die):      die 1 → 1  … die 6 → 6.
 *
 * All of these relationships are expressed by {@link pipDistance}, which gives
 * the number of pips a checker at a given position must travel to bear off.
 */

/** Number of playable points. */
export const POINT_COUNT = 24;

/** Checkers each player controls. */
export const CHECKERS_PER_PLAYER = 15;

/** Valid die faces. */
export const MIN_DIE = 1;
export const MAX_DIE = 6;

const WHITE_HOME: readonly number[] = [1, 2, 3, 4, 5, 6];
const BLACK_HOME: readonly number[] = [19, 20, 21, 22, 23, 24];

/** The six points forming each player's home (inner) board. */
export const HOME_BOARD: Readonly<Record<Player, readonly number[]>> = {
  [Player.White]: WHITE_HOME,
  [Player.Black]: BLACK_HOME,
};

/** The home-board points for `player` (definite, allocation-free accessor). */
export function homeBoard(player: Player): readonly number[] {
  return player === Player.White ? WHITE_HOME : BLACK_HOME;
}

/**
 * Direction of travel as a signed step applied to a point number.
 * White: -1 (24→1). Black: +1 (1→24).
 */
export function direction(player: Player): 1 | -1 {
  return player === Player.White ? -1 : 1;
}

/**
 * The point a checker re-enters on from the bar for a given die.
 * @throws if `die` is out of range.
 */
export function entryPoint(player: Player, die: number): number {
  assertDie(die);
  return player === Player.White ? 25 - die : die;
}

/**
 * Pip distance from a board point to that player's bear-off tray.
 * Equivalently: the exact die needed to bear a checker off this point.
 *
 *   White at point n  → n pips.
 *   Black at point n  → 25 − n pips.
 *
 * A checker on the bar always has a pip distance of 25.
 */
export function pipDistance(player: Player, point: number): number {
  assertPoint(point);
  return player === Player.White ? point : 25 - point;
}

/** Pip distance for a checker sitting on the bar (always 25). */
export const BAR_PIP = 25;

/** True if `point` lies inside `player`'s home board. */
export function isInHomeBoard(player: Player, point: number): boolean {
  return homeBoard(player).includes(point);
}

/** True if `point` is a legal board coordinate (1..24). */
export function isValidPoint(point: number): boolean {
  return Number.isInteger(point) && point >= 1 && point <= POINT_COUNT;
}

/** True if `die` is a legal die face (1..6). */
export function isValidDie(die: number): boolean {
  return Number.isInteger(die) && die >= MIN_DIE && die <= MAX_DIE;
}

/** @throws {RangeError} if `point` is not 1..24. */
export function assertPoint(point: number): void {
  if (!isValidPoint(point)) {
    throw new RangeError(`Invalid point ${point}; expected an integer in 1..${POINT_COUNT}`);
  }
}

/** @throws {RangeError} if `die` is not 1..6. */
export function assertDie(die: number): void {
  if (!isValidDie(die)) {
    throw new RangeError(`Invalid die ${die}; expected an integer in ${MIN_DIE}..${MAX_DIE}`);
  }
}
