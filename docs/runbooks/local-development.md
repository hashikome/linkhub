# Local Development

## Prerequisites

- Bun 1.3+
- Docker (for PostgreSQL 18 + Redis 7)

## First Run

```bash
bun install                                # also runs `prisma generate` (postinstall)
bun run infra:up                           # local services: PostgreSQL 18 + Redis 7 (docker compose up -d)
(cd apps/api && bunx prisma migrate deploy)
bun run dev                                # infra + API watcher + email worker + Next.js watcher
```

The repository is a Bun workspace; the backend is `apps/api`. Root scripts
delegate with exact workspace-name `--filter` selectors, so day-to-day commands
run from the root. Use directory selection for tools whose configuration depends
on the current directory, such as Prisma. Prisma CLI commands run
from `apps/api` (that is where `prisma.config.ts` lives). The app reads
`.env` from `apps/api/.env`.

Local Compose runs PostgreSQL and Redis only. The API and email worker run
directly on the host; Next.js runs locally too. No
application Docker image is needed for this loop. `bun run verify` includes
application compilation to catch build errors, but does not build images.
Image builds and runtime rehearsals belong to
[deployment preparation](release.md).

`.env` is optional locally: without it, the code falls back to the standard
local defaults (`postgresql://postgres:postgres@127.0.0.1:5436/nslinkhub`,
Redis on 127.0.0.1:6383, dev better-auth secret). Set `BETTER_AUTH_SECRET` to
a real value for anything beyond local development.

## Everyday Commands

Root scripts follow the `<service>:<action>` convention (`infra:*`, `api:*`,
`email:*`, `types:*`, `web:*`). Bare `dev` is the daily
orchestrator: it brings up infrastructure, API/worker watchers and Next.js.
It delegates to each workspace's script: API
`start:dev`, worker `email:worker:dev` and web `dev`. It prints the starting
services and URLs; the custom web server prints `[web] Ready at ...` once it
has bound its socket. A child failure names the process that stopped the stack.
Open the printed web URL (normally `http://localhost:3000`); the API's structured
startup logs are separate from web readiness. The first page request compiles
that route in development.
It refuses occupied API/web ports and shuts down its owned process groups
together; independently started apps are never killed. Before checking ports it
resolves `PORT` in the API's working directory with Bun's `.env`,
`.env.development`, `.env.local` and inherited environment precedence. It pins
that effective port for the API child and web API origin. Shell values win.

```bash
bun run dev              # daily: infra + API/worker + Next.js
bun run infra:up         # PostgreSQL 18 + Redis 7 (docker compose up -d)
bun run infra:down       # stop the local services
bun run api:dev          # infra:up + API watch mode
bun run api:build        # nest build → dist/
bun run api:prod         # compiled API entrypoint
bun run check            # biome format + lint, with autofix (workspace-wide)
bun run lint             # biome lint (no writes)
bun run api:test         # API unit + e2e (e2e requires the infra services)
bun run email:test       # email template tests
bun run web:dev           # Next.js only (+ infra); start API separately
bun run web:build         # compile Next.js, no Docker image
bun run test:browser      # isolated real-API production browser journey
bun run verify           # source checks + unit/e2e tests + API/web builds
```

Swagger UI: `http://localhost:4000/api/docs`.

## Resetting Local Data

The dev database is disposable. To rebuild it from the migration baseline:

```bash
docker exec nslinkhub-postgres psql -U postgres \
  -c "DROP DATABASE nslinkhub" -c "CREATE DATABASE nslinkhub"
(cd apps/api && bunx prisma migrate deploy)
```

(Terminate connections first if the drop is refused; stopping the dev server
is usually enough, or use `DROP DATABASE nslinkhub WITH (FORCE)`.)

Then load the demo content: real collections curated from the engineering
toolkit (`apps/api/prisma/seed/toolkit.ts`), with titles read from the pages.
Rerunning replaces the curator's collections.

```bash
bun run db:seed                                    # curator seed-curator@nslinkhub.dev
SEED_OWNER_EMAIL=you@example.org bun run db:seed   # into the account you sign in with
SEED_OFFLINE=1 bun run db:seed                     # no network: curated fallback titles
```

## Notes

- The better-auth handler is mounted before body parsers
  (`src/app.setup.ts`); e2e tests boot through the same `configureApp` so
  local behavior matches tests.
- `compose.yml` is local development only — production topology is
  `docker-stack.<env>.yml` (see `docs/design-docs/infra-deployment.md`).


## Email delivery

Authentication is email-code-only, with no password signup or fallback. The API commits encrypted
mail to PostgreSQL; `bun run dev` starts the worker to relay and deliver it. For
the API-only loop, run `bun run --filter @nslinkhub/api email:worker` separately. Apply migrations before starting the API or worker. Local
infrastructure still comes from `bun run infra:up`.

`EMAIL_PROVIDER=capture` (default) uses bounded in-memory capture with no log or
HTTP exposure. Automated tests inject and inspect that sender. For development
with Resend, set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` (or `_FILE`) and
`EMAIL_FROM_ADDRESS` in the ignored API `.env`; this sends real mail when the
worker runs. Tests always override this to capture. Set `EMAIL_SUPPORT_URL` to
the HTTPS recovery/support route and `QUEUE_NAMESPACE` to an environment-unique
name; both are required in production. Point `EMAIL_SUPPORT_URL` at the web
`/support` page; set `SUPPORT_EMAIL` on the web server to the address that page
shows (without it the page says support isn't set up yet). `RESEND_WEBHOOK_SECRET` (or `_FILE`)
enables signed delivery callbacks at `/api/v1/webhooks/resend`; without it the
endpoint fails closed with 503. Do not enable open/click tracking.

Set `EMAIL_SUPPRESSION_SECRET` (or `_FILE`) to an independent random secret of
at least 32 characters. Production requires it; development has a stable local
default. Keep the same value on API/worker replicas and across auth-secret
rotation and database restore. Never rotate it without an operator-reviewed
suppression rekey/import, since suppression rows do not store raw addresses.

The worker uses the same database, auth secret and Redis configuration as the
API. Production runs `bun run --filter @nslinkhub/api email:worker:prod` from the API
image. Do not share queue namespaces between deployments or test runs. Pending
codes expire after five minutes; delivery stops after expiry. Run the worker
for cleanup even during provider/Redis outages. Retention and endpoint contracts
are in [auth delivery](../design-docs/auth-delivery-integration.md).

## Web development

Open `http://localhost:3000` after `bun run dev` for the landing page. `/discover`
and `/c/<id>` are available alongside public hubs, profile/settings,
notifications, email-code sign-in, capture, collection details editing,
discussion, History and `/manage`. Resource organization and sharing controls
remain planned. The
root orchestrator sets `BETTER_AUTH_URL=http://localhost:3000` (or `WEB_PORT`)
and the trusted `API_INTERNAL_ORIGIN=http://127.0.0.1:4000` (or `PORT`). Use
`localhost` for the web entry so browser origin checks match. If starting
processes separately, give both API and web the same public `BETTER_AUTH_URL` explicitly,
and set the same random `WEB_SOURCE_SECRET` (at least 32 characters) for API and
web. Root `bun run dev` supplies a fresh shared secret automatically.

The browser has no API-origin environment setting. Server reads use
`API_INTERNAL_ORIGIN` (or `_FILE`, which takes precedence); production requires
an explicit bare HTTP(S) origin. Development defaults to the local API port.
Only API processes load `apps/api/.env`; the orchestrator reads just its effective
port through a Bun subprocess. Server secrets never enter web props
or bundles. `bun run dev` starts the email worker, so existing Resend settings
continue to send real mail when work is queued; tests always force capture.

Start production web with `bun run --filter @nslinkhub/web start`, which runs `server.ts`
and preserves per-visitor API read/form budgets. Direct `next start` is unsupported.
Set the same `WEB_SOURCE_SECRET_FILE` on API/web; set `WEB_TRUSTED_PROXY_CIDRS`
on web and `TRUSTED_PROXY_CIDRS` on API to the actual ingress addresses only.
Ingress must overwrite caller-supplied forwarding headers. Web binds loopback
by default; `WEB_HOST` changes its bind address for deployment networking.
Production Next.js serves the web while ingress routes `/api/*` directly to
the API on the same public origin. The dev rewrite is development-only.
`bun run test:browser` creates that routing with disposable loopback processes;
see [verification](verification.md) for browser prerequisites and isolation.

Service operators sign in through the ordinary code flow and receive an explicit
product grant; no development account is automatically privileged. Follow
[service operations](service-operations.md) for the interactive grant/recovery
command. Apply pending migrations before starting API/web; tests use
disposable databases rather than developer data.

## Link metadata and code resend timing

Saved links get their page title, description and site name from the worker
(`bun run dev` starts it; alone: `email:worker:dev` in `apps/api`; see
`docs/SECURITY.md`), usually within seconds; without a running worker, links
show their address until it runs. Set `LINK_TITLES=off` in the API environment
to disable lookups locally. Sign-in codes can be resent once every 30 seconds per address;
`AUTH_CODE_RESEND_SECONDS` (read by both API and web) changes the gap and is set
short only by the isolated browser verification.

## Initial service admin

Set `BOOTSTRAP_ADMIN_EMAIL` in the ignored API environment before startup. The
application emails an invitation. New recipients enter their name and accept
before account creation. Everyone, including signed-in recipients, then verifies
a fresh emailed OTP to activate the role and reach `/manage`. Admins invite operators from
there. See [service operations](service-operations.md) for delivery and recovery.

### A newly added web route still returns 404

If an added route file exists but the running development server still falls
through to the unavailable page, restart `bun run dev` and retry the URL. The
custom development server can retain its earlier route discovery while rendering
updated shared components. Restart the owned launcher, not unrelated servers.
Authenticated pages should redirect an anonymous request to sign-in rather than
return the generic unavailable page. Production browser tests build from the
current route tree; also check the live development URL after adding routes.
