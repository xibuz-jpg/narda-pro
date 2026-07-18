import { Injectable, Logger } from '@nestjs/common';
import type { GameEndReason, MatchMode, PlayerColor, Prisma } from '@prisma/client';

/** ELO K-factor — how much a single result can move a rating. */
const K_FACTOR = 32;

/** Expected score of A vs B under the ELO model. */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** New ELO after a result (score: 1 win, 0 loss). */
function nextElo(rating: number, expected: number, score: number): number {
  return Math.round(rating + K_FACTOR * (score - expected));
}

export interface GameResultParams {
  matchId: string;
  mode: MatchMode;
  reason: GameEndReason;
  points: number;
  winnerColor: PlayerColor;
  seats: Array<{ color: PlayerColor; userId: string | null }>;
}

/**
 * Applies the progression consequences of a finished game — lifetime stats for
 * everyone, and ELO for ranked human-vs-human matches. Runs inside the caller's
 * transaction so results and progression commit atomically.
 */
@Injectable()
export class ProgressionService {
  private readonly logger = new Logger(ProgressionService.name);

  async applyGameResult(tx: Prisma.TransactionClient, params: GameResultParams): Promise<void> {
    const humans = params.seats.filter((s) => s.userId !== null) as Array<{
      color: PlayerColor;
      userId: string;
    }>;

    // Snapshot current stats/rating (the "before" values for this game).
    const before = new Map<string, { rating: number; peakElo: number; currentStreak: number; bestStreak: number }>();
    for (const seat of humans) {
      const user = await tx.user.findUnique({
        where: { id: seat.userId },
        include: { rating: true, stats: true },
      });
      if (user?.rating && user.stats) {
        before.set(seat.userId, {
          rating: user.rating.elo,
          peakElo: user.rating.peakElo,
          currentStreak: user.stats.currentStreak,
          bestStreak: user.stats.bestStreak,
        });
      }
    }

    // ELO only for ranked matches between two rated humans.
    const eloAfter = new Map<string, number>();
    if (params.mode === 'RANKED' && humans.length === 2) {
      const [a, b] = humans;
      const ra = before.get(a!.userId)?.rating;
      const rb = before.get(b!.userId)?.rating;
      if (ra !== undefined && rb !== undefined) {
        const sa = a!.color === params.winnerColor ? 1 : 0;
        eloAfter.set(a!.userId, nextElo(ra, expectedScore(ra, rb), sa));
        eloAfter.set(b!.userId, nextElo(rb, expectedScore(rb, ra), 1 - sa));
      }
    }

    for (const seat of humans) {
      const snap = before.get(seat.userId);
      if (!snap) continue;
      const isWinner = seat.color === params.winnerColor;
      const newStreak = isWinner ? snap.currentStreak + 1 : 0;

      await tx.playerStats.update({
        where: { userId: seat.userId },
        data: {
          gamesPlayed: { increment: 1 },
          wins: { increment: isWinner ? 1 : 0 },
          losses: { increment: isWinner ? 0 : 1 },
          gammonsWon: { increment: isWinner && params.reason === 'GAMMON' ? 1 : 0 },
          backgammonsWon: { increment: isWinner && params.reason === 'BACKGAMMON' ? 1 : 0 },
          totalPointsWon: { increment: isWinner ? params.points : 0 },
          currentStreak: newStreak,
          bestStreak: Math.max(snap.bestStreak, newStreak),
        },
      });

      const after = eloAfter.get(seat.userId);
      if (after !== undefined) {
        await tx.rating.update({
          where: { userId: seat.userId },
          data: {
            elo: after,
            peakElo: Math.max(snap.peakElo, after),
            gamesRated: { increment: 1 },
          },
        });
        await tx.matchPlayer.update({
          where: { matchId_color: { matchId: params.matchId, color: seat.color } },
          data: { eloBefore: snap.rating, eloAfter: after },
        });
      }
    }

    this.logger.log(
      `Progression applied for ${params.matchId} (${params.mode}); ELO updated for ${eloAfter.size} players`,
    );
  }
}
