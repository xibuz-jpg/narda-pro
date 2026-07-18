import type { GameView } from './game.types';

/** Emitted whenever a game's authoritative state changes (move, timeout, …). */
export const GAME_STATE_CHANGED = 'game.state.changed';

export interface GameStateChangedEvent {
  matchId: string;
  view: GameView;
  ended: boolean;
}
