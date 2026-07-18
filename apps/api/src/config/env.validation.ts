import { z } from 'zod';

/**
 * Environment schema — the single source of truth for configuration.
 *
 * Boot fails fast with a readable error if the environment is misconfigured,
 * so a mis-deployed service never starts in a half-valid state. Variables that
 * belong to later phases (database, JWT, Telegram) are optional for now and
 * become required as those modules land.
 */

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const envSchema = z.object({
  // ── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ: z.string().default('UTC'),

  // ── HTTP API ─────────────────────────────────────────────────────────────
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_GLOBAL_PREFIX: z.string().default('api'),
  API_CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // ── Logging ──────────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug', 'verbose']).default('info'),

  // ── Rate limiting ────────────────────────────────────────────────────────
  RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

  // ── Observability ────────────────────────────────────────────────────────
  SENTRY_DSN: z.string().optional(),
  PROMETHEUS_ENABLED: booleanFromString.default('true'),

  // ── Auth / JWT (required) ────────────────────────────────────────────────
  JWT_ACCESS_SECRET: z.string().min(16, 'must be at least 16 characters'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_SECRET: z.string().min(16, 'must be at least 16 characters'),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),

  // ── Telegram ─────────────────────────────────────────────────────────────
  // Token is optional so the server can boot before it is configured; the auth
  // endpoint returns a clear error until it is set.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_INITDATA_MAX_AGE: z.coerce.number().int().positive().default(86400),

  // ── Data stores ──────────────────────────────────────────────────────────
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // ── Deferred to later phases (optional until wired in) ────────────────────
  DATABASE_URL: z.string().optional(),
});

/** Strongly-typed, validated environment. */
export type Env = z.infer<typeof envSchema>;

/**
 * Validator handed to `@nestjs/config`. Throws a formatted error listing every
 * invalid variable when validation fails.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
