# Resolve sharing through the API

## Purpose / Big Picture

Every client can preview authoritative sharing information for a profile, hub,
collection or the site from `GET /api/v1/share/resolve`, create a share entry with
POST, and search its own history with GET `/api/v1/share`. The web page becomes a renderer;
clipboard behavior and return navigation remain client-owned.

## Progress

- [x] (2026-10-09) Inspected sharing, identity lookup, collection policy and public origin configuration.
- [x] (2026-10-09) Implemented shared descriptor, API resolver and web consumption.
- [x] (2026-10-09) Full verification passed for the initial read-only descriptor.
- [x] (2026-10-09) Added ShareEntry/ShareOpen persistence, retry-safe creation/open reporting, creator search and three analytics scopes.
- [x] (2026-10-09) Connected authenticated web Copy link and successfully loaded resource pages.
- [x] (2026-10-09) Verified persistence, access/token rules and existing browser sharing journeys; applied the reviewed migration locally.

## Surprises & Discoveries

Collection reads remember link access and assemble contributors/tags. Sharing
resolution needs only identity and policy; it should not create a grant or fetch
that content. Owner access does not prove a presented link token is valid.

The private-collection sign-in journey originally dropped `share_id` in both the
unavailable-page return path and the post-login allowlist. Preserve a validated
UUID through both boundaries; an unavailable page still records no open.

## Decision Log

- 2026-10-09: Use a read-only descriptor endpoint with optional authentication,
  existing token transport, no-store responses and a configured public origin.
- 2026-10-09: Reuse identity visibility and collection policy. Only valid private
  tokens are returned; public links always omit them. Management mutations remain
  on their existing authorized endpoints.

- 2026-10-09: Per user clarification, GET generates the default message; custom text is accepted only in the JSON body of read-only POST and returned separately from the URL.

- 2026-10-09: User expanded POST into record creation with the entire object returned immediately (201), plus searchable GET history and an optional destination label. This supersedes the read-only POST. Records belong to their creator, grant no access, and do not prove delivery. Anonymous previews remain supported at `/share/resolve`. Messages remain JSON data.
- 2026-10-09: Store resource kind/immutable ID, creator, message, destination, timestamp. Never persist bearer link tokens or canonical URLs. Resource descriptors are resolved on reads; unavailable resources return null alongside the creator’s historical entry.

- 2026-10-09: Final user direction supports authenticated API clients and their own activity, current resource-owner aggregates and admin service metadata. No new monetization credentials or analytics dashboards in this milestone.
- 2026-10-09: User approved connecting the web flow. Generated links carry share_id; explicit open reports are idempotent by eventId, counted after current resource policy checks. Preview/rendering is read-only. Creation operationId prevents retry duplication. No IP, user agent or recipient tracking.

## Outcomes & Retrospective

Completed the API and web milestone. Authenticated callers can create complete
share entries, search their own history and read authorized analytics. Copy link
creates a retry-safe entry; successful visible destination reads report opens,
including private collections after sign-in. Anonymous/manual copying remains
available. Social controls, analytics dashboards and paid API credentials remain
deferred. Counts measure requests and reported opens, not delivery or unique people.

## Context And Orientation

Web resolution lives in `apps/web/src/app/share/page.tsx`. Shared wire
contracts live in `packages/types`. CollectionsService and CollectionPolicyService
own collection access; UsersService exposes the public identity lookup reused
by PeopleController. The sharing module composes these services.

## Plan Of Work

Add ShareEntry persistence, validated create/list DTOs, own-history cursor pagination, and detail retrieval. Keep the descriptor at the literal `/resolve` route before `/:id`. Resolve all targets in the backend.
Replace the web's target and token rules with one request. Load collection access
controls separately only for owners. Document the contract and update ADR-0025.

## Concrete Steps

Use Bun/Biome. Run `bun run verify` in the isolated scratch checkout and the three
sharing browser journeys. Keep builds away from the live development .next tree.

## Validation And Acceptance

HTTP tests cover all targets, immutable addresses, invalid IDs/kinds, public and
private collections, direct grants, rotated tokens, holds/inactive accounts,
no service bypass, origin spoofing, safe cache headers, create/open retry idempotence, search pagination and analytics authority.
Browser sharing and owner operations continue to work with and without JavaScript.

## Idempotence And Recovery

An additive ShareEntry/ShareOpen migration is generated/reviewed on a disposable database; no new dependency is needed. Verification uses disposable databases.
The endpoint does not create sharing grants or rotate tokens.

## Artifacts And Notes

- `bun run verify` passed in the isolated checkout, including the full API tests,
  production web build/typecheck, documentation and boundary checks.
- Focused sharing HTTP tests: 9 passed, 102 assertions. Fresh migration replay
  and Prisma schema parity passed with no difference detected.
- Final production browser journeys: 3 passed, 125 assertions, covering all four
  share targets, repeated copy/open behavior, anonymous/manual fallback and
  private-collection login attribution. Client bundles exclude server canaries.
- After the final sign-in return fix: HTTP boundary unit tests passed (8 tests,
  63 assertions), production browser build passed, and formatting, lint,
  web boundaries and diff whitespace checks passed.
- Applied additive migration `20261009065450_share_entries` to local development.
  Public contract and limits are documented in `docs/design-docs/sharing.md`;
  ADR-0025 records the revised decision.

## Interfaces And Dependencies

Clients import only shared DTOs. `returnTo`, clipboard and translated presentation
stay outside the API. Social sharing remains deferred.
