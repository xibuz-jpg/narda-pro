/** Matchmaking modes that pair two human players. */
export type MatchmakingMode = 'CASUAL' | 'RANKED';

export const MATCHMAKING_MODES: readonly MatchmakingMode[] = ['CASUAL', 'RANKED'];

/** A player's request to be matched, held in a Redis queue. */
export interface Ticket {
  userId: string;
  mode: MatchmakingMode;
  /** Rating used for RANKED proximity pairing. */
  elo: number;
  /** Epoch ms the player entered the queue (drives the expanding window). */
  joinedAt: number;
}

/** Domain event name emitted when two players are paired. */
export const MATCHMAKING_MATCHED = 'matchmaking.matched';

/** Payload of the {@link MATCHMAKING_MATCHED} event. */
export interface MatchmakingMatchedEvent {
  matchId: string;
  userIds: string[];
  mode: MatchmakingMode;
}
