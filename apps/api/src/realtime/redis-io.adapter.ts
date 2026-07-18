import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions, Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/**
 * Socket.IO adapter backed by Redis pub/sub.
 *
 * With this adapter, `socket.emit`/`to(room).emit` fan out across *every* API
 * node, not just the one holding the socket. That is what lets the WebSocket
 * tier scale horizontally: a move processed on node A is broadcast to players
 * connected to node B, and matchmaking/game rooms span the whole fleet.
 *
 * Two dedicated connections are used (one to publish, one to subscribe) as the
 * Redis pub/sub protocol requires.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  /** Establishes the pub/sub connections; call before `useWebSocketAdapter`. */
  async connectToRedis(): Promise<void> {
    this.pubClient = new Redis(this.redisUrl);
    this.subClient = this.pubClient.duplicate();
    // Fail fast if Redis is unreachable at boot.
    await Promise.all([this.pubClient.ping(), this.subClient.ping()]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  override async dispose(): Promise<void> {
    await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
  }
}
