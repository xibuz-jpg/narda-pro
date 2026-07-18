import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../redis/redis.service';

/** Emitted when a player crosses the violation threshold in a match. */
export const ANTICHEAT_FLAGGED = 'anticheat.flagged';

export interface AntiCheatFlaggedEvent {
  matchId: string;
  userId: string;
  count: number;
  reason: string;
}

/** Max intents a single player may send per match per second. */
const MAX_INTENTS_PER_SECOND = 10;
/** Rejected-action count in a match that flags a player for review. */
const VIOLATION_THRESHOLD = 10;
/** How long violation counters live (seconds). */
const VIOLATION_TTL = 300;

/**
 * Anti-cheat guard rails for live play.
 *
 * The engine already makes cheating *impossible* (every action is re-validated
 * server-side). This service adds the second line of defence: it throttles
 * intent floods and records rejected-action attempts, flagging players who
 * repeatedly probe for illegal moves so moderation/auto-ban can act.
 */
@Injectable()
export class AntiCheatService {
  private readonly logger = new Logger(AntiCheatService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  /** Fixed-window rate limit; returns false when the player is sending too fast. */
  async allowIntent(matchId: string, userId: string): Promise<boolean> {
    const key = `game:rate:${matchId}:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.pexpire(key, 1000);
    }
    return count <= MAX_INTENTS_PER_SECOND;
  }

  /**
   * Records an illegal/forbidden action attempt. Flags the player (emitting
   * {@link ANTICHEAT_FLAGGED}) once they exceed the threshold.
   */
  async recordViolation(matchId: string, userId: string, reason: string): Promise<number> {
    const key = `game:violations:${matchId}:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, VIOLATION_TTL);
    }
    this.logger.warn(`Rejected action in ${matchId} by ${userId}: ${reason} (#${count})`);

    if (count >= VIOLATION_THRESHOLD) {
      this.logger.error(`Anti-cheat flag: ${userId} in ${matchId} (${count} violations)`);
      const event: AntiCheatFlaggedEvent = { matchId, userId, count, reason };
      this.events.emit(ANTICHEAT_FLAGGED, event);
    }
    return count;
  }
}
