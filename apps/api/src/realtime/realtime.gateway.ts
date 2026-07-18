import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { WsAuthService } from './ws-auth.service';
import { PresenceService } from './presence.service';
import { RealtimeEvents, type AuthenticatedSocket } from './socket.types';

/**
 * Core realtime gateway on the `/realtime` namespace.
 *
 * Connections are authenticated at the handshake via a Socket.IO middleware, so
 * an unauthenticated socket is rejected before it ever "connects" — no handler
 * can run without a verified user. On connect/disconnect we maintain presence
 * and notify interested clients.
 *
 * The game namespace (Phase 3.2) reuses {@link WsAuthService} for the same
 * handshake authentication.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly namespace!: Namespace;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly presence: PresenceService,
  ) {}

  afterInit(server: Namespace): void {
    // Handshake authentication: reject unauthenticated sockets outright.
    server.use(async (socket: Socket, next: (err?: Error) => void) => {
      const user = await this.wsAuth.authenticate(socket);
      if (!user) {
        next(new Error('unauthorized'));
        return;
      }
      socket.data.user = user;
      next();
    });
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const { user } = client.data;
    // Personal room for targeted server→user messages (invites, notifications).
    await client.join(`user:${user.id}`);

    const cameOnline = await this.presence.addConnection(user.id);
    if (cameOnline) {
      this.namespace.emit(RealtimeEvents.PresenceUpdate, { userId: user.id, online: true });
    }

    client.emit(RealtimeEvents.Connected, {
      userId: user.id,
      serverTime: Date.now(),
    });
    this.logger.debug(`Socket connected: user ${user.id} (${client.id})`);
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const user = client.data?.user;
    if (!user) return;

    const wentOffline = await this.presence.removeConnection(user.id);
    if (wentOffline) {
      this.namespace.emit(RealtimeEvents.PresenceUpdate, { userId: user.id, online: false });
    }
    this.logger.debug(`Socket disconnected: user ${user.id} (${client.id})`);
  }

  /** Latency heartbeat — the client measures round-trip time. */
  @SubscribeMessage('ping')
  onPing(): { event: string; data: { serverTime: number } } {
    return { event: RealtimeEvents.Pong, data: { serverTime: Date.now() } };
  }

  /** Returns the current global online-user count. */
  @SubscribeMessage('presence:count')
  async onPresenceCount(): Promise<{ online: number }> {
    return { online: await this.presence.onlineCount() };
  }
}
