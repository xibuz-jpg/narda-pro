import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { validateEnv } from './config/env.validation';
import { createWinstonOptions } from './logger/winston.config';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

/**
 * Application entry point.
 *
 * The environment is validated *before* the Nest container is created so the
 * logger and every downstream provider start from known-good configuration.
 */
async function bootstrap(): Promise<void> {
  // Validate env up front to configure the logger correctly and fail fast.
  const env = validateEnv(process.env);
  const isProduction = env.NODE_ENV === 'production';

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: WinstonModule.createLogger(createWinstonOptions(env.LOG_LEVEL, isProduction)),
  });

  const config = app.get(AppConfigService);

  // ── WebSocket horizontal scaling ─────────────────────────────────────────────
  // Back Socket.IO with Redis pub/sub so rooms and broadcasts span every node.
  const redisIoAdapter = new RedisIoAdapter(app, config.redis.url);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // ── Security ───────────────────────────────────────────────────────────────
  // Behind Nginx/LB: trust the first proxy hop so req.ip is the real client IP.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // A Telegram Mini App loads Telegram's SDK script and runs inside Telegram's
  // WebView/iframe, so the strict default CSP and frame guard are relaxed here.
  // (Tightened with a Telegram-specific policy during production hardening.)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      frameguard: false,
    }),
  );
  app.enableCors({
    origin: config.http.corsOrigins.length > 0 ? config.http.corsOrigins : false,
    credentials: true,
  });

  // ── Routing & versioning ─────────────────────────────────────────────────────
  app.setGlobalPrefix(config.http.globalPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── Validation ───────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  app.enableShutdownHooks();

  // Cloud hosts (Render, Railway, Fly, …) inject the port to bind via $PORT;
  // fall back to the configured API_PORT for local runs.
  const port = process.env.PORT ? Number(process.env.PORT) : config.http.port;
  await app.listen(port, config.http.host);
}

void bootstrap();
