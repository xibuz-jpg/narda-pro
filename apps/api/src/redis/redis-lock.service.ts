import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { RedisService } from './redis.service';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface LockOptions {
  ttlMs?: number;
  retries?: number;
  delayMs?: number;
}

/**
 * A minimal Redis mutex (single-instance Redlock). Serializes mutations to a
 * shared resource — e.g. a live game's state — so two concurrent intents can
 * never interleave a read-modify-write and corrupt the authoritative state.
 *
 * Acquire: `SET lock:<res> <token> PX <ttl> NX`. Release compares the token via
 * a Lua script so we only ever release our own lock, never someone else's.
 */
@Injectable()
export class RedisLockService {
  constructor(private readonly redis: RedisService) {}

  async withLock<T>(resource: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
    const key = `lock:${resource}`;
    const token = randomBytes(16).toString('hex');
    const ttlMs = options.ttlMs ?? 5000;
    const retries = options.retries ?? 100;
    const delayMs = options.delayMs ?? 50;

    for (let attempt = 0; attempt < retries; attempt += 1) {
      const acquired = await this.redis.client.set(key, token, 'PX', ttlMs, 'NX');
      if (acquired === 'OK') {
        try {
          return await fn();
        } finally {
          await this.release(key, token);
        }
      }
      await sleep(delayMs);
    }
    throw new ServiceUnavailableException(`Resource ${resource} is busy`);
  }

  private release(key: string, token: string): Promise<unknown> {
    const lua =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    return this.redis.client.eval(lua, 1, key, token);
  }
}
