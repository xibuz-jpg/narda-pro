import type { UserRole } from '@prisma/client';

/** JWT access-token payload. */
export interface AccessTokenPayload {
  /** User id (subject). */
  sub: string;
  role: UserRole;
}

/** The authenticated principal attached to each request by the guard. */
export interface AuthUser {
  id: string;
  role: UserRole;
  telegramId: string;
}

/** Tokens returned to the client on login/refresh. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access-token lifetime in seconds. */
  expiresIn: number;
}

/** Request metadata captured with each refresh-token record. */
export interface SessionContext {
  ip?: string;
  userAgent?: string;
}
