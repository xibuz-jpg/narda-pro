import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../redis/redis.service';
import { RedisLockService } from '../redis/redis-lock.service';
import { GameService } from '../game/game.service';
import { UsersService } from '../users/users.service';
import {
  MATCHMAKING_MATCHED,
  MATCHMAKING_MODES,
  type MatchmakingMatchedEvent,
  type MatchmakingMode,
  type Ticket,
} from './matchmaking.types';

const queueKey = (mode: MatchmakingMode): string => `mm:queue:${mode}`;
const ticketKey = (mode: MatchmakingMode, userId: string): string => `mm:ticket:${mode}:${userId}`;
const userModeKey = (userId: string): string => `mm:usermode:${userId}`;

/** Base RANKED window (±ELO) and how fast it widens with waiting. */
const BASE_ELO_WINDOW = 100;
const WINDOW_STEP = 100;
const WINDOW_STEP_INTERVAL_MS = 5000;
const MAX_ELO_WINDOW = 5000; // effectively "anyone" after a few minutes

/**
 * Matchmaking over Redis queues.
 *
 * Each waiting player holds a {@link Ticket} in a per-mode Redis sorted set —
 * scored by ELO for RANKED (nearest opponents adjacent) or by join time for
 * CASUAL (FIFO). Pairing runs both reactively (on join) and via a periodic
 * sweep, so RANKED tickets still match once their search window widens. All
 * pairing is done under a per-mode lock so no player is matched twice.
 *
 * A match is announced through the {@link MATCHMAKING_MATCHED} domain event
 * (event-driven), decoupling the gateway that notifies the sockets.
 */
@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly lock: RedisLockService,
    private readonly games: GameService,
    private readonly users: UsersService,
    private readonly events: EventEmitter2,
  ) {}

  /** Enqueue a player and attempt an immediate match. */
  async join(userId: string, mode: MatchmakingMode): Promise<void> {
    await this.leave(userId); // a player is only ever in one queue
    const profile = await this.users.getProfile(userId);
    const ticket: Ticket = { userId, mode, elo: profile.elo, joinedAt: Date.now() };
    const score = mode === 'RANKED' ? ticket.elo : ticket.joinedAt;

    await this.redis.client.zadd(queueKey(mode), score, userId);
    await this.redis.setJson(ticketKey(mode, userId), ticket);
    await this.redis.set(userModeKey(userId), mode);

    await this.tryMatch(mode);
  }

  /** Remove a player from whichever queue they are in (idempotent). */
  async leave(userId: string): Promise<void> {
    const mode = (await this.redis.get(userModeKey(userId))) as MatchmakingMode | null;
    if (!mode) return;
    await this.removeTicket(mode, userId);
  }

  /** Periodic sweep so widening RANKED windows eventually pair everyone. */
  @Interval(4000)
  async sweep(): Promise<void> {
    for (const mode of MATCHMAKING_MODES) {
      try {
        await this.tryMatch(mode);
      } catch (error) {
        this.logger.error(`Sweep failed for ${mode}: ${errorMessage(error)}`);
      }
    }
  }

  /** Greedy pairing pass for one mode, serialized by a Redis lock. */
  private async tryMatch(mode: MatchmakingMode): Promise<void> {
    await this.lock.withLock(`matchmaking:${mode}`, async () => {
      const ids = await this.redis.client.zrange(queueKey(mode), 0, -1);
      if (ids.length < 2) return;

      const tickets = (
        await Promise.all(ids.map((id) => this.redis.getJson<Ticket>(ticketKey(mode, id))))
      ).filter((t): t is Ticket => t !== null);

      const paired = new Set<string>();
      const now = Date.now();

      for (let i = 0; i < tickets.length; i += 1) {
        const a = tickets[i];
        if (!a || paired.has(a.userId)) continue;

        for (let j = i + 1; j < tickets.length; j += 1) {
          const b = tickets[j];
          if (!b || paired.has(b.userId)) continue;

          if (mode === 'RANKED') {
            const allowed = Math.min(this.window(now - a.joinedAt), this.window(now - b.joinedAt));
            // Sorted by ELO: if the nearest neighbour is out of window, so is
            // everyone farther — stop scanning for this player.
            if (Math.abs(a.elo - b.elo) > allowed) break;
          }

          paired.add(a.userId);
          paired.add(b.userId);
          await this.pair(mode, a, b);
          break;
        }
      }
    });
  }

  private async pair(mode: MatchmakingMode, a: Ticket, b: Ticket): Promise<void> {
    await this.removeTicket(mode, a.userId);
    await this.removeTicket(mode, b.userId);
    try {
      const view = await this.games.createGame(a.userId, b.userId, mode);
      const event: MatchmakingMatchedEvent = {
        matchId: view.matchId,
        userIds: [a.userId, b.userId],
        mode,
      };
      this.events.emit(MATCHMAKING_MATCHED, event);
      this.logger.log(`Matched ${a.userId} vs ${b.userId} (${mode}) → ${view.matchId}`);
    } catch (error) {
      this.logger.error(`Failed to create match: ${errorMessage(error)}`);
    }
  }

  private async removeTicket(mode: MatchmakingMode, userId: string): Promise<void> {
    await this.redis.client.zrem(queueKey(mode), userId);
    await this.redis.del(ticketKey(mode, userId), userModeKey(userId));
  }

  /** Allowed ELO difference given how long a player has waited. */
  private window(waitMs: number): number {
    const widened = BASE_ELO_WINDOW + Math.floor(waitMs / WINDOW_STEP_INTERVAL_MS) * WINDOW_STEP;
    return Math.min(widened, MAX_ELO_WINDOW);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
