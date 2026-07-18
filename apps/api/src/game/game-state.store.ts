import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import type { GameRoom } from './game.types';

const roomKey = (matchId: string): string => `game:room:${matchId}`;
/** Live games self-expire if a node dies mid-match; refreshed on every write. */
const ROOM_TTL_SECONDS = 60 * 60 * 6; // 6 hours

/**
 * Redis-backed store for live game rooms. The authoritative game state lives
 * here (fast, shared across the fleet) while a match is in progress; it is
 * persisted to PostgreSQL and evicted on completion.
 */
@Injectable()
export class GameStateStore {
  constructor(private readonly redis: RedisService) {}

  async load(matchId: string): Promise<GameRoom | null> {
    return this.redis.getJson<GameRoom>(roomKey(matchId));
  }

  async save(room: GameRoom): Promise<void> {
    await this.redis.setJson(roomKey(room.matchId), room, ROOM_TTL_SECONDS);
  }

  async remove(matchId: string): Promise<void> {
    await this.redis.del(roomKey(matchId));
  }
}
