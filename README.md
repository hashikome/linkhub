# NSLinkHub

NSLinkHub organizes and shares curated link collections. The NestJS API owns
the product rules; the Next.js web app reads through its HTTP contracts.

## Working In This Repository

- **New here?** Walk `docs/guides/developer-onboarding-walkthrough.md` — six
  hands-on sessions from zero to ready-to-build (commit-pinned; freshness is
  enforced by `bun run verify`).
- Then `AGENTS.md` — the contributor/agent map: reading order, toolchain
  rules, non-negotiable invariants, and documentation conventions (ExecPlans
  in `docs/exec-plans/`, disposable context in git-ignored `ref/`, completed
  work in `CHANGELOG.md`).

## Current Documentation

- Product definition: `PRODUCT.md`
- System architecture (Drive individual model): `ARCHITECTURE.md`
- Visual design system: `DESIGN.md`
- Documentation map: `docs/README.md`
- Onboarding walkthrough: `docs/guides/developer-onboarding-walkthrough.md`
- ns-series identity direction: `docs/design-docs/identity-sso.md`
- ns-series deployment direction: `docs/design-docs/infra-deployment.md`

## Implemented So Far

- **Collection backend:**
  at most one hub per person, independent collections with references and headings,
  external resources with canonical URLs + tags, collection-level sharing
  (link/direct/publish per collection), collection ownership
  transfer, saves, explore, id permalinks + handle resolution
- Auth via self-hosted [better-auth](https://better-auth.com) (email codes, DB-backed sessions, bearer tokens for API clients); signup creates a person with a username; first collection ownership creates their optional hub
- Synchronous export (Markdown/PDF/Word; multi-collection, zipped) and
  imports (bookmarks-HTML + universal CSV with per-row error reports)
- `@nslinkhub/types` (wire contracts) and `@nslinkhub/email` (code-email
  templates); liveness + per-dependency readiness endpoints; `_FILE`
  deployment-secret contract with zero-config dev
- Web journeys include Discover, collection reading and discussion, link capture,
  profiles, settings, notifications and service operations, with native form
  fallbacks. See `PRODUCT.md` §11 for delivery status and the remaining slices.
  Swagger stays at `/api/docs`.

## Generated avatars

Generated profile avatars are served by `GET /api/v1/avatars/:seed.svg?size=64`
(size 16–512) with immutable caching and conditional ETags. Account clients use
the immutable user UUID as the seed, never email or name.
`GET /api/v1/users/:id/avatar` redirects a UUID to its generated image without
looking up an account. The generator's tuned palette, shapes and hash constants
must not change casually: changing them changes users' avatars and requires a
versioned image URL. Uploaded photos are not implemented.

## Tech Stack

- Bun (package manager **and** runtime)
- NestJS API and Next.js/React/Tailwind web
- PostgreSQL + Prisma (with `@prisma/adapter-pg`)
- better-auth (sessions, bearer plugin; credentials and sessions; product-owned usernames and hub handles)
- BullMQ + Redis
- class-validator/class-transformer

## Prerequisites

- Bun 1.3+
- Docker (or local PostgreSQL + Redis)

## Environment Variables

Recommended `.env` values:

```bash
# API port; 3000 belongs to the web app (Next.js dev default).
PORT=4000

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5436/nslinkhub

BETTER_AUTH_SECRET=change-me-to-a-long-random-string
BETTER_AUTH_URL=http://localhost:4000

# Queue Redis (email delivery; checked by /status)
REDIS_URL=redis://127.0.0.1:6383
```

When `DATABASE_URL` or `REDIS_URL` is unset, the local dev defaults
(`postgresql://postgres:postgres@127.0.0.1:5436/nslinkhub`,
`redis://127.0.0.1:6383`) are used.

Deployment secrets use the `_FILE` contract: `DATABASE_URL_FILE`,
`BETTER_AUTH_SECRET_FILE`, and `REDIS_URL_FILE` point at secret files
(docker/swarm secrets) and take precedence over the plain variables.

## Install

```bash
bun install   # also runs `prisma generate` (postinstall)
```

## Local services

```bash
bun run infra:up       # PostgreSQL 18 + Redis 7 (docker compose up -d)
bun run infra:down     # stop them
```

## Repository Layout

Bun workspace: the backend is `apps/api` (`@nslinkhub/api`); shared tooling
config and runtime entry points live in `packages/config`; the web is `apps/web`. Root scripts delegate, so everything below
runs from the repository root.

## Migrations

Migrations are managed by Prisma Migrate in `apps/api/prisma/migrations`
(Prisma commands run from `apps/api`, where `prisma.config.ts` lives):

```bash
cd apps/api && bunx prisma migrate deploy
```

To evolve the schema, edit `apps/api/prisma/schema.prisma` and use
`bunx prisma migrate dev --create-only`, then review the generated SQL —
several database objects (the `app_uuid_v7()` function, `set_updated_at`
triggers, CHECK constraints, and partial
unique indexes) exist only in migration SQL and must never be dropped by an
auto-generated diff.

## Run

```bash
# daily driver (script convention: <service>:<action>; dev = orchestrator)
bun run dev        # infra up + API/worker watchers + Next.js (:3000)
bun run api:dev    # API-only loop on :4000

# build + prod
bun run api:build
bun run api:prod

# tests
bun run api:test       # API unit + e2e (e2e needs services running)
bun run email:test     # email template tests
```

## Auth

Auth endpoints are served by better-auth under `/api/v1/auth/*`. The main ones:

- `POST /api/v1/auth/code/send` — `{ email }` (request a code)
- `POST /api/v1/auth/code/verify` — `{ email, code, name? }` (sign in or create a verified account; optional name applies only at creation)
- `POST /api/v1/auth/sign-out`
- `GET  /api/v1/auth/get-session`

Browser clients get an HttpOnly session cookie. API clients read the session
token from the `set-auth-token` response header on sign-in and send it as
`Authorization: Bearer <token>` (better-auth bearer plugin). Sessions are
DB-backed and refresh themselves server-side.

Code delivery requires the separate email worker. See
[local email setup](docs/runbooks/local-development.md#email-delivery) for
capture/Resend configuration and `bun run --cwd apps/api email:worker`.

## API Docs

When server is running:

- Swagger UI: `http://localhost:4000/api/docs`

## Notes

- Exports are synchronous — the response body is the file (zip when several
  collections are selected); no queue, nothing stored server-side.
- Import parsers are MVP-level and intended for hardening in next iterations.

## Web development and browser acceptance

`bun run dev` starts local PostgreSQL/Redis containers, API/worker watchers and
Next.js. Open `http://localhost:3000` for the landing page; browse published
collections at `/discover`, or open `/username`, `/@handle`, `/@handle/<slug>` or an authorized `/c/<id>` link.
Readiness stays available at `/api/v1/status` for monitoring, without a client
status page. No synthetic content is seeded into dev data.
See [local development](docs/runbooks/local-development.md) for individual
process commands, email settings and the same-origin configuration.

`bun run verify` includes API/web compilation and source/integration checks.
`bun run test:browser` proves the reading journey against isolated fixtures and
a production web build. Docker image acceptance remains deployment work.

The first reading journey is reviewed and committed.
[Public hub and pretty-URL reading](docs/exec-plans/completed/deliver-public-hub-reading.md)
is implemented and reviewed. Both entry points reuse the
collection reader; copied links retain the immutable `/c/<id>` shape.

[Service status](docs/exec-plans/completed/deliver-service-status.md) is implemented
and reviewed. It distinguishes confirmed outages from failed
checks, supports deliberate retry without JavaScript, and keeps internal
dependency details out of the interface.
