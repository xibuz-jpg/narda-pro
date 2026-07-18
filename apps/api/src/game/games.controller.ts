import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { GameService } from './game.service';
import { InviteService } from './invite.service';
import { CreateGameDto } from './dto/create-game.dto';
import { CreateAiGameDto } from './dto/create-ai-game.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import type { GameView } from './game.types';

/**
 * REST surface for creating and inspecting games. Live play happens over the
 * `/game` WebSocket namespace; these endpoints bootstrap and snapshot a match.
 */
@Controller('games')
export class GamesController {
  constructor(
    private readonly games: GameService,
    private readonly invites: InviteService,
  ) {}

  /** Start a casual game against another user. */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGameDto): Promise<GameView> {
    return this.games.createGame(user.id, dto.opponentId);
  }

  /** Start a game against the AI at the given difficulty. */
  @Post('ai')
  createAi(@CurrentUser() user: AuthUser, @Body() dto: CreateAiGameDto): Promise<GameView> {
    return this.games.createAiGame(user.id, dto.level);
  }

  /** Create a private "play with a friend" invite; returns a short share code. */
  @Post('invite')
  createInvite(@CurrentUser() user: AuthUser): Promise<{ code: string }> {
    return this.invites.create(user.id);
  }

  /** Redeem a friend's invite code; creates the match and returns its view. */
  @Post('invite/:code/accept')
  acceptInvite(@CurrentUser() user: AuthUser, @Param('code') code: string): Promise<GameView> {
    return this.invites.accept(code, user.id);
  }

  /** Host cancels a pending invite (invalidates the code). */
  @Delete('invite/:code')
  @HttpCode(204)
  async cancelInvite(@CurrentUser() user: AuthUser, @Param('code') code: string): Promise<void> {
    await this.invites.cancel(code, user.id);
  }

  /** Current snapshot of a game (players or spectators). */
  @Get(':matchId')
  get(@Param('matchId') matchId: string): Promise<GameView> {
    return this.games.getView(matchId);
  }
}
