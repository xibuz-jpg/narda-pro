import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import type { Socket } from 'socket.io';
import { AppConfigService } from '../config/app-config.service';
import { UsersService } from '../users/users.service';
import type { AccessTokenPayload, AuthUser } from '../auth/auth.types';

/**
 * Authenticates WebSocket connections using the same JWT access token as the
 * REST API. Reusable by every gateway (realtime, game) so authentication is
 * uniform across transports.
 *
 * The token is read from the Socket.IO handshake `auth.token` (preferred),
 * falling back to the `Authorization` header or a `token` query param.
 */
@Injectable()
export class WsAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly users: UsersService,
  ) {}

  async authenticate(client: Socket): Promise<AuthUser | null> {
    const token = this.extractToken(client);
    if (!token) return null;

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwt.accessSecret,
      });
    } catch {
      return null;
    }

    const context = await this.users.getAuthContext(payload.sub);
    if (!context || context.status !== UserStatus.ACTIVE) return null;

    return { id: context.id, role: context.role, telegramId: context.telegramId };
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) return authToken;

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim() || null;
    }

    const queryToken = client.handshake.query.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) return queryToken;

    return null;
  }
}
