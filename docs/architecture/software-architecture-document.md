# Narda Pro — Software Architecture Document (SAD)

**Version:** 0.1 (Phase 0)
**Status:** Draft — foundation
**Owners:** Architecture

---

## 1. Purpose & scope

Narda Pro is a commercial **Telegram Mini App** for playing backgammon (narda)
online — versus other players, in ranked/casual matches, tournaments, and against
an AI. This document defines the system architecture: its structure, the major
decisions behind it, and the constraints every phase must respect.

**Primary quality attributes**, in priority order:

1. **Fairness / integrity** — outcomes must be tamper-proof (server-authoritative).
2. **Scalability** — target 1,000,000+ users, 100,000+ concurrent matches.
3. **Low latency** — real-time play must feel instant (<150 ms perceived move latency).
4. **Security** — enterprise-grade auth, anti-cheat, auditability.
5. **Maintainability** — modular, testable, documented.

---

## 2. Architectural drivers & constraints

| Driver | Implication |
|--------|-------------|
| Runs inside Telegram WebView | Auth via Telegram `initData`; constrained viewport; TG design language |
| Real-money-adjacent economy | Server-authoritative state, audit logs, idempotent transactions |
| Massive concurrency | Stateless HTTP nodes, Redis-backed sockets, horizontal scaling |
| Anti-cheat is existential | No trust in client; dice RNG server-side; replay/audit trails |
| Multi-region market | i18n from day one; latency-aware matchmaking later |

---

## 3. High-level architecture

Narda Pro is a **modular monolith** at the service level (one deployable NestJS
API), internally organized with **Clean Architecture + Domain-Driven Design** so
that bounded contexts (Game, Matchmaking, Economy, Tournament, Social, Identity)
can later be extracted into independent services **without rewrites**. This gives
us the delivery speed of a monolith now and a clean seam for microservices when
scale demands it.

```
                         ┌───────────────────────────┐
        Telegram         │   Telegram Mini App (web)  │
        client  ───────► │  React + Vite + PixiJS     │
                         └─────────────┬─────────────┘
                                       │ HTTPS (REST)  +  WSS (Socket.IO)
                              ┌────────▼─────────┐
                              │      Nginx        │  TLS, rate-limit, LB
                              └────────┬─────────┘
                   ┌───────────────────┼────────────────────┐
                   │                   │                    │
            ┌──────▼──────┐    ┌───────▼───────┐    ┌───────▼───────┐
            │  API node 1 │    │  API node 2   │ …  │  API node N   │  (stateless)
            │  NestJS      │    │  NestJS       │    │  NestJS       │
            └──────┬──────┘    └───────┬───────┘    └───────┬───────┘
                   └───────────┬───────┴──────────┬─────────┘
                               │                  │
                     ┌─────────▼────────┐  ┌──────▼─────────┐
                     │   PostgreSQL     │  │     Redis       │
                     │ (source of truth)│  │ cache · pub/sub │
                     └──────────────────┘  │ socket adapter  │
                                           │ matchmaking Q   │
                                           └─────────────────┘
```

### Why these choices

- **Modular monolith over microservices (now):** avoids premature distributed-systems
  complexity (network partitions, distributed transactions) while a single team
  builds the product. DDD bounded contexts keep the extraction path open.
- **Redis for socket fan-out & queues:** the Socket.IO Redis adapter lets any API
  node deliver events to any connected client, so nodes stay stateless and scale
  horizontally behind a load balancer.
- **PostgreSQL as the single source of truth:** ACID guarantees matter for coins,
  match results, and tournament payouts. Redis is a cache/coordination layer, never
  the record of truth for money or results.

---

## 4. Layered design (per bounded context)

Each context follows the same four-layer Clean Architecture split:

```
┌─────────────────────────────────────────────┐
│ Presentation  — REST controllers, WS gateways │  (I/O adapters)
├─────────────────────────────────────────────┤
│ Application   — use-cases, CQRS handlers      │  (orchestration)
├─────────────────────────────────────────────┤
│ Domain        — entities, value objects,      │  (pure business rules,
│                 domain services, events        │   zero framework deps)
├─────────────────────────────────────────────┤
│ Infrastructure— Prisma repos, Redis, adapters │  (technical detail)
└─────────────────────────────────────────────┘
```

**Dependency rule:** dependencies point *inward*. Domain knows nothing about
NestJS, Prisma, or HTTP. This is what makes the game engine a standalone,
100%-testable package (`packages/game-engine`) reused by the server.

Patterns applied:

- **Repository pattern** — persistence hidden behind interfaces; domain depends on
  the interface, infrastructure provides the Prisma implementation.
- **Dependency injection** — NestJS providers wire implementations to interfaces.
- **CQRS** — commands (mutations) and queries (reads) are separated where it pays
  off (game actions, economy). Not applied dogmatically to simple CRUD.
- **Event-driven** — domain events (`MatchFinished`, `CoinsSpent`, `PlayerBanned`)
  decouple side-effects (stats, rewards, notifications, analytics).

---

## 5. Bounded contexts

| Context | Responsibility | Key aggregates |
|---------|----------------|----------------|
| **Identity** | Telegram auth, sessions, JWT/refresh, profiles | `User`, `Session` |
| **Game** | Backgammon rules, match lifecycle, moves, replays | `Match`, `BoardState`, `Move` |
| **Matchmaking** | Queues, ranked/casual/private pairing, ELO | `Ticket`, `Lobby` |
| **Economy** | Coins/gems, shop, purchases, daily/season rewards | `Wallet`, `Transaction`, `Product` |
| **Tournament** | Brackets, scheduling, prize distribution | `Tournament`, `Bracket`, `Standing` |
| **Social** | Friends, chat, presence, invites | `Friendship`, `ChatMessage` |
| **Progression** | ELO, achievements, battle pass, leaderboards | `Rating`, `Achievement`, `Pass` |
| **Admin** | Moderation, bans, economy control, reports | `Ban`, `AuditLog`, `Ticket` |

The **game engine** (`packages/game-engine`) is the beating heart of the Game
context: a pure, deterministic, framework-free library. It is built first (Phase 1)
because everything else depends on its correctness.

---

## 6. Real-time model

- **Transport:** Socket.IO over WSS, namespaced (`/game`, `/lobby`, `/chat`).
- **Rooms:** one Socket.IO room per match; spectators join read-only.
- **Authority:** the client sends *intents* (`ROLL`, `MOVE`, `DOUBLE`). The server
  validates against authoritative board state, applies the move, then broadcasts the
  resulting state. Clients render; they never compute outcomes.
- **RNG:** dice are generated server-side with a CSPRNG; each roll is logged with a
  seed commitment for post-hoc audit (provable fairness).
- **Reconnect:** match state lives in Redis + Postgres; a dropped client re-authenticates
  and resumes from authoritative state. Per-move and per-turn timers run server-side.
- **Heartbeat:** ping/pong liveness; abandoned players forfeit on timeout.

---

## 7. Security architecture (overview)

Detailed in a dedicated Security Design doc; the pillars:

- **AuthN:** Telegram `initData` HMAC validation → issue short-lived JWT access +
  rotating refresh tokens. `auth_date` freshness check blocks replay.
- **AuthZ:** role-based (player, moderator, admin) guards on every endpoint & event.
- **Transport:** TLS everywhere; strict CORS; secure/httpOnly refresh cookies where applicable.
- **Input:** DTO validation (class-validator) + server-side domain invariants. SQL
  injection prevented by parameterized Prisma; XSS by output encoding + CSP.
- **Anti-cheat:** server-authoritative moves, server RNG, move-legality checks,
  timing/behavioral anomaly detection, and full audit logs.
- **Abuse:** layered rate limiting (Nginx + app), bot detection, replay protection
  via nonces/idempotency keys.
- **Data at rest:** sensitive columns encrypted; secrets from a vault, never in git.

---

## 8. Data & caching strategy

- **Postgres** — normalized schema (3NF) with deliberate, measured denormalization
  for hot read paths (e.g. leaderboard snapshots). Strong FK constraints and indexes.
- **Redis** — session cache, matchmaking queues, live match state, presence,
  leaderboards (sorted sets), rate-limit counters, Socket.IO adapter, pub/sub bus.
- **Migrations** — Prisma Migrate, forward-only in production, reviewed in CI.
- **Money invariants** — every economy mutation is a single DB transaction with an
  idempotency key and an append-only ledger entry; balances are derivable and auditable.

---

## 9. Observability

- **Metrics:** Prometheus (RED/USE metrics) → Grafana dashboards + alerts.
- **Errors:** Sentry (frontend + backend), release-tagged.
- **Logs:** Winston, structured JSON, correlation IDs propagated through requests
  and socket events.
- **Tracing:** OpenTelemetry-ready hooks for cross-context request tracing.

---

## 10. Deployment topology

- **Local:** `docker compose` (Postgres + Redis) + `pnpm dev`.
- **Prod:** containerized API replicas behind Nginx; managed Postgres (primary +
  read replica) and managed Redis; blue/green or rolling deploys gated on health checks.
- **CI/CD:** GitHub Actions — lint, typecheck, test, build, image publish, deploy.
- **Cloud-agnostic:** targets AWS / DigitalOcean / Hetzner; no proprietary lock-in.

---

## 11. Scaling path

| Stage | Trigger | Action |
|-------|---------|--------|
| 1 | Launch | Single API node + managed DB/Redis |
| 2 | Growth | Horizontal API replicas, Redis adapter, read replicas |
| 3 | Scale | Extract Game & Matchmaking into dedicated services; dedicated game-server fleet |
| 4 | Global | Multi-region deployment, latency-aware matchmaking, edge caching |

The modular-monolith + bounded-context design means stages 3–4 are **extractions**,
not rewrites.

---

## 12. Phase roadmap

| Phase | Scope |
|-------|-------|
| 0 | Foundation: monorepo, tooling, Docker, this document *(current)* |
| 1 | Game engine: full rules, dice, validation, replays — pure & tested |
| 2 | Backend platform: auth, users, Prisma schema, Redis |
| 3 | Realtime: Socket.IO, matchmaking, rooms, reconnect, anti-cheat |
| 4 | Economy: coins/gems, shop, rewards, battle pass, referrals |
| 5 | Tournaments: brackets, scheduling, prize distribution |
| 6 | Frontend: React/Vite/PixiJS board, UI, animations |
| 7 | AI opponent: 5 difficulty tiers |
| 8 | Admin + analytics |
| 9 | Ops hardening: monitoring, load/security testing, deploy |

---

## 13. Open decisions

| # | Decision | Default / recommendation |
|---|----------|--------------------------|
| D1 | Payment rails | Telegram Stars first; Payme/Click (UZ) later |
| D2 | Delivery cadence | Sub-phase increments with approval gates |
| D3 | First milestone | Playable end-to-end vertical slice |

_These defaults are assumed until overridden._
