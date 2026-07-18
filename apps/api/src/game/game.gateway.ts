import { BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
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
import { Player, type Move } from '@narda/game-engine';
import { WsAuthService } from '../realtime/ws-auth.service';
import { GameService, type GameIntent } from './game.service';
import { AntiCheatService } from './anti-cheat.service';
import { GAME_STATE_CHANGED, type GameStateChangedEvent } from './game.events';
import type { AuthUser } from '../auth/auth.types';
import type { GameView } from './game.types';

const room = (matchId: string): string => `match:${matchId}`;

/** Socket state we attach during a game session. */
type GameSocket = Socket & { data: { user: AuthUser; matches?: Set<string> } };

interface Ack {
  ok: boolean;
  error?: string;
  view?: GameView;
  moves?: Move[][];
  role?: 'player' | 'spectator';
}

/**
 * Live-game gateway on the `/game` namespace.
 *
 * Players send *intents* (roll, move, double, resign); the server validates and
 * applies them via {@link GameService}, then a {@link GAME_STATE_CHANGED} event
 * fans the new state out to the match room — so timeout-driven changes (a
 * forfeit while nobody is sending anything) broadcast the same way as moves.
 *
 * Reconnect is free: the authoritative state lives in Redis, so a dropped
 * client simply re-authenticates and `game:join`s again to resume. Spectators
 * may join read-only; only seated players may send intents.
 */
@WebSocketGateway({
  namespace: '/game',
  cors: { origin: true, credentials: true },
})
export class GameGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  private readonly namespace!: Namespace;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly games: GameService,
    private readonly antiCheat: AntiCheatService,
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

  /** Join a match room to receive live state; seats mark presence. */
  @SubscribeMessage('game:join')
  async onJoin(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { matchId: string },
  ): Promise<Ack> {
    try {
      await client.join(room(body.matchId));
      (client.data.matches ??= new Set()).add(body.matchId);

      const seat = seatColor(await this.games.getView(body.matchId), client.data.user.id);
      const role: 'player' | 'spectator' = seat ? 'player' : 'spectator';
      if (role === 'player') {
        // Start the clock the first time a player is actually on the board.
        await this.games.startClock(body.matchId);
        const online = await this.games.markOnline(body.matchId, client.data.user.id);
        this.namespace.to(room(body.matchId)).emit('game:presence', { matchId: body.matchId, online });
      }
      // If the AI moves first, kick it off once the human is watching.
      void this.games.maybeAdvanceAi(body.matchId);
      return { ok: true, view: await this.games.getView(body.matchId), role };
    } catch (error) {
      return this.fail(error);
    }
  }

  @SubscribeMessage('game:leave')
  async onLeave(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { matchId: string },
  ): Promise<Ack> {
    await client.leave(room(body.matchId));
    client.data.matches?.delete(body.matchId);
    const online = await this.games.markOffline(body.matchId, client.data.user.id);
    this.namespace.to(room(body.matchId)).emit('game:presence', { matchId: body.matchId, online });
    return { ok: true };
  }

  @SubscribeMessage('game:state')
  async onState(@MessageBody() body: { matchId: string }): Promise<Ack> {
    try {
      return { ok: true, view: await this.games.getView(body.matchId) };
    } catch (error) {
      return this.fail(error);
    }
  }

  @SubscribeMessage('game:legalMoves')
  async onLegalMoves(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { matchId: string },
  ): Promise<Ack> {
    try {
      const moves = await this.games.getLegalMoves(body.matchId, client.data.user.id);
      return { ok: true, moves };
    } catch (error) {
      return this.fail(error);
    }
  }

  @SubscribeMessage('game:roll')
  onRoll(@ConnectedSocket() client: GameSocket, @MessageBody() body: { matchId: string }): Promise<Ack> {
    return this.handleIntent(client, body.matchId, { type: 'roll' });
  }

  @SubscribeMessage('game:move')
  onMove(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { matchId: string; moves: Move[] },
  ): Promise<Ack> {
    return this.handleIntent(client, body.matchId, { type: 'move', moves: body.moves ?? [] });
  }

  @SubscribeMessage('game:double')
  onDouble(@ConnectedSocket() client: GameSocket, @MessageBody() body: { matchId: string }): Promise<Ack> {
    return this.handleIntent(client, body.matchId, { type: 'double' });
  }

  @SubscribeMessage('game:double-response')
  onDoubleResponse(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() body: { matchId: string; accept: boolean },
  ): Promise<Ack> {
    return this.handleIntent(client, body.matchId, {
      type: 'doubleResponse',
      accept: Boolean(body.accept),
    });
  }

  @SubscribeMessage('game:resign')
  onResign(@ConnectedSocket() client: GameSocket, @MessageBody() body: { matchId: string }): Promise<Ack> {
    return this.handleIntent(client, body.matchId, { type: 'resign' });
  }

  /** On disconnect, clear the player's presence from every joined match. */
  async handleDisconnect(client: GameSocket): Promise<void> {
    const userId = client.data?.user?.id;
    const matches = client.data?.matches;
    if (!userId || !matches) return;
    for (const matchId of matches) {
      try {
        const online = await this.games.markOffline(matchId, userId);
        this.namespace.to(room(matchId)).emit('game:presence', { matchId, online });
      } catch (error) {
        this.logger.error(`Presence cleanup failed for ${matchId}: ${String(error)}`);
      }
    }
  }

  /** Fan authoritative state changes out to the match room. */
  @OnEvent(GAME_STATE_CHANGED)
  onStateChanged(event: GameStateChangedEvent): void {
    this.namespace.to(room(event.matchId)).emit('game:state', event.view);
    if (event.ended) {
      this.namespace
        .to(room(event.matchId))
        .emit('game:ended', { matchId: event.matchId, result: event.view.result });
    }
  }

  private async handleIntent(client: GameSocket, matchId: string, intent: GameIntent): Promise<Ack> {
    const userId = client.data.user.id;

    // Anti-flood: cap the rate of intents per player per match.
    if (!(await this.antiCheat.allowIntent(matchId, userId))) {
      return { ok: false, error: 'Too many actions, slow down' };
    }

    try {
      const { view } = await this.games.applyIntent(matchId, userId, intent);
      return { ok: true, view };
    } catch (error) {
      // Rejected illegal/out-of-turn attempts are recorded for anti-cheat review.
      if (error instanceof ForbiddenException || error instanceof BadRequestException) {
        await this.antiCheat.recordViolation(matchId, userId, error.message);
      }
      return this.fail(error);
    }
  }

  private fail(error: unknown): Ack {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return { ok: false, error: message };
  }
}

function seatColor(view: GameView, userId: string): Player | null {
  if (view.players[Player.White].userId === userId) return Player.White;
  if (view.players[Player.Black].userId === userId) return Player.Black;
  return null;
}
