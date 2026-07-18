/**
 * Seed script — idempotent baseline data for local development.
 *
 * Creates an admin account and a couple of demo players, each with initialized
 * stats and rating. Safe to run repeatedly (upserts by unique Telegram id).
 *
 * Run with: `pnpm --filter @narda/api db:seed`
 */
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedUser {
  telegramId: bigint;
  firstName: string;
  username: string;
  role: UserRole;
  elo: number;
}

const users: SeedUser[] = [
  { telegramId: 100000001n, firstName: 'Admin', username: 'narda_admin', role: UserRole.ADMIN, elo: 1500 },
  { telegramId: 100000002n, firstName: 'Aziz', username: 'aziz_dev', role: UserRole.PLAYER, elo: 1240 },
  { telegramId: 100000003n, firstName: 'Dilnoza', username: 'dilnoza', role: UserRole.PLAYER, elo: 1310 },
];

async function main(): Promise<void> {
  for (const seed of users) {
    await prisma.user.upsert({
      where: { telegramId: seed.telegramId },
      update: { firstName: seed.firstName, username: seed.username, role: seed.role },
      create: {
        telegramId: seed.telegramId,
        firstName: seed.firstName,
        username: seed.username,
        role: seed.role,
        stats: { create: {} },
        rating: { create: { elo: seed.elo, peakElo: seed.elo } },
      },
    });
    // eslint-disable-next-line no-console
    console.log(`Seeded user @${seed.username} (${seed.role})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
