import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TelegramUser } from '../auth/telegram/telegram-init-data';

/** User with its 1-1 rating and stats eagerly loaded. */
export type UserWithProfile = Prisma.UserGetPayload<{
  include: { rating: true; stats: true };
}>;

/** A friend and the head-to-head record against the current user. */
export interface FriendSummary {
  id: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
  /** Finished private games played together. */
  games: number;
  /** Times the friend beat you. */
  theirWins: number;
  /** Times you beat the friend (i.e. the friend's losses vs you). */
  yourWins: number;
}

/**
 * Persistence boundary for users (Repository pattern). All Prisma access for
 * the user aggregate lives here; services depend on this, never on Prisma
 * directly — keeping the ORM at the infrastructure edge.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { rating: true, stats: true },
    });
  }

  findByTelegramId(telegramId: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { telegramId } });
  }

  /**
   * The user's friends — everyone they've played a private (invite) game with —
   * each with the head-to-head record. A friend appears as soon as a private
   * match exists (even mid-game); the win/loss tallies count finished games.
   */
  async findFriendsWithStats(userId: string): Promise<FriendSummary[]> {
    const matches = await this.prisma.match.findMany({
      where: { mode: 'PRIVATE', players: { some: { userId } } },
      select: { status: true, winnerId: true, players: { select: { userId: true } } },
    });

    const agg = new Map<string, { games: number; theirWins: number; yourWins: number }>();
    for (const m of matches) {
      const opponentId = m.players.map((p) => p.userId).find((id) => id && id !== userId);
      if (!opponentId) continue;
      const rec = agg.get(opponentId) ?? { games: 0, theirWins: 0, yourWins: 0 };
      if (m.status === 'FINISHED') {
        rec.games += 1;
        if (m.winnerId === opponentId) rec.theirWins += 1;
        else if (m.winnerId === userId) rec.yourWins += 1;
      }
      agg.set(opponentId, rec);
    }

    const friendIds = [...agg.keys()];
    if (friendIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: { id: true, firstName: true, displayName: true, username: true, photoUrl: true },
    });

    return users
      .map((u) => {
        const rec = agg.get(u.id)!;
        return {
          id: u.id,
          name: u.displayName ?? u.firstName,
          username: u.username,
          photoUrl: u.photoUrl,
          games: rec.games,
          theirWins: rec.theirWins,
          yourWins: rec.yourWins,
        };
      })
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
  }

  /** Sets the player's chosen display name (their in-game name). */
  updateDisplayName(id: string, displayName: string): Promise<UserWithProfile> {
    return this.prisma.user.update({
      where: { id },
      data: { displayName },
      include: { rating: true, stats: true },
    });
  }

  /**
   * Creates the user on first sign-in, or refreshes their mutable Telegram
   * profile fields on subsequent sign-ins. New users get initialized stats and
   * rating rows in the same transaction.
   */
  upsertFromTelegram(tg: TelegramUser): Promise<UserWithProfile> {
    const telegramId = BigInt(tg.id);
    const profile = {
      username: tg.username ?? null,
      firstName: tg.firstName,
      lastName: tg.lastName ?? null,
      languageCode: tg.languageCode ?? null,
      photoUrl: tg.photoUrl ?? null,
      isTelegramPremium: tg.isPremium ?? false,
    };

    return this.prisma.user.upsert({
      where: { telegramId },
      update: { ...profile, lastSeenAt: new Date() },
      create: {
        telegramId,
        ...profile,
        lastSeenAt: new Date(),
        stats: { create: {} },
        rating: { create: {} },
      },
      include: { rating: true, stats: true },
    });
  }
}
