import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { UsersService } from '../users/users.service';
import { toUserProfile, type UserProfile } from '../users/user.mapper';
import { validateTelegramInitData } from './telegram/telegram-init-data';
import { TokenService } from './token.service';
import type { AuthTokens, SessionContext } from './auth.types';

/** Result of a successful login. */
export interface AuthResult {
  user: UserProfile;
  tokens: AuthTokens;
}

/**
 * Orchestrates authentication: verifies Telegram init data, provisions the
 * user, and issues tokens.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  /** Logs in (or registers) a player from validated Telegram init data. */
  async loginWithTelegram(initData: string, ctx: SessionContext): Promise<AuthResult> {
    const { botToken, initDataMaxAgeSeconds } = this.config.telegram;
    if (!botToken) {
      throw new ServiceUnavailableException('Telegram authentication is not configured');
    }

    const validation = validateTelegramInitData(initData, botToken, {
      maxAgeSeconds: initDataMaxAgeSeconds,
    });
    if (!validation.ok) {
      throw new UnauthorizedException(`Invalid Telegram data: ${validation.error}`);
    }

    const user = await this.users.upsertFromTelegram(validation.data.user);
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }

    const tokens = await this.tokens.issueTokens(user, ctx);
    return { user: toUserProfile(user), tokens };
  }

  /**
   * Development-only login: issues tokens for a test user without Telegram
   * init data, so the Mini App can be exercised in a plain browser. Hard-gated
   * to non-production environments.
   */
  async devLogin(
    input: { telegramId: number; firstName: string; username?: string },
    ctx: SessionContext,
  ): Promise<AuthResult> {
    if (this.config.isProduction) {
      throw new ForbiddenException('Dev login is disabled in production');
    }
    const user = await this.users.upsertFromTelegram({
      id: input.telegramId,
      firstName: input.firstName,
      ...(input.username ? { username: input.username } : {}),
    });
    const tokens = await this.tokens.issueTokens(user, ctx);
    return { user: toUserProfile(user), tokens };
  }

  /** Exchanges a valid refresh token for a new token pair. */
  async refresh(refreshToken: string, ctx: SessionContext): Promise<AuthTokens> {
    const { tokens } = await this.tokens.rotate(refreshToken, ctx);
    return tokens;
  }

  /** Revokes a refresh token (single-device logout). */
  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }
}
