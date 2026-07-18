import type {
  BoardSnapshot,
  DoublingCube,
  GamePhase,
  GameResult,
  GameVariant,
  Move,
  Player,
} from '@narda/game-engine';

/** Client mirror of the server's game view (no hidden info in narda). */
export interface GameView {
  matchId: string;
  variant: GameVariant;
  players: Record<Player, { userId: string | null; isAI: boolean }>;
  activePlayer: Player;
  phase: GamePhase;
  board: BoardSnapshot;
  dice: { first: number; second: number } | null;
  cube: DoublingCube;
  pendingDoubler: Player | null;
  result: GameResult | null;
  maxFromHead: number;
  /** Active player's clock: expiry (epoch ms) + their reserve bank (ms). */
  clock: { player: Player; at: number; reserve: number } | null;
}

export type { Move };
