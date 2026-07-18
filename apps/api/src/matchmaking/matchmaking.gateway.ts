import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayInit,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { WsAuthService } from '../realtime/ws-auth.service';
import { MatchmakingService } from './matchmaking.service';
import { MATCHMAKING_MATCHED, type MatchmakingMatchedEvent } from './matchmaking.types';
import { INVITE_ACCEPTED, type InviteAcceptedEvent } from '../game/invite.events';
import type { AuthenticatedSocket } from '../realtime/socket.types';

const userRoom = (userId: string): string => `mm:user:${userId}`;

interface Ack {
  ok: boolean;
  error?: string;
  status?: 'searching';
}

/**
 * Matchmaking gateway (`/matchmaking` namespace).
 *
 * Players `matchmaking:join` a mode; the service pairs them and emits the
 * {@link MATCHMAKING_MATCHED} domain event, which this gateway translates into a
 * `matchmaking:found` push to each paired player. Disconnecting removes the
 * player from the queue automatically.
 */
@WebSocketGateway({
  namespace: '/matchmaking',
  cors: { origin: true, credentials: true },
})
export class MatchmakingGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(MatchmakingGateway.name);

  @WebSocketServer()
  private readonly namespace!: Namespace;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly matchmaking: MatchmakingService,
  ) {}

  afterInit(server: Namespace): void {
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

  @SubscribeMessage('matchmaking:join')
  async onJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { mode?: string },
  ): Promise<Ack> {
    const mode = String(body?.mode ?? '').toUpperCase();
    if (mode !== 'CASUAL' && mode !== 'RANKED') {
      return { ok: false, error: 'Invalid mode (expected CASUAL or RANKED)' };
    }
    const userId = client.data.user.id;
    await client.join(userRoom(userId));
    await this.matchmaking.join(userId, mode);
    return { ok: true, status: 'searching' };
  }

  @SubscribeMessage('matchmaking:leave')
  async onLeave(@ConnectedSocket() client: AuthenticatedSocket): Promise<Ack> {
    await this.matchmaking.leave(client.data.user.id);
    return { ok: true };
  }

  /**
   * A friend-invite host parks here (personal room, no queue) after creating an
   * invite; when the friend redeems it, `INVITE_ACCEPTED` pushes the matchId back
   * as a `matchmaking:found` so the host joins the game exactly like a queue match.
   */
  @SubscribeMessage('invite:wait')
  async onInviteWait(@ConnectedSocket() client: AuthenticatedSocket): Promise<Ack> {
    await client.join(userRoom(client.data.user.id));
    return { ok: true, status: 'searching' };
  }

  handleDisconnect(client: Socket): void {
    const user = client.data?.user;
    if (user?.id) {
      void this.matchmaking.leave(user.id).catch((error) => {
        this.logger.error(`Failed to dequeue on disconnect: ${String(error)}`);
      });
    }
  }

  /** Fan the match-found event out to each paired player's personal room. */
  @OnEvent(MATCHMAKING_MATCHED)
  onMatched(event: MatchmakingMatchedEvent): void {
    for (const userId of event.userIds) {
      this.namespace
        .to(userRoom(userId))
        .emit('matchmaking:found', { matchId: event.matchId, mode: event.mode });
    }
  }

  /** Friend redeemed an invite → tell the waiting host to join the new match. */
  @OnEvent(INVITE_ACCEPTED)
  onInviteAccepted(event: InviteAcceptedEvent): void {
    this.namespace
      .to(userRoom(event.hostUserId))
      .emit('matchmaking:found', { matchId: event.matchId, mode: event.mode });
  }
}
