import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomInt } from 'node:crypto';
import type { MatchMode } from '@prisma/client';
import { RedisService } from '../redis/redis.service';
import { GameService } from './game.service';
import { INVITE_ACCEPTED, type InviteAcceptedEvent } from './invite.events';
import type { GameView } from './game.types';

/** A pending "play with a friend" invite, held in Redis until claimed or expired. */
interface Invite {
  hostUserId: string;
  mode: MatchMode;
  createdAt: number;
}

const inviteKey = (code: string): string => `invite:${code}`;
/** Codes live for an hour — long enough to send to a friend, short enough to expire cleanly. */
const TTL_SECONDS = 3600;
/** Unambiguous alphabet (no 0/O/1/I) so codes are easy to read and type. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * Private "play with a friend" invites.
 *
 * The host reserves a short code (stored in Redis); the friend redeems it, which
 * creates a normal human-vs-human {@link GameService} match and notifies the
 * waiting host via the {@link INVITE_ACCEPTED} event. Everything downstream — the
 * live game, clock, progression — is the ordinary match flow, so this is a thin
 * lobby layer on top of the existing engine.
 */
@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly games: GameService,
    private readonly events: EventEmitter2,
  ) {}

  /** Reserves a fresh invite code for the host. Friend games are PRIVATE — no
   *  ELO, and they mark the two players as friends (see UsersService.getFriends). */
  async create(hostUserId: string, mode: MatchMode = 'PRIVATE'): Promise<{ code: string }> {
    const invite: Invite = { hostUserId, mode, createdAt: Date.now() };
    // SET NX so two hosts never collide on the same code; retry on the rare clash.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = randomCode();
      const stored = await this.redis.client.set(
        inviteKey(code),
        JSON.stringify(invite),
        'EX',
        TTL_SECONDS,
        'NX',
      );
      if (stored === 'OK') {
        this.logger.log(`Invite ${code} created by ${hostUserId}`);
        return { code };
      }
    }
    throw new BadRequestException('Could not allocate an invite code, please try again');
  }

  /**
   * Redeems a code: creates the match and returns its view to the friend, and
   * emits {@link INVITE_ACCEPTED} so the host can join. The code is consumed
   * atomically (DEL) first, so a race can't spawn two games from one invite.
   */
  async accept(code: string, friendUserId: string): Promise<GameView> {
    const key = inviteKey(normalize(code));
    const invite = await this.redis.getJson<Invite>(key);
    if (!invite) throw new NotFoundException('Invite not found or expired');
    if (invite.hostUserId === friendUserId) {
      throw new BadRequestException('You cannot join your own invite');
    }
    // Consume the code before creating the game so a double-tap can't double-book.
    const removed = await this.redis.del(key);
    if (removed === 0) throw new NotFoundException('Invite already used or expired');

    const view = await this.games.createGame(invite.hostUserId, friendUserId, invite.mode);
    const event: InviteAcceptedEvent = {
      hostUserId: invite.hostUserId,
      matchId: view.matchId,
      mode: invite.mode,
    };
    this.events.emit(INVITE_ACCEPTED, event);
    this.logger.log(`Invite ${normalize(code)} accepted by ${friendUserId} → ${view.matchId}`);
    return view;
  }

  /** Host-initiated cancel: invalidates the code so a late friend can't join a ghost game. */
  async cancel(code: string, hostUserId: string): Promise<void> {
    const key = inviteKey(normalize(code));
    const invite = await this.redis.getJson<Invite>(key);
    if (invite && invite.hostUserId === hostUserId) await this.redis.del(key);
  }
}

function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

/** Normalise a user-entered code: upper-case and drop anything but A–Z/2–9. */
function normalize(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
