import { Injectable, NotFoundException } from '@nestjs/common';
import type { UserRole, UserStatus } from '@prisma/client';
import { UserRepository, type FriendSummary, type UserWithProfile } from './user.repository';
import { toUserProfile, type UserProfile } from './user.mapper';
import { RedisService } from '../redis/redis.service';
import type { TelegramUser } from '../auth/telegram/telegram-init-data';

/** Minimal user data the auth guard needs, cached in Redis. */
export interface AuthContext {
  id: string;
  role: UserRole;
  status: UserStatus;
  telegramId: string;
}

/** How long the auth context is cached (seconds). Short, so bans take effect fast. */
const AUTH_CACHE_TTL = 30;
const authCacheKey = (id: string): string => `auth:user:${id}`;

/**
 * Application service for the user aggregate. Orchestrates the repository and
 * exposes profile mapping; holds no persistence logic itself.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UserRepository,
    private readonly redis: RedisService,
  ) {}

  findById(id: string): Promise<UserWithProfile | null> {
    return this.repo.findById(id);
  }

  /**
   * Returns the minimal auth context for a user, served from a short-lived
   * Redis cache to keep the authentication hot path off the database. Cache is
   * invalidated on profile/status changes via {@link invalidateAuthContext}.
   */
  async getAuthContext(id: string): Promise<AuthContext | null> {
    const cached = await this.redis.getJson<AuthContext>(authCacheKey(id));
    if (cached) return cached;

    const user = await this.repo.findById(id);
    if (!user) return null;

    const context: AuthContext = {
      id: user.id,
      role: user.role,
      status: user.status,
      telegramId: user.telegramId.toString(),
    };
    await this.redis.setJson(authCacheKey(id), context, AUTH_CACHE_TTL);
    return context;
  }

  /** Drops the cached auth context (call after ban/role/status changes). */
  async invalidateAuthContext(id: string): Promise<void> {
    await this.redis.del(authCacheKey(id));
  }

  async getProfile(id: string): Promise<UserProfile> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return toUserProfile(user);
  }

  /** The user's friends (private-game opponents) with head-to-head records. */
  getFriends(id: string): Promise<FriendSummary[]> {
    return this.repo.findFriendsWithStats(id);
  }

  /** Updates the player's chosen display name and returns the fresh profile. */
  async updateDisplayName(id: string, displayName: string): Promise<UserProfile> {
    const user = await this.repo.updateDisplayName(id, displayName);
    return toUserProfile(user);
  }

  async upsertFromTelegram(tg: TelegramUser): Promise<UserWithProfile> {
    return this.repo.upsertFromTelegram(tg);
  }
}
