import { Player } from '../domain/player';

/**
 * Long Narda (uzun nardi) geometry.
 *
 * Unlike standard backgammon, both players travel the board in the SAME
 * rotational direction, starting from diagonally opposite "head" points and
 * bearing off in their own home quadrant. We model this with a per-player pip
 * coordinate so the rules stay simple and symmetric:
 *
 *   pipToOff(player, point) — pips a checker must still travel to bear off
 *                             (24 = on the head, 1 = one step from off).
 *   pointAtPip(player, pip) — the inverse: the physical point for a pip value.
 *
 * Physical layout (White's frame): White head = point 24, home = points 1–6.
 * Black head = point 12, home = points 13–18. Both move toward lower pips.
 */

/** Pips from the head to bear off (a full lap of the board). */
export const HEAD_PIP = 24;

/** Pips a checker at `point` must travel to bear off (1..24). */
export function pipToOff(player: Player, point: number): number {
  if (player === Player.White) return point;
  // Black: point 13 → 1 pip … 24 → 12 … 1 → 13 … 12 → 24 (head).
  return point >= 13 ? point - 12 : point + 12;
}

/** The physical point for a given pip value (1..24). */
export function pointAtPip(player: Player, pip: number): number {
  if (player === Player.White) return pip;
  return pip <= 12 ? pip + 12 : pip - 12;
}

/** The head point where all 15 checkers start (White 24, Black 12). */
export function headPoint(player: Player): number {
  return pointAtPip(player, HEAD_PIP);
}

/** True if `point` is in `player`'s home board (pip 1..6). */
export function isInHome(player: Player, point: number): boolean {
  const pip = pipToOff(player, point);
  return pip >= 1 && pip <= 6;
}
