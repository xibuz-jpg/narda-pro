import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomInt } from 'node:crypto';
import {
  GameState,
  GamePhase,
  Player,
  opponent,
  chooseTurnFor,
  type AiLevel,
  type GameStateSnapshot,
  type Move,
} from '@narda/game-engine';
import type { MatchMode, PlayerColor, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RedisLockService } from '../redis/redis-lock.service';
import { ProgressionService } from '../progression/progression.service';
import { GameStateStore } from './game-state.store';
import { cryptoRandom } from './crypto-random';
import { GAME_STATE_CHANGED, type GameStateChangedEvent } from './game.events';
import { toGameView, type GameRoom, type GameView } from './game.types';

/** A player's requested action, validated authoritatively by the engine. */
export type GameIntent =
  | { type: 'roll' }
  | { type: 'move'; moves: Move[] }
  | { type: 'double' }
  | { type: 'doubleResponse'; accept: boolean }
  | { type: 'resign' };

export interface IntentResult {
  view: GameView;
  ended: boolean;
}

/** Sorted set of turn deadlines: member = matchId, score = expiry (epoch ms). */
const DEADLINES_KEY = 'game:deadlines';
const onlineKey = (matchId: string): string => `game:online:${matchId}`;

/** Chess-clock timing: 15s grace per action, then a 3.5-minute reserve bank. */
const PER_MOVE_MS = 15_000;

/** AI pacing: after it rolls, wait this long before moving (dice are seen to
 *  settle); a quick beat between any other AI steps. */
const AI_ROLL_TO_MOVE_MS = 3_000;
const AI_STEP_MS = 650;
const RESERVE_MS = 210_000;
const freshReserve = (): Record<Player, number> => ({
  [Player.White]: RESERVE_MS,
  [Player.Black]: RESERVE_MS,
});

/**
 * Orchestrates live games — the server-authoritative core.
 *
 * Every action is re-validated by the pure engine against the stored state, so
 * a malicious client can never force an illegal move. State transitions are
 * serialized per match with a Redis lock. Each change is broadcast via the
 * {@link GAME_STATE_CHANGED} event, and each turn carries a deadline so an
 * inactive or disconnected player forfeits on timeout.
 */
@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly store: GameStateStore,
    private readonly lock: RedisLockService,
    private readonly events: EventEmitter2,
    private readonly progression: ProgressionService,
  ) {}

  /** Creates a human-vs-human game and returns its initial view. */
  async createGame(
    hostUserId: string,
    opponentUserId: string,
    mode: MatchMode = 'CASUAL',
  ): Promise<GameView> {
    if (hostUserId === opponentUserId) {
      throw new BadRequestException('Cannot start a game against yourself');
    }
    const opponentUser = await this.prisma.user.findUnique({ where: { id: opponentUserId } });
    if (!opponentUser) throw new NotFoundException('Opponent not found');

    const hostIsWhite = randomInt(0, 2) === 0;
    const whiteUserId = hostIsWhite ? hostUserId : opponentUserId;
    const blackUserId = hostIsWhite ? opponentUserId : hostUserId;

    const match = await this.prisma.match.create({
      data: {
        mode,
        variant: 'long_narda',
        status: 'IN_PROGRESS',
        useDoublingCube: false,
        startedAt: new Date(),
        players: {
          create: [
            { color: 'WHITE', userId: whiteUserId, isAI: false },
            { color: 'BLACK', userId: blackUserId, isAI: false },
          ],
        },
      },
    });

    const game = GameState.start(cryptoRandom, { variant: 'LONG_NARDA', useDoublingCube: false });
    const room: GameRoom = {
      matchId: match.id,
      mode,
      players: {
        [Player.White]: { userId: whiteUserId, isAI: false },
        [Player.Black]: { userId: blackUserId, isAI: false },
      },
      state: game.toSnapshot(),
      reserve: freshReserve(),
    };
    // The clock is armed on first player join (startClock), not here, so the
    // pre-connect wait isn't billed and the AI isn't forfeited before it runs.
    await this.store.save(room);
    return toGameView(room);
  }

  /** Creates a game against the AI at the given level and returns its view. */
  async createAiGame(userId: string, level: AiLevel): Promise<GameView> {
    const humanIsWhite = randomInt(0, 2) === 0;
    const humanColor: PlayerColor = humanIsWhite ? 'WHITE' : 'BLACK';
    const aiColor: PlayerColor = humanIsWhite ? 'BLACK' : 'WHITE';

    const match = await this.prisma.match.create({
      data: {
        mode: 'AI',
        variant: 'long_narda',
        status: 'IN_PROGRESS',
        useDoublingCube: false,
        startedAt: new Date(),
        players: {
          create: [
            { color: humanColor, userId, isAI: false },
            { color: aiColor, userId: null, isAI: true, aiLevel: level },
          ],
        },
      },
    });

    const game = GameState.start(cryptoRandom, { variant: 'LONG_NARDA', useDoublingCube: false });
    const human = { userId, isAI: false };
    const ai = { userId: null, isAI: true, aiLevel: level };
    const room: GameRoom = {
      matchId: match.id,
      mode: 'AI',
      players: {
        [Player.White]: humanIsWhite ? human : ai,
        [Player.Black]: humanIsWhite ? ai : human,
      },
      state: game.toSnapshot(),
      reserve: freshReserve(),
    };
    // The clock is armed on first player join (startClock), not here, so the
    // pre-connect wait isn't billed and the AI isn't forfeited before it runs.
    await this.store.save(room);
    return toGameView(room);
  }

  /** Returns the current view of a match (players and spectators alike). */
  async getView(matchId: string): Promise<GameView> {
    return toGameView(await this.requireRoom(matchId));
  }

  /** If it is the AI's turn, drive it (fire-and-forget). Safe to call redundantly. */
  async maybeAdvanceAi(matchId: string): Promise<void> {
    const room = await this.store.load(matchId);
    if (!room) return;
    const game = GameState.fromSnapshot(room.state);
    if (game.isOver || !room.players[game.activePlayer].isAI) return;
    void this.advanceAi(matchId).catch((error) =>
      this.logger.error(`AI advance failed for ${matchId}: ${errorMessage(error)}`),
    );
  }

  /**
   * Plays the AI's turn(s) one engine step at a time, pausing briefly between
   * the roll and the move so the opponent's play is legible. Stops when it
   * becomes a human's turn or the game ends.
   */
  private async advanceAi(matchId: string): Promise<void> {
    for (let guard = 0; guard < 400; guard += 1) {
      let rolled = false;
      const acted = await this.lock.withLock(`game:${matchId}`, async () => {
        const room = await this.store.load(matchId);
        if (!room) return false;
        const game = GameState.fromSnapshot(room.state);
        if (game.isOver) return false;

        const seat = room.players[game.activePlayer];
        if (!seat.isAI) return false;
        const level = (seat.aiLevel ?? 'HARD') as AiLevel;

        let next: GameState;
        if (game.phase === GamePhase.AwaitingRoll) {
          next = game.roll(cryptoRandom);
          rolled = true;
        } else if (game.phase === GamePhase.AwaitingMove && game.dice) {
          const turn = chooseTurnFor(game, level, cryptoRandom);
          next = game.playTurn([...turn.moves]);
        } else if (game.phase === GamePhase.AwaitingDoubleResponse) {
          next = game.respondToDouble(true); // simple take; refined later
        } else {
          return false;
        }
        await this.commit(room, next);
        return true;
      });
      if (!acted) break;
      // Longer pause right after the roll so the dice are seen to settle before
      // the AI plays; a quick beat otherwise.
      await sleep(rolled ? AI_ROLL_TO_MOVE_MS : AI_STEP_MS);
    }
  }

  /** Whether `userId` occupies a seat in the match (vs. a spectator). */
  async seatColorOf(matchId: string, userId: string): Promise<Player | null> {
    return this.seatOf(await this.requireRoom(matchId), userId);
  }

  /** Legal move sequences for `userId`, or `[]` if it is not their turn. */
  async getLegalMoves(matchId: string, userId: string): Promise<Move[][]> {
    const room = await this.requireRoom(matchId);
    const game = GameState.fromSnapshot(room.state);
    const color = this.seatOf(room, userId);
    if (!color || game.phase !== GamePhase.AwaitingMove || game.activePlayer !== color) {
      return [];
    }
    // Variant-aware (Long Narda vs backgammon) via the game's own legal turns.
    return game.legalTurns().map((turn) => [...turn.moves]);
  }

  /**
   * Applies a player's intent under a per-match lock. Turn ownership is checked
   * here; rule legality is enforced by the engine.
   */
  async applyIntent(matchId: string, userId: string, intent: GameIntent): Promise<IntentResult> {
    const result = await this.lock.withLock(`game:${matchId}`, async () => {
      const room = await this.requireRoom(matchId);
      const color = this.seatOf(room, userId);
      if (!color) throw new ForbiddenException('You are not a player in this game');

      const game = GameState.fromSnapshot(room.state);
      if (game.isOver) throw new BadRequestException('The game is already over');

      const next = this.transition(game, color, intent);
      await this.commit(room, next);
      return { view: toGameView(room), ended: next.isOver };
    });

    // Hand off to the AI if it is now its turn.
    if (!result.ended) void this.maybeAdvanceAi(matchId);
    return result;
  }

  // ── Presence ───────────────────────────────────────────────────────────────

  /** Marks a player connected to a match; returns the current online seats. */
  async markOnline(matchId: string, userId: string): Promise<string[]> {
    await this.redis.client.sadd(onlineKey(matchId), userId);
    return this.redis.client.smembers(onlineKey(matchId));
  }

  /** Marks a player disconnected; returns the remaining online seats. */
  async markOffline(matchId: string, userId: string): Promise<string[]> {
    await this.redis.client.srem(onlineKey(matchId), userId);
    return this.redis.client.smembers(onlineKey(matchId));
  }

  /**
   * Arms the acting player's clock the first time a player connects (idempotent).
   * Deferring it here — rather than at match creation — avoids billing the wait
   * before anyone is on the board, and stops the AI being forfeited before it is
   * ever driven. Broadcasts so both sides see the clock begin.
   */
  async startClock(matchId: string): Promise<void> {
    await this.lock.withLock(`game:${matchId}`, async () => {
      const room = await this.store.load(matchId);
      if (!room || room.deadline) return;
      if (GameState.fromSnapshot(room.state).isOver) return;
      await this.setDeadline(room);
      await this.store.save(room);
      const event: GameStateChangedEvent = { matchId, view: toGameView(room), ended: false };
      this.events.emit(GAME_STATE_CHANGED, event);
    });
  }

  // ── Timeouts ────────────────────────────────────────────────────────────────

  /** Every second, forfeit any game whose turn deadline has passed. */
  @Interval(1000)
  async sweepTimeouts(): Promise<void> {
    const now = Date.now();
    const expired = await this.redis.client.zrangebyscore(DEADLINES_KEY, 0, now);
    for (const matchId of expired) {
      try {
        await this.applyTimeout(matchId);
      } catch (error) {
        this.logger.error(`Timeout sweep failed for ${matchId}: ${errorMessage(error)}`);
      }
    }
  }

  private async applyTimeout(matchId: string): Promise<void> {
    await this.lock.withLock(`game:${matchId}`, async () => {
      const room = await this.store.load(matchId);
      if (!room || !room.deadline) {
        await this.redis.client.zrem(DEADLINES_KEY, matchId);
        return;
      }
      // Re-check under the lock: the deadline may have been reset by a real move.
      if (room.deadline.at > Date.now()) {
        await this.redis.client.zadd(DEADLINES_KEY, room.deadline.at, matchId);
        return;
      }
      const game = GameState.fromSnapshot(room.state);
      if (game.isOver) {
        await this.redis.client.zrem(DEADLINES_KEY, matchId);
        return;
      }
      const loser = room.deadline.player;
      this.logger.log(`Match ${matchId}: ${loser} forfeits on timeout`);
      await this.commit(room, game.forfeit(loser, 'TIMEOUT'));
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Persists the new state, manages the deadline, and broadcasts the change. */
  private async commit(room: GameRoom, next: GameState): Promise<void> {
    room.state = next.toSnapshot();

    if (next.isOver) {
      delete room.deadline;
      await this.redis.client.zrem(DEADLINES_KEY, room.matchId);
      await this.persistFinished(room);
      await this.redis.del(onlineKey(room.matchId));
      await this.store.remove(room.matchId);
    } else {
      await this.setDeadline(room);
      await this.store.save(room);
    }

    const event: GameStateChangedEvent = {
      matchId: room.matchId,
      view: toGameView(room),
      ended: next.isOver,
    };
    this.events.emit(GAME_STATE_CHANGED, event);
  }

  /**
   * Chess-clock deadline: each action gets a {@link PER_MOVE_MS} grace; time
   * spent beyond it drains the actor's {@link RESERVE_MS} bank. When the bank is
   * empty and the grace elapses, the sweep forfeits them. Called after every
   * state change: it first bills the player who just acted, then arms the clock
   * for whoever must act next.
   */
  private async setDeadline(room: GameRoom): Promise<void> {
    const now = Date.now();
    if (!room.reserve) room.reserve = freshReserve();

    // Bill the previous actor for any time beyond the per-move grace.
    const prev = room.deadline;
    if (prev) {
      const overage = Math.max(0, now - prev.startedAt - PER_MOVE_MS);
      room.reserve[prev.player] = Math.max(0, room.reserve[prev.player] - overage);
    }

    const player = responsiblePlayer(room.state);
    if (!player) {
      delete room.deadline;
      await this.redis.client.zrem(DEADLINES_KEY, room.matchId);
      return;
    }
    const at = now + PER_MOVE_MS + room.reserve[player];
    room.deadline = { player, at, startedAt: now };
    await this.redis.client.zadd(DEADLINES_KEY, at, room.matchId);
  }

  private transition(game: GameState, color: Player, intent: GameIntent): GameState {
    try {
      switch (intent.type) {
        case 'roll':
          this.requireTurn(game, color);
          return game.roll(cryptoRandom);
        case 'move':
          this.requireTurn(game, color);
          return game.playTurn(intent.moves);
        case 'double':
          this.requireTurn(game, color);
          return game.offerDouble();
        case 'doubleResponse':
          if (game.phase !== GamePhase.AwaitingDoubleResponse) {
            throw new BadRequestException('No double is pending');
          }
          if (color !== opponent(game.pendingDoubler!)) {
            throw new ForbiddenException('Only the doubled player may respond');
          }
          return game.respondToDouble(intent.accept);
        case 'resign':
          return game.resign(color);
        default:
          throw new BadRequestException('Unknown intent');
      }
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof BadRequestException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : 'Illegal action');
    }
  }

  private requireTurn(game: GameState, color: Player): void {
    if (game.activePlayer !== color) {
      throw new ForbiddenException('It is not your turn');
    }
  }

  private seatOf(room: GameRoom, userId: string): Player | null {
    if (room.players[Player.White].userId === userId) return Player.White;
    if (room.players[Player.Black].userId === userId) return Player.Black;
    return null;
  }

  private async requireRoom(matchId: string): Promise<GameRoom> {
    const room = await this.store.load(matchId);
    if (!room) throw new NotFoundException('Game not found or already finished');
    return room;
  }

  /**
   * Persists the final result, the full event log, and progression (stats +
   * ELO) to PostgreSQL — all in one transaction so they commit atomically.
   */
  private async persistFinished(room: GameRoom): Promise<void> {
    const state = room.state;
    const result = state.result;
    if (!result) return;

    const winnerUserId = room.players[result.winner].userId;
    const events: Prisma.GameEventCreateManyInput[] = state.events.map((event, index) => ({
      matchId: room.matchId,
      seq: index,
      type: event.type,
      data: event as unknown as Prisma.InputJsonValue,
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: room.matchId },
        data: {
          status: 'FINISHED',
          winnerId: winnerUserId,
          endReason: result.reason,
          cubeValue: state.cube.value,
          pointsAwarded: result.points,
          finishedAt: new Date(),
        },
      });
      await tx.matchPlayer.updateMany({
        where: { matchId: room.matchId, color: result.winner },
        data: { isWinner: true },
      });
      await tx.gameEvent.createMany({ data: events });

      await this.progression.applyGameResult(tx, {
        matchId: room.matchId,
        mode: room.mode as MatchMode,
        reason: result.reason,
        points: result.points,
        winnerColor: result.winner as PlayerColor,
        seats: [
          { color: 'WHITE', userId: room.players[Player.White].userId },
          { color: 'BLACK', userId: room.players[Player.Black].userId },
        ],
      });
    });
  }
}

/** The player whose clock is running for the given state, if any. */
function responsiblePlayer(state: GameStateSnapshot): Player | null {
  switch (state.phase) {
    case GamePhase.AwaitingRoll:
    case GamePhase.AwaitingMove:
      return state.activePlayer;
    case GamePhase.AwaitingDoubleResponse:
      return state.pendingDoubler ? opponent(state.pendingDoubler) : null;
    default:
      return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
