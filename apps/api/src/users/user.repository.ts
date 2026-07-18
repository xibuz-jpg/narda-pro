import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TelegramUser } from '../auth/telegram/telegram-init-data';

/** User with its 1-1 rating and stats eagerly loaded. */
export type UserWithProfile = Prisma.UserGetPayload<{
  include: { rating: true; stats: true };
}>;

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
