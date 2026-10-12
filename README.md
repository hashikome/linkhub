# ntumie.

**ntumie. (formerly LinkHub)** turns related web resources into maintained,
shareable guides. **Good links belong together.**

Source: [hashikome/ntumie](https://github.com/hashikome/ntumie). The selected
product domain is [ntumie.link](https://ntumie.link). Production CI/CD deployed the
application on 12 October 2026; public-launch acceptance remains separate. See the
[release record](docs/runbooks/release.md) for verified behavior and remaining gates.

The application is in development. The NestJS API owns the product rules; the
Next.js web app uses its HTTP contracts.

## What works today

- Save links into ordered collections with tags, sections, and references to
  other collections in the same owner's hub. Each person may own one hub.
- Publish collections, share them directly with viewers or contributors, or
  enable link sharing. New collections default to published; callers can
  explicitly choose private. References never grant access to their targets.
- Review bookmarks HTML, CSV, and plain-text imports before saving them.
  Each collection draft has its own publication choice and background import
  job; failed rows remain available for repair. Drafts stay private until import.
- Export collections as Markdown, PDF, or Word documents, zipped when several
  collections are selected. Exports are synchronous downloads.
- Sign in with email codes, configured Google sign-in, or registered passkeys.
  Account creation requires explicit consent. Account settings include optional
  TOTP protection, sessions, profile details, and hub identity.
- Browse Discover, public hubs and profiles; read and discuss collections;
  manage sharing, imports, notifications, and collection history.

The [product definition](PRODUCT.md#11-delivery) distinguishes implemented
features from planned work. Billing, shared company IAM, and the browser
extension are not implemented. Production uses shared company PostgreSQL and queue Redis.

## Start locally

Use Bun 1.3.14 (the CI version), Docker with Compose, and Git.

```bash
git clone git@github.com:hashikome/ntumie.git
cd ntumie
bun install
bun run infra:up
(cd apps/api && bunx prisma migrate deploy)
bun run dev
```

`bun install` generates the Prisma client and installs the repository's pre-push
hook. `bun run dev` starts PostgreSQL/Redis, the API and background worker,
and the web app. It does not seed synthetic content into development data.

- Web: `http://localhost:3004`
- API documentation: `http://localhost:4004/api/docs`
- Liveness: `http://localhost:4004/api/v1/health`
- Dependency readiness: `http://localhost:4004/api/v1/status`

Local database and Redis configuration is built in; no `.env` is needed for
the basic stack. Defaults are PostgreSQL on `127.0.0.1:5436` (database
`nslinkhub`) and Redis on `127.0.0.1:6383`. The Compose project and containers
use `ntumie`; workspace packages use `@ntumie/*`. The physical database keeps
its existing name so the rename does not reset development data.

For an existing checkout, keep its PostgreSQL volume through the ignored root
`.env` settings `POSTGRES_VOLUME_NAME=<existing-volume>` and
`POSTGRES_VOLUME_EXTERNAL=true`. Fresh checkouts create `ntumie_pgdata`.
See [local development](docs/runbooks/local-development.md) before switching an
existing Compose project; never use `down --volumes` for a rename.

For email capture or delivery, optional environment overrides, individual
processes, and port configuration, use the
[local development runbook](docs/runbooks/local-development.md). Google sign-in
requires provider configuration; see
[passwordless security](docs/design-docs/passwordless-security.md).
Deployment secrets use `_FILE` inputs; see the
[release runbook](docs/runbooks/release.md).

## Verification

```bash
bun run infra:up
bun run verify:isolated   # full gate without touching an active dev build
bun run api:test          # API unit tests
bun run api:test:e2e      # API integration tests with disposable databases
bun run email:test
```

`bun run verify` is the canonical gate: documentation freshness, boundaries,
formatting, linting, types, tests, and API/web builds. The isolated wrapper runs
that same gate in a temporary checkout. Browser changes also require
`bun run verify:isolated test:browser`.

The pre-push hook runs verification; it does **not** update the onboarding
guide's commit pin. If `check:guide-pin` fails, review the affected guide
sections against the implementation, correct any drift, then refresh the pin
in a guide-only commit. A passing check before a source commit does not prove
that the resulting commit has a current pin. See
[verification](docs/runbooks/verification.md) for the complete workflow.

## Repository map

| Location | Purpose |
| --- | --- |
| `apps/api` | NestJS API, background worker, Prisma schema and migrations |
| `apps/web` | Next.js web app with native form fallbacks |
| `packages/types` | Shared API wire contracts |
| `packages/email` | Transactional email templates |
| `packages/config` | Shared configuration and runtime entry points |
| `tooling` | Development, verification, and release tooling |
| `docs` | Designs, engineering decisions, runbooks, and execution plans |

The stack uses Bun, TypeScript, NestJS, Next.js/React/Tailwind, PostgreSQL 18,
Prisma, Redis/BullMQ, and self-hosted better-auth. Client code uses API contracts
and never imports backend persistence internals.

## Authentication and avatars

Browser sessions use HttpOnly cookies. API clients can use the session token
returned in the `set-auth-token` header as `Authorization: Bearer <token>`.
Email-code endpoints live under `/api/v1/auth/code/`; verification for a new
account requires `createAccount: true`. Protected accounts must complete their
additional factor before receiving a usable session. Swagger and the
[onboarding walkthrough](docs/guides/developer-onboarding-walkthrough.md)
cover the request sequence.

Account avatars use `/api/v1/users/:id/avatar`. The API checks account eligibility
and proxies Gravatar, falling back to a deterministic generated SVG when no
eligible picture is available. Browsers do not select a vendor image directly.
Uploaded profile photos are not implemented.

## Contributing and documentation

Start with the [onboarding walkthrough](docs/guides/developer-onboarding-walkthrough.md)
and [repository guide](AGENTS.md), then read the relevant authorities:

- [Product definition](PRODUCT.md)
- [Architecture](ARCHITECTURE.md)
- [Visual design](DESIGN.md)
- [Documentation map](docs/README.md)
- [Engineering decisions](docs/engineering-decisions/README.md)
- [Migration discipline](docs/runbooks/migrations.md)
- [Planning conventions](PLANS.md)
- [Changelog](CHANGELOG.md)

Historical decisions and completed plans retain the earlier LinkHub and
NSLinkHub names. [ADR-0060](docs/engineering-decisions/0060-ntumie-repository-and-branding.md)
records the rename and compatibility boundaries. Shared IAM and infrastructure
implementation remain separate work. Application authorization stays product-owned.
