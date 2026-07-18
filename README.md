# Narda Pro

Premium **Telegram Mini App** backgammon (narda) platform — multiplayer, ranked, with
economy, tournaments, and an AI opponent. Built server-authoritative for fairness and scale.

> Status: **Phase 0 — Foundation**. See [`docs/`](docs/) for the architecture.

## Monorepo layout

```
narda-pro/
├─ apps/
│  ├─ api/            # NestJS backend (REST + WebSocket)   — Phase 2+
│  └─ web/            # React + Vite Mini App frontend       — Phase 6+
├─ packages/
│  ├─ game-engine/    # Pure, framework-free backgammon core — Phase 1
│  └─ shared/         # Shared TS types, DTOs, contracts     — Phase 1
├─ docs/              # Architecture & specifications
├─ infra/             # Nginx, deploy, monitoring configs    — Phase 9
├─ docker-compose.yml # Local dev stack (Postgres + Redis)
└─ turbo.json         # Task pipeline
```

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React, TypeScript, Vite, Tailwind, PixiJS, Framer Motion, Zustand, React Query |
| Backend    | NestJS, TypeScript, Prisma, PostgreSQL, Redis, Socket.IO |
| Infra      | Docker, Nginx, GitHub Actions |
| Observability | Prometheus, Grafana, Sentry, Winston |

## Prerequisites

- Node.js `>=20.11` (see [`.nvmrc`](.nvmrc))
- pnpm `>=9`
- Docker + Docker Compose

## Getting started

```bash
cp .env.example .env      # then fill in the secrets
pnpm install
pnpm docker:up            # starts Postgres + Redis
pnpm dev                  # runs all apps in watch mode
```

## Scripts

| Command            | Description                       |
|--------------------|-----------------------------------|
| `pnpm dev`         | Run all apps in watch mode        |
| `pnpm build`       | Build every package/app           |
| `pnpm test`        | Run all test suites               |
| `pnpm lint`        | Lint the whole monorepo           |
| `pnpm typecheck`   | Type-check without emitting       |
| `pnpm docker:up`   | Start local infra                 |

## Core principles

1. **Server-authoritative** — the client never decides game outcomes. All moves,
   dice, and economy mutations are validated and computed on the server.
2. **Clean Architecture + DDD** — domain logic is isolated from frameworks and I/O.
3. **Everything typed & tested** — the game engine targets 100% branch coverage.

## Documentation

- [Software Architecture Document](docs/architecture/software-architecture-document.md)
