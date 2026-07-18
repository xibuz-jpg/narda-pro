import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { ProgressionModule } from '../progression/progression.module';
import { GameService } from './game.service';
import { InviteService } from './invite.service';
import { GameStateStore } from './game-state.store';
import { AntiCheatService } from './anti-cheat.service';
import { GamesController } from './games.controller';
import { GameGateway } from './game.gateway';

/**
 * Game module: live-game orchestration (engine + Redis), the REST bootstrap
 * endpoints, and the `/game` WebSocket gateway. Reuses {@link RealtimeModule}'s
 * WS authentication.
 */
@Module({
  imports: [RealtimeModule, ProgressionModule],
  controllers: [GamesController],
  providers: [GameService, InviteService, GameStateStore, AntiCheatService, GameGateway],
  exports: [GameService],
})
export class GameModule {}
