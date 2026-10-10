# Extend sharing intent and opening evidence

## Purpose / Big Picture

Share creators can supply structured context. Each independently recorded open can
supply recognized attribution, arbitrary bounded context and a client occurrence
time without losing the event to optional metadata validation. Links use `via`.

Also incorporates the user’s subsequent Audit Log filter layout request: move
Apply filters and conditional Clear filters below Include read events and the main fields.

## Progress

- [x] (2026-10-09) Reviewed sharing implementation and agreed contract.
- [x] (2026-10-09) Implemented schema, migration, API, shared helper and web flow.
- [x] (2026-10-09) Updated design, ADR, changelog and regression coverage.
- [x] (2026-10-09) Updated Audit Log filter footer and existing browser selectors.
- [x] (2026-10-09) Passed full verification, sharing/analytics browser journeys
  and the final Audit Log browser check; applied the local migration and archived plan.

## Surprises & Discoveries

The current destination column drives search and aggregate analytics. Preserve
these capabilities using context.destination without grouping entire contexts.

## Decision Log

- User decision (2026-10-09): optional opening metadata is forgiving; warnings
  accompany successful writes. Required identity and resource access remain strict.
- User decision: UUID event IDs alone deduplicate retries; payload hashes are
  analytical evidence only. Server received time and optional client occurredAt
  are separate. Preserve maintained counters.
- Implementation: keep old share_id URLs readable, emit via on new links. Move
  stored destinations into context before removing their column. Service metadata
  does not expose arbitrary private creator context.

## Outcomes & Retrospective

Completed sharing context and per-open evidence across persistence, API, helpers,
web reporting and documentation. Counters remain transactional and retries do not
overwrite original events. The Audit Log uses a secondary Apply filters button
below Include read events, with Clear filters visible only for applied filters.

## Context And Orientation

API code is apps/api/src/modules/sharing, models ShareEntry and ShareOpen in
apps/api/prisma/schema.prisma, contracts in packages/types/src/sharing.ts. The
web ShareOpen reports successfully visible resource reads through its form proxy.
Analytics groups creation intent and sums stored counters, never event recounts.

## Plan Of Work

Add JSON context to entries and JSON attribution/context, occurredAt and payloadHash
to opens. Generate and review a migration, backfill destinations, use normalized context in creation retry hashes. Normalize optional metadata before inserting. Return 201
for inserted events and 200 for retries with structured warnings. Add a portable
UUID/time event factory and allowlisted URL attribution helper. Connect the web,
including sign-in return preservation. Update docs and test API and browser flows.

## Concrete Steps

Use Bun and Prisma migrate dev --create-only against an owned disposable database.
Review SQL and check migrate diff parity. Run focused sharing HTTP coverage then
bun run verify in the existing scratch checkout (avoids the live .next directory).
Run sharing and analytics browser journeys against the verified production build.

## Validation And Acceptance

New and repeated identical payloads with different event IDs count separately;
concurrent retries with one event ID count once. Malformed optional metadata writes
with warnings, required invalid UUID/access failures do not write. Valid received
and occurred times differ; hashes do not gate writes. Context destination analytics
and ownership isolation remain intact. Web links use via, preserve UTM through
private sign-in, and report allowlisted values without URL tokens or IP/user agents.

## Idempotence And Recovery

Migration backfills old destination values before dropping the old column. New
columns are nullable so historical opens retain unknown data rather than fabricated
values. Retry keys and counters are unchanged. The user confirmed this is
preproduction; experimental creation digests need no compatibility layer. Tests own isolated DBs.

## Artifacts And Notes

Full `bun run verify` passed in the isolated checkout. Sharing, analytics, Manage
and Audit Log production browser journeys passed (4 tests, 122 assertions).
After the final filter adjustment, production web build/typecheck, formatting,
lint and doc checks passed; the Audit Log browser journey passed again with
JavaScript enabled/disabled and overflow checks at 320, 390, 768 and 1280 pixels.
The latest journey also checks Clear filters is absent before filtering and after
clearing. The desktop layout was visually inspected.

The reviewed migration was applied to the local development database without a
reset; schema parity reports no difference. Logs: /tmp/share-context-verify.log,
/tmp/share-context-browser.log and /tmp/audit-filter-browser.log. No commits or
pushes requested.

## Interfaces And Dependencies

API JSON remains camelCase; standard utm_* attribution keys are an explicit
interoperability exception. No referral rewards, social integrations, SDK package,
new analytics dashboard, IP/user-agent collection or authorization bypass.
