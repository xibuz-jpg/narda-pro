import { Player, DiceRoll, maxFromHeadFor } from '@narda/game-engine';
import type {
  BoardSnapshot,
  DoublingCube,
  GamePhase,
  GameResult,
  GameStateSnapshot,
  GameVariant,
} from '@narda/game-engine';

/** A seat in a game: a human user or an AI. */
export interface PlayerRef {
  userId: string | null;
  isAI: boolean;
  aiLevel?: string;
}

/**
 * The full live game record stored in Redis while a match is in progress: the
 * seat→player mapping plus the authoritative engine snapshot.
 */
export interface GameRoom {
  matchId: string;
  /** Match mode (CASUAL / RANKED / …) — drives progression on completion. */
  mode: string;
  players: Record<Player, PlayerRef>;
  state: GameStateSnapshot;
  /** Whose clock is running, when it started, and when it expires (epoch ms). */
  deadline?: { player: Player; at: number; startedAt: number };
  /** Per-player reserve time bank (ms), depleted by overage beyond the per-move grace. */
  reserve?: Record<Player, number>;
}

/**
 * The client-facing view of a game. Backgammon has no hidden information, so the
 * whole board is public; we simply omit the internal event log and config from
 * the live broadcast (fetched separately when needed).
 */
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
  /** Long Narda head-rule allowance for the current move (1, or 2 on opening doubles). */
  maxFromHead: number;
  /** The active player's clock: when it expires (epoch ms) and their reserve bank (ms). */
  clock: { player: Player; at: number; reserve: number } | null;
}

export function toGameView(room: GameRoom): GameView {
  const { state } = room;
  const variant = state.config.variant;
  const isOpening = !state.events.some((event) => event.type === 'TURN_PLAYED');
  const maxFromHead =
    variant === 'LONG_NARDA' && state.dice
      ? maxFromHeadFor(new DiceRoll(state.dice.first, state.dice.second), isOpening)
      : 1;
  return {
    matchId: room.matchId,
    variant,
    maxFromHead,
    players: {
      [Player.White]: {
        userId: room.players[Player.White].userId,
        isAI: room.players[Player.White].isAI,
      },
      [Player.Black]: {
        userId: room.players[Player.Black].userId,
        isAI: room.players[Player.Black].isAI,
      },
    },
    activePlayer: state.activePlayer,
    phase: state.phase,
    board: state.board,
    dice: state.dice,
    cube: state.cube,
    pendingDoubler: state.pendingDoubler,
    result: state.result,
    clock:
      room.deadline && room.reserve
        ? {
            player: room.deadline.player,
            at: room.deadline.at,
            reserve: room.reserve[room.deadline.player],
          }
        : null,
  };
}
