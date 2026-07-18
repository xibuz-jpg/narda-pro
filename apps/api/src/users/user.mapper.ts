import type { UserWithProfile } from './user.repository';

/** Public, JSON-safe representation of a user (no BigInt, no internal fields). */
export interface UserProfile {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  displayName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  role: string;
  isTelegramPremium: boolean;
  elo: number;
  stats: {
    gamesPlayed: number;
    wins: number;
    losses: number;
  };
  createdAt: string;
}

/**
 * Maps a persisted user to its public profile. `telegramId` is a BigInt in the
 * DB (not JSON-serializable), so it is emitted as a string.
 */
export function toUserProfile(user: UserWithProfile): UserProfile {
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    username: user.username,
    firstName: user.firstName,
    displayName: user.displayName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    role: user.role,
    isTelegramPremium: user.isTelegramPremium,
    elo: user.rating?.elo ?? 1200,
    stats: {
      gamesPlayed: user.stats?.gamesPlayed ?? 0,
      wins: user.stats?.wins ?? 0,
      losses: user.stats?.losses ?? 0,
    },
    createdAt: user.createdAt.toISOString(),
  };
}
