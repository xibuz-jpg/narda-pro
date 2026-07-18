import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { GameModule } from '../game/game.module';
import { UsersModule } from '../users/users.module';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingGateway } from './matchmaking.gateway';

/**
 * Matchmaking module: Redis-backed queues, the pairing service, and the
 * `/matchmaking` gateway. Reuses {@link GameModule} to spin up a game on a
 * match and {@link RealtimeModule} for WS authentication.
 */
@Module({
  imports: [RealtimeModule, GameModule, UsersModule],
  providers: [MatchmakingService, MatchmakingGateway],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
