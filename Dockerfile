# ─────────────────────────────────────────────────────────────
# Narda Pro — single production image.
# The NestJS API builds and serves the Mini App (apps/web/dist) on one origin,
# so one web service covers HTTP + WebSocket + static frontend.
# ─────────────────────────────────────────────────────────────
FROM node:20-slim

# Prisma needs openssl; TLS to managed Postgres/Redis needs CA certs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Match the repo's pinned pnpm (root package.json "packageManager").
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Install dependencies first (cached until a manifest or the lockfile changes).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/game-engine/package.json packages/game-engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Copy the source and build: engine (CJS) → Prisma client → API → web bundle.
COPY . .
RUN pnpm --filter @narda/game-engine build \
  && pnpm --filter @narda/api prisma:generate \
  && pnpm --filter @narda/api build \
  && pnpm --filter @narda/web build

ENV NODE_ENV=production
# Apply any pending DB migrations, then start (serves API + WS + the Mini App).
CMD ["sh", "-c", "pnpm --filter @narda/api prisma:deploy && node apps/api/dist/main.js"]
