/**
 * The two sides of a backgammon game.
 *
 * The engine is intentionally colour-neutral in its rules; "White" and "Black"
 * are just stable identifiers. Presentation layers may map these to any theme
 * (e.g. player skins) without affecting game logic.
 */
export enum Player {
  White = 'WHITE',
  Black = 'BLACK',
}

/** All players, in a stable order. */
export const PLAYERS: readonly Player[] = [Player.White, Player.Black] as const;

/** Returns the other player. */
export function opponent(player: Player): Player {
  return player === Player.White ? Player.Black : Player.White;
}

/** Type guard for {@link Player}. */
export function isPlayer(value: unknown): value is Player {
  return value === Player.White || value === Player.Black;
}
