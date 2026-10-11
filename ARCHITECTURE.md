# Architecture

## Purpose

NSLinkHub turns the links people collect into curated, shareable collections.
Each user may own one hub (their publishing space, the tenant root); collections are
shared per collection, Google-Drive style, or published to Discover.

This is the repository's stable system-architecture authority. Product purpose,
users, scope and acceptance criteria belong in `PRODUCT.md`; the visual system
in `DESIGN.md`; detailed subject designs in `docs/design-docs/`; settled
foundations and their rationale in `docs/engineering-decisions/`; repeatable
procedures in `docs/runbooks/`.

```txt
User (1:0..1) Hub → Collections → Resources (links, references, headings)
```

People have usernames and profiles; hubs have independent handles and names.
Signup creates an account and, when explicitly selected, a named hub with a matching
initial username/handle. Otherwise first link/collection creation or receipt of a
transferred collection creates its hub in the same transaction. See
[people and hubs](docs/design-docs/people-and-hubs.md).

There are no memberships, invitations into hubs or hub roles.
Collaboration is per-collection sharing only; a hub is never a space others
join.

The accepted next URL milestone ([ADR-0053](docs/engineering-decisions/0053-id-only-collection-addresses.md))
uses `/c/<collectionId>` for all collection addresses and handles only for hub
resolution. Slug storage and browse lookup in the current codemap below remain
implemented until that migration; collection IDs already survive transfers.

## System Shape

A Bun-managed TypeScript monorepo. The backend is a NestJS modular monolith
backed by PostgreSQL 18 (Prisma 7 with the pg driver adapter); BullMQ on Redis
delivers email from a PostgreSQL outbox through a separate worker. Auth is
self-hosted better-auth (database sessions, bearer plugin, email codes only)
mounted as raw middleware ahead of body parsing. The Next.js web app is an
HTTP-only client; an MV3 browser extension is planned. Browser API requests and
OAuth callbacks reach Nest directly: distinct local ports with exact-origin CORS,
production ingress path routing. BETTER_AUTH_URL addresses the backend and
WEB_ORIGIN addresses web destinations. Native forms/SSR remain delivery adapters
(ADR-0036); Gravatar and all authentication/business rules stay in the API.

```txt
apps/
  api/
    src/
      modules/     domain modules (controllers, services, DTOs)
      common/      guards, audit, request budgets, telemetry, utils
      auth/        better-auth instance/config
      database/    PrismaModule / PrismaService
      generated/   Prisma client (gitignored; regenerated on install)
      entrypoint.ts telemetry-first source/compiled startup and shutdown
      app.setup.ts shared HTTP stack (request budget, auth, parsers, validation)
    prisma/        schema, migrations (prisma.config.ts beside them), seed
    test/          e2e specs (production HTTP stack) and browser journeys
  web/             Next.js client: reading, Discover, Save a link, discussion,
                   settings, verification, operations; native forms at /forms
  extension/       MV3 capture companion (planned, Track W4)
packages/
  config/          TypeScript base plus separate web server/browser configuration
  types/           @nslinkhub/types — shared API wire contracts for clients
  email/           @nslinkhub/email — backend-owned React Email templates
tooling/           boundaries, docs, guide pin, isolated test runner, image rehearsal
compose.yml        local dev services
docker-stack.*.yml local Swarm rehearsal and production topology
docs/              design docs, decisions, exec plans, runbooks, guides
ref/               disposable, git-ignored implementation context
```

## Codemap

| Area | Owns |
| --- | --- |
| `auth` (`apps/api/src/auth`) | better-auth adapter + app-owned signup hooks and shared transactional authentication completion; handler mounted in `app.setup.ts` |
| `common/guards` | `AuthGuard`/`OptionalAuthGuard` via `resolveSessionUser` |
| `hubs` | one-hub-per-user ownership + handle management (`HubsService`), collection access policy — owner → direct share → link → published independently for each collection (`CollectionPolicyService`) |
| `email` (`apps/api/src/email`) | encrypted PostgreSQL outbox, BullMQ relay/worker, capture/Resend providers, signed delivery webhooks and cleanup |
| `sharing` | canonical previews, share entries and reported opens at `/share`; creator/resource-owner analytics and admin metadata obey existing access boundaries |
| `users` | self-service profile at `/profile` (username, full name, optional hub identity, name visibility); public person profiles at `/people/:id` and `/people/by-username/:username` |
| `collections` | collection CRUD, Save a link (`/capture`), publish/unpublish, link + direct sharing, ownership transfer, saves, `/discover`, public hub pages + handle resolution (`/hubs/by-handle/:handle`), `/me/{shared,saved,people}`, hub+slug lookup and the durable id permalink (`GET /collections/:id`) |
| `resources` | items (links with server-resolved titles, same-owner collection references, headings), tags, reorder with version checks, public-address rule, link preview |
| `imports` | private reviewed bookmarks/CSV/TXT drafts, shared metadata lookups and owner-authorized batched commits |
| `recovery` | service-authenticated, encrypted temporary payload storage for oversized interrupted web actions; no domain access authority |
| `exports` | synchronous export (`POST /exports`): markdown/PDF/Word, one document per collection, zipped when several — programmatic renderers, no queue |
| `avatars` | public active-account Gravatar proxy at immutable user-ID URLs; deterministic SVG fallback from safe seeds |
| `health` | liveness (`/health`) + per-dependency readiness (`/status`: postgres, queue Redis → ready/degraded/unavailable; 503 when postgres is down) |
| `comments` | collection discussion: questions, replies, accepted answers, hiding |
| `operations` | service operators and admins: account restrictions, collection holds, invitations, audit, notifications |

## Domain Model

```txt
User            — global identity (better-auth). userId immutable; name (the
                  full name), username and bio editable; account email fixed (ADR-0041).
                  Private timeZone preference is nullable (Automatic/device); explicit
                  IANA choices persist across devices (ADR-0045).
                  Avatars use the backend Gravatar/generated projection; stored vendor
                  image URLs do not select the displayed picture. No role column.
Hub             — the user's optional publishing space. hubId immutable; ownerUserId
                  (unique FK, at most one per user); handle (unique, editable every 30 days; no reuse, ADR-0043) — the public
                  identity; name and description.
HubHandleReservation — issued handle and originating hub ID; survives hub deletion.
Collection      — belongs to a hub (hubId = owner). creatorUserId immutable
                  (provenance). slug (unique per hub), title, description,
                  published, linkSharingEnabled, share_token_hash, version.
Resource        — an item in a collection; the smallest unit of content.
                  kind = external_link (its own canonical `url`, one per
                  collection) | collection_link (linkedCollectionId) | heading.
                  title_override holds a section's text (never a link's
                  title), added_by_user_id (who added it), tags (ItemTag relation),
                  position, version. What belongs to
                  an item (address, page title, target, section text) is
                  fixed; tags, position and heading descriptions are editable
                  context; per-item notes remain planned.
Tag             — UUIDv7 identity with a unique normalized name.
ItemTag         — item/tag association, retaining the item's tag order.
CollectionTag   — stored collection/tag association with an internal item count;
                  database triggers synchronize it with item assignments.
AuditLog        — unified content, operation and authentication evidence.
                  Actor/action/target/effect, with category-based access and
                  retention. Content events drive collection attribution.
LinkMetadata    — one row per canonical address: page title, description,
                  site name (text only); a pending row is the durable lookup
                  job the worker claims (docs/design-docs/collections-and-resources.md).
ShareEntry/ShareOpen — authenticated share requests and idempotent reported opens;
separate from grants, with creator history, owner aggregates and admin metadata.

CollectionShare — (collectionId, userId, role viewer|contributor, source
                  direct|link). Per-collection access without any hub
                  membership. Feeds the shared/ surface.
CollectionSave  — (collectionId, userId, savedAt). A social-style bookmark of a
                  published collection. Feeds the saved/ surface.
CollectionComment — the collection's discussion (`docs/design-docs/discussion.md`).
CaptureReceipt  — user-scoped retry identity for Save a link (ids and an input
                  fingerprint only).
Operator tables — OperatorGrant, AdminGrant, ServiceInvitation, CollectionHold
                  (`docs/design-docs/service-operations.md`).
```

(No export entity: exports are synchronous and stateless — see `docs/design-docs/exports.md`.)

## Dependency Rules

- Controllers depend on services; services depend on `PrismaService` and
  policy helpers. Modules do not reach into another module's persistence.
- better-auth types stay behind `resolveSessionUser`; everything downstream
  consumes `AuthUser`.
- Prisma schema, migrations, generated client, and `PrismaService` are
  backend-private. Clients consume the API over HTTP and the
  `@nslinkhub/types` wire contract only; `tooling/check-client-boundaries.ts`
  (run by `bun run verify`) fails if a client imports `apps/api` internals or
  Prisma.
- The better-auth handler mounts before body parsers (`app.setup.ts`);
  global middleware must respect that ordering.
- Packages use the `@nslinkhub/*` scope.

## Client Surfaces

**Web** is the full surface (explore, hub page, collections, resources, tags,
sharing, transfer, saves, account); `PRODUCT.md` §11 lists what it has today. **Extension** is a
constrained capture companion (authenticate, pick collection, capture the tab
or selection via popup/context-menu/shortcut) using the existing
external-resource endpoint; no management surface, no reimplementation of
dedupe or publication rules; bearer-token auth in session-scoped storage.

## Runtime Architecture

1. Request hits a controller under `/api/v1`.
2. Global `ValidationPipe` validates/transforms DTOs
   (whitelist + forbidNonWhitelisted).
3. Guards resolve the session (`resolveSessionUser`) and attach `AuthUser`.
4. Services enforce access and business rules, reading/writing through
   Prisma.
5. Successes use the `{ data, meta? }` envelope; failures use the stable
   error envelope `{ error: { code, message, requestId, details } }`, and
   every response carries a server-generated `X-Request-Id`. Growth-prone
   lists paginate by opaque cursor (`meta: { limit, nextCursor }`).

File responses (exports) bypass the JSON envelope: the body is the document
itself with `Content-Disposition: attachment`.

Authenticated mutations run inside one transaction holding a single advisory
lock and recheck the session under it (see `docs/RELIABILITY.md`); network
calls such as page lookups run in the worker, from rows written in the same
transaction (the outbox shape, as for email). Web forms post natively to
`/forms/[action]`, which checks the Origin, calls the API and redirects with a
notice; JavaScript only enhances.

## Deployment Shape

Nothing is deployed yet. The target is the shared namestarlit VPS via Dokploy
Stack mode with prebuilt, SHA-pinned GHCR images; nothing builds on the VPS and
secrets arrive as `_FILE` inputs. See `docs/design-docs/infra-deployment.md`
and `docs/runbooks/release.md`.

## Cross-Cutting Concerns

Authentication, authorization policy, validation, request identity, auditing,
request budgets and telemetry cross module boundaries; the transactional email
outbox joins them. Shared infrastructure belongs under `src/common` or another
explicit shared boundary.

## Architectural Invariants

1. **Immutable IDs are the only identity.** Every entity keys on an immutable
   UUIDv7 (`userId`, `hubId`, `collectionId`, `resourceId`). Human-facing
   values — person **username**, hub **handle**, **display name**, emails — are human-facing
   attributes and never appear in authorization rules, foreign keys, or durable
   route contracts. A durable link uses `hubId`/`collectionId`; renaming a
   handle never breaks a saved reference.
2. **At most one hub per user.** The hub is the tenant root and has one owner
   (`hub.ownerUserId`, unique). Every hub-owned query carries `hubId`; a route
   id never proves access. Accounts may read, comment, receive shares and save published collections without a hub.
3. **Ownership is a transferable relationship, not identity.** A collection's
   owner is its `hubId`; a resource belongs to its collection. Transferring a
   collection reassigns the owning hub; the immutable **creator**
   (`collection.creatorUserId`) never changes.
4. **Collaboration is per-collection, Drive-style.** The only ways a non-owner
   gains access are a direct share (viewer/contributor), an active share link, or
   publication. There is no hub membership or content-admin bypass. The hub
   owner manages their space, subject to service availability
   restrictions; operator authority never grants collection access.
5. **Collections are independent.** A grant applies to one collection and its
   resources. Referencing another collection grants no authority over it. There
   are no parent/child relationships or recursive ownership operations.
6. **Backend authority.** Business rules, validation, authorization, and
   derived state live in the API. Clients are replaceable delivery surfaces; a
   hidden control is not a permission check.
7. **Auth boundary.** better-auth owns credentials, sessions, and verification
   primitives; the product owns identity, authorization, and workflows. Session
   resolution goes through `resolveSessionUser`; services consume `AuthUser`.
   Sign-up onboarding (generated identity and optional hub) is app-owned and
   callable from any auth path. Shared transactional completion owns session
   assurance and successful authentication evidence (ADR-0046), so later SSO
   integrates with these boundaries rather than duplicating their rules.
8. **Stable envelopes.** Success `{ data, meta? }`; failure
   `{ error: { code, message, requestId, details } }`; every response carries a
   server-generated PII-free `X-Request-Id`. Growth-prone lists paginate by
   opaque cursor.
9. **Naming boundaries.** Product branding stays out of schemas, table/column
   names, API fields, and env-var names.

Conventions: Bun toolchain + runtime; Prisma as the
backend-only persistence boundary behind a Nest `PrismaService`; PostgreSQL 18
with `app_uuid_v7()` defaults; `timestamptz` UTC; camelCase API / snake_case
DB; global `ValidationPipe`; self-hosted better-auth with email codes; Biome; `bun test`; committed `bun.lock`.

The non-negotiable invariants for contributors are listed in `AGENTS.md`;
security and reliability rules in `docs/SECURITY.md` and `docs/RELIABILITY.md`.

## Further Reading

- `PRODUCT.md`, `DESIGN.md`
- `docs/README.md` — the documentation map
- `docs/design-docs/README.md` — focused designs
- `docs/engineering-decisions/README.md`
- `docs/CORE_BELIEFS.md`, `docs/SECURITY.md`, `docs/RELIABILITY.md`
- `docs/runbooks/local-development.md`, `verification.md`, `migrations.md`
- `docs/exec-plans/tech-debt-tracker.md`
