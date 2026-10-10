# Deliver separate people and hub identities

## Purpose / Big Picture

People sign in, comment and collaborate as themselves without being given a hub.
Their username opens a public profile at `/username`. A hub is created atomically
when they first save a link, create a collection or receive a collection transfer;
its name and handle stay independent. Existing immutable links and per-collection
access rules continue to work. ADR-0018 and PRODUCT §11 define this slice.

## Progress

- [x] (2026-10-08) Read accepted identity design, trace onboarding, profile,
  attribution, collection creation and web settings; confirm copying policy.
- [x] (2026-10-08) Add username persistence, reserved-name validation and account onboarding;
  move hub creation into first ownership operations.
- [x] (2026-10-08) Deliver public person API, safe contribution lists, username settings,
  person references and optional-hub behavior across clients.
- [x] (2026-10-08) Reconcile fixtures, test new identities and first-use concurrency, inspect
  browser rendering and run full verification/browser gates.
- [x] (2026-10-08) Update authoritative docs, changelog and completed execution record.

## Surprises & Discoveries

- Attribution currently omits people without hubs; comments and History must
  switch together with onboarding, or new readers lose their identity.
- Profile fields already allow a missing hub, but settings and `/hub` assume one.
- Existing owner fixtures needed explicit hub setup; signup fixtures now stay
  hubless, so tests cannot accidentally restore eager creation.
- Operator audit search distinguishes a plain username from an `@hub-handle`,
  since those namespaces can belong to different people.
- Collection transfer is another first ownership operation: the recipient may
  have contributed without a hub and must receive one in the transfer transaction.

## Decision Log

- Implement ADR-0018 as one complete identity milestone. Keep role identifiers,
  `/ops`, item-query routes, subscriptions/home and Manage in their ordered slices.
  Person and hub namespaces change directly with no compatibility aliases.
  Date/Author: 2026-10-08 / Codex.
- User confirmed copying requires source-owner permission and always-visible
  source credit. Record in product/design/ADR now; implementation belongs to
  the later previews/Add to my collection slice. Date/Author: 2026-10-08 / User.
- Preserve ID-based authorization and durable links; public contribution lists
  expose only currently published, available collections. No email or private
  saves are returned. Date/Author: 2026-10-08 / Codex.

## Outcomes & Retrospective

Completed the identity milestone: accounts have independent usernames, public
profiles and name visibility; hubs are optional and created atomically on first
ownership. Attribution includes hubless contributors. Native and enhanced
settings/navigation work in both states. The backend enforces reserved names,
uniqueness and public-content restrictions. No compatibility aliases remain.

Copy permission and mandatory source credit are settled in ADR-0019; their
implementation stays in the previews/Add to my collection slice. Role/route
renames are next; Manage, subscriptions and the other delivery slices remain
separate. Changes are ready for review and uncommitted. Repin the onboarding
guide after the reviewed milestone commit, per its freshness workflow.

## Context And Orientation

Account creation is composed in `apps/api/src/auth/create-auth.ts`; its app-owned
onboarding assigns account usernames. First ownership creates hubs atomically. `modules/hubs` owns hub naming and ownership;
`modules/users` owns self-service profile. `common/people.ts`, collections and
comments map attribution. Prisma schema/migrations are under `apps/api/prisma`.
`packages/types` owns HTTP contracts. Web account settings, navigation, hub and
collection components consume these through HTTP only.

## Plan Of Work

Create a reviewed username migration against a disposable database. Add account
onboarding and transactional lazy hub creation. Update all person attribution and
add a paginated public profile endpoint. Separate person settings from optional
hub settings; render minimal profiles, no-hub guidance and correct navigation.
Reuse existing typography, forms, feedback and native/no-JavaScript behavior.
Update fixtures to create hubs only when testing owned content; add focused
coverage for hubless collaboration, reserved names, privacy, renames and races.

## Concrete Steps

Use Bun and repository tools. Generate migration with `bunx prisma migrate dev
--create-only` in an isolated database; review SQL-only constraints/triggers and
verify Prisma schema parity. Run `bun run check`, `bun run verify` and
`bun run test:browser` in the isolated checkout, using capture email and owned
test databases. Inspect screenshots of profiles/settings with and without hubs.

## Validation And Acceptance

- Signup and service invitations create named accounts without hubs.
- Usernames are independent, unique, validated and reserved against app routes;
  generated defaults never derive from email or UUIDv7 timestamps.
- First save/create/transfer makes at most one hub in the owning transaction;
  failures leave no empty accidental hub. Normal reads/settings don't create it.
- Hubless people can read, comment, receive shares and save published collections.
- Attribution links to person profiles; hub credits link to their owner.
- Public profiles omit hidden names, email, private/held collections and saves.
- Settings and navigation work with/without a hub, with/without JavaScript.
- Existing immutable hub/collection links survive human-readable identity changes.

## Idempotence And Recovery

Use new reviewed migrations; preserve the existing development DB and do not
reset it. Owned verification databases are disposable. Changes remain uncommitted
until the milestone is reviewed. Guide repinning follows the reviewed commit.

## Artifacts And Notes

- `bun run verify`: passed in an isolated checkout, including documentation,
  dependency boundaries, formatting/lint, typechecks, API unit/integration tests,
  web tests and production build. Final log:
  `/tmp/nslinkhub-people-verify-final.log`.
- `bun run test:browser`: 44 passed, zero failed, including hubless profile edits,
  visibility and navigation with and without JavaScript; existing owner,
  capture, discussion and operator journeys remain green. Log:
  `/tmp/nslinkhub-people-browser.log`.
- Migration generated with `prisma migrate dev --create-only`, reviewed and
  applied from empty. Existing-user backfill preserves usable hub handles and
  hidden-name preferences; reserved names receive safe random usernames.
  `prisma migrate diff` reported “No difference detected.”
- The documented local development database was checked by hostname, port and
  database name before applying the sole pending migration with `migrate deploy`.
  Existing data was preserved; no reset was performed.
- Visually inspected mobile owner settings, hubless settings and a public
  person profile. Screenshots: `/tmp/attribution-settings-mobile.png`,
  `/tmp/people-settings-hubless-true.png`,
  `/tmp/people-profile-hubless-false.png`. No horizontal overflow; native
  controls, visible focus and existing design tokens retained.

## Interfaces And Dependencies

Add user `username`, public person profile endpoints and username availability.
`PersonRef` becomes `{ userId, username }`; hub payloads retain their own identity.
Use existing dependencies; no production compatibility layer.
