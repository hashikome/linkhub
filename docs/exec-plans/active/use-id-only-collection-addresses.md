# Use immutable collection IDs for every collection address

This ExecPlan is governed by `PLANS.md`. Implementation is selected for the next
session; this session records the decision and handoff only.

## Purpose / Big Picture

Every collection opens at `/c/<collectionId>`, including after title/handle changes
or ownership transfer. Handles identify hub pages only. Collection slugs and their
transfer conflicts disappear. See [ADR-0053](../../engineering-decisions/0053-id-only-collection-addresses.md).

## Progress

- [x] (2026-10-11) Record the accepted URL direction and current implementation gap.
- [ ] Inventory slug dependencies and remove schema/API/client slug contracts.
- [ ] Generate and review a migration; preserve data and immutable IDs.
- [ ] Replace pretty collection navigation and detection with ID-only paths.
- [ ] Update regression coverage and current docs; run isolated verification and browser journeys.

## Surprises & Discoveries

Imports currently generate random `import-<uuid>` slugs. The web editor has no
slug field. Hub collection cards nevertheless use handle/slug paths when given a
handle. Existing share links and references already use `/c/<id>`.

## Decision Log

- Decision: Remove slugs rather than move collection IDs underneath hub URLs.
  Reason: collection identity is independent of the current owner and hub.
  Date: 2026-10-11, user confirmation; ADR-0053.
- Decision: Follow ADR-0006 and remove legacy routes without compatibility aliases.
  Preserve development data; a schema migration does not authorize a reset.

## Outcomes & Retrospective

Decision and implementation scope documented. Runtime removal has not started.

## Context And Orientation

`apps/api/prisma/schema.prisma` defines Collection.slug and per-hub uniqueness.
Collection services/controllers and DTOs expose creation, updates, slug lookup
and transfer conflicts. Import and capture creation generate slugs.
`apps/web/src/components/primitives.tsx` uses `prettyPath` from `lib/http.ts`;
`apps/web/src/app/[handle]/[slug]/page.tsx` resolves a handle then a slug.
`packages/types/src/links.ts` recognizes both URL shapes for reference capture.
`/c/[id]` and `GET /api/v1/collections/:id` are already the durable reader paths.

## Plan Of Work

Search all tracked source, fixtures, types, docs and tooling for collection slug
usage (unrelated human labels/document filename slugs are not in scope). Remove
slug creation/update/lookup fields and uniqueness checks end to end. Generate a
reviewable Prisma migration using the repository runbook; ensure its only intended
schema changes concern collection slugs and preserve custom SQL constraints.

Switch all collection cards, previews and captured collection-address detection
to ID paths, and remove the obsolete pretty route/helper. Keep hub handle routes.
Update tests to prove title duplication and cross-hub transfer work without slug
conflicts, and that immutable capture receipts still replay. Replace the recent
transfer-slug-conflict regression with coverage appropriate to remaining conflicts;
retain the distinction between version conflicts and other errors in recovery.
Update current documentation on completion; historical completed plans remain evidence.

## Concrete Steps

From the repository root, inspect `rg -n 'slug|prettyPath' apps packages tooling`.
Read `docs/runbooks/migrations.md` before running `bunx prisma migrate dev --create-only`
from `apps/api` against an owned disposable migration database. Review SQL before
applying; use Bun for generation and checks. Run `bun run verify:isolated` and
`bun run verify:isolated test:browser` sequentially to avoid shared `.next` output
or temporary disk exhaustion. Inspect every failure; do not reset the development DB.

## Validation And Acceptance

- Hub cards, discovery, copied links, references and exports emit `/c/<id>`.
- `/@handle` still opens a hub; collection routes contain no owner/hub identity.
- Existing collection and item links survive title/handle changes and transfer;
  unauthorized readers remain denied under current policy.
- Same-title collections do not conflict on creation or transfer.
- Same-owner capture reference conversion and idempotent replay still work;
  foreign/unreadable targets retain the existing ordinary-link behavior.
- Slug storage, DTOs, lookup routes and obsolete helpers are removed; no aliases.
- Full verification and relevant production browser journeys pass.

## Idempotence And Recovery

Documentation/search are repeatable. Migration changes are reviewed and applied
once per database. Never reset user data or delete unrelated untracked files.
Preserve resource identities, saved receipts, sharing policy and ownership records.

## Artifacts And Notes

The disposable session starter is `ref/next-session.md`. All required decisions
and acceptance criteria are retained here and in ADR-0053 if that file is deleted.

## Interfaces And Dependencies

Prisma remains API-only. Shared types describe ID routes; the backend resolves
ownership and enforces policy. Hub handle reservation and rename cadence remain
unchanged. No dependency or new URL-resolution service is required.
