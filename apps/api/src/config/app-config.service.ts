import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.validation';

/**
 * Thin, strongly-typed wrapper over Nest's {@link ConfigService}.
 *
 * Feature code depends on this instead of reading raw `process.env`, so every
 * value is validated, typed, and discoverable. Grouped getters keep call sites
 * readable (`config.http.port` rather than stringly-typed keys).
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get http() {
    return {
      host: this.get('API_HOST'),
      port: this.get('API_PORT'),
      globalPrefix: this.get('API_GLOBAL_PREFIX'),
      corsOrigins: this.get('API_CORS_ORIGINS'),
    };
  }

  get logging() {
    return {
      level: this.get('LOG_LEVEL'),
    };
  }

  get rateLimit() {
    return {
      ttlSeconds: this.get('RATE_LIMIT_TTL'),
      limit: this.get('RATE_LIMIT_MAX'),
    };
  }

  get sentryDsn(): string | undefined {
    return this.get('SENTRY_DSN');
  }

  get jwt() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      accessTtlSeconds: this.get('JWT_ACCESS_TTL'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      refreshTtlSeconds: this.get('JWT_REFRESH_TTL'),
    };
  }

  get redis() {
    return {
      url: this.get('REDIS_URL'),
    };
  }

  get telegram() {
    return {
      botToken: this.get('TELEGRAM_BOT_TOKEN'),
      botUsername: this.get('TELEGRAM_BOT_USERNAME'),
      initDataMaxAgeSeconds: this.get('TELEGRAM_INITDATA_MAX_AGE'),
    };
  }
}
