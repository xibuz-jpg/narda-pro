import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const ONLINE_SET = 'presence:online';
const connKey = (userId: string): string => `presence:conn:${userId}`;
/** Safety TTL so a crashed node's connection counters self-heal. */
const CONN_TTL_SECONDS = 3600;

/**
 * Redis-backed presence tracking.
 *
 * A user may hold several concurrent connections (multiple devices/tabs). We
 * count connections per user; the user is "online" while the count is ≥ 1.
 * Storing presence in Redis makes it correct across a horizontally-scaled
 * fleet — any node can read who is online.
 */
@Injectable()
export class PresenceService {
  constructor(private readonly redis: RedisService) {}

  /** Registers a new connection. Returns true if the user just came online. */
  async addConnection(userId: string): Promise<boolean> {
    const count = await this.redis.client.incr(connKey(userId));
    await this.redis.client.expire(connKey(userId), CONN_TTL_SECONDS);
    if (count === 1) {
      await this.redis.client.sadd(ONLINE_SET, userId);
      return true;
    }
    return false;
  }

  /** Removes a connection. Returns true if the user just went offline. */
  async removeConnection(userId: string): Promise<boolean> {
    const count = await this.redis.client.decr(connKey(userId));
    if (count <= 0) {
      await this.redis.client.del(connKey(userId));
      await this.redis.client.srem(ONLINE_SET, userId);
      return true;
    }
    return false;
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.redis.client.sismember(ONLINE_SET, userId)) === 1;
  }

  async onlineCount(): Promise<number> {
    return this.redis.client.scard(ONLINE_SET);
  }
}
