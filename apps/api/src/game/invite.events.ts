/** Emitted when a friend accepts an invite and the match is created. */
export const INVITE_ACCEPTED = 'invite.accepted';

/**
 * Payload of {@link INVITE_ACCEPTED}. Carries the host's id so the matchmaking
 * gateway can push `matchmaking:found` to the waiting host's personal room —
 * the friend already learns the matchId from the REST accept response.
 */
export interface InviteAcceptedEvent {
  hostUserId: string;
  matchId: string;
  mode: string;
}
