import type { Socket } from 'socket.io';
import type { AuthUser } from '../auth/auth.types';

/** A socket that has passed authentication; `data.user` is always present. */
export interface AuthenticatedSocket extends Socket {
  data: { user: AuthUser };
}

/** Well-known realtime event names (server → client and client → server). */
export const RealtimeEvents = {
  Connected: 'connected',
  PresenceUpdate: 'presence:update',
  Pong: 'pong',
} as const;
