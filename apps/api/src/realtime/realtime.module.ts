import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { WsAuthService } from './ws-auth.service';
import { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Realtime module: WebSocket authentication, presence, and the core gateway.
 * Exports {@link WsAuthService} and {@link PresenceService} for reuse by the
 * game gateway in the next increment.
 */
@Module({
  imports: [UsersModule, JwtModule.register({})],
  providers: [WsAuthService, PresenceService, RealtimeGateway],
  exports: [WsAuthService, PresenceService],
})
export class RealtimeModule {}
