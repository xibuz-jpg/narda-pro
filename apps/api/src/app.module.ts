import { join, sep } from 'node:path';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RealtimeModule } from './realtime/realtime.module';
import { GameModule } from './game/game.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';

/**
 * Application root. Composes cross-cutting concerns (config, rate limiting,
 * global error handling) and feature modules. Feature modules — auth, users,
 * game, economy, … — are registered here as the platform grows.
 */
@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // Serve the built Mini App (apps/web/dist) with SPA fallback; API and
    // WebSocket routes are excluded so they keep working.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/(.*)', '/socket.io/(.*)'],
      serveStaticOptions: {
        // index.html must never be cached — Telegram's in-app browser otherwise
        // pins an old copy that references stale chunk hashes (blank/old screen
        // after a rebuild). The fingerprinted /assets/* files are immutable, so
        // they can cache forever; a fresh index.html always points at the new ones.
        setHeaders: (res, path) => {
          if (path.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          } else if (path.includes(`${sep}assets${sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      },
    }),
    PrismaModule,
    RedisModule,
    // Global rate limiting; individual routes opt out via @SkipThrottle().
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            ttl: config.rateLimit.ttlSeconds * 1000,
            limit: config.rateLimit.limit,
          },
        ],
      }),
    }),
    UsersModule,
    AuthModule,
    RealtimeModule,
    GameModule,
    MatchmakingModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
