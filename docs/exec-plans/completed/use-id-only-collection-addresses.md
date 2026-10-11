# Use immutable collection IDs for every collection address

This ExecPlan is governed by `PLANS.md`. Implementation and local migration are complete; both required gates pass.

## Purpose / Big Picture

Every collection opens at `/c/<collectionId>`, including after title/handle changes
or ownership transfer. Handles identify hub pages only. Collection slugs and their
transfer conflicts disappear. See [ADR-0053](../../engineering-decisions/0053-id-only-collection-addresses.md).

## Progress

- [x] (2026-10-11) Record the accepted URL direction and current implementation gap.
- [x] (2026-10-11) Inventoried schema, service, DTO, capture, export, moderation-search, seed and web dependencies.
- [x] (2026-10-11) Removed schema/API/client slug contracts, pretty routes and slug-based lookup/conflicts.
- [x] (2026-10-11) Generated and reviewed migration; data/SQL-invariant regression and fresh schema parity pass.
- [x] (2026-10-11) Switched navigation, capture recognition, moderation search and export filenames to IDs.
- [x] (2026-10-11) Updated contracts, current docs and regression coverage; 41 web tests and six focused API suites pass.
- [x] (2026-10-11) Full production browser acceptance: 98 pass, 0 fail, 1 optional benchmark skip; 1,934 assertions.
- [x] (2026-10-11) Final standard gate passed, local database backed up and migrated, live acceptance passed; prepared milestone and guide refresh for delivery.

## Surprises & Discoveries

At the start, imports generated random `import-<uuid>` slugs. The web editor had no
slug field. Hub cards nevertheless used handle/slug paths when given a handle. Existing share links and references already use `/c/<id>`.

## Decision Log

- Decision: Remove slugs rather than move collection IDs underneath hub URLs.
  Reason: collection identity is independent of the current owner and hub.
  Date: 2026-10-11, user confirmation; ADR-0053.
- Decision: Follow ADR-0006 and remove legacy routes without compatibility aliases.
  Preserve development data; a schema migration does not authorize a reset.

## Outcomes & Retrospective

ID-only collection addresses are implemented and active locally on 3004/4004.
Both standard and full browser gates pass. Existing collection/resource/hub/receipt
data is unchanged apart from removal of the retired slug column. Old pretty
routes return 404. The change is ready for commit and delivery.

## Context And Orientation

Before this milestone, `apps/api/prisma/schema.prisma` defined Collection.slug and per-hub uniqueness.
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

### Implementation findings and verification

Prisma generated `DROP INDEX collections_hub_slug_unique`, but the initial SQL
created a constraint-backed index. The reviewed migration drops the constraint
and column in one transaction. The populated migration regression preserves IDs,
references, all unrelated constraints and triggers, then creates duplicate-title
collections with UUIDv7 defaults. A fresh chain reports no schema difference.

Export filenames now use `<collectionId>.<extension>`, removing slug dependence
and avoiding duplicate-title collisions without adding another naming contract.
Seed source keys remain private fixture references, not stored fields or routes.

Completed capture receipts replay their saved IDs before current public-host
validation, so a previously saved local pretty address cannot break a retry.
New operations still validate the current ID-only address contract; no retired
route lookup/alias is restored. Receipt access, fingerprint and existence checks
remain mandatory. Version-conflict-specific lifecycle recovery is unchanged.

Earlier milestone pushed as 0421872 plus guide refresh b0b6dc1. ID-only logs live
outside the worktree under `test-results/id-*.log`. The development data has not
yet been migrated. Full browser acceptance follows the standard gate sequentially.

### Acceptance progress

Full browser gate: 98 passed, zero failed, one optional performance benchmark
skipped; 1,934 assertions in 568s (`test-results/id-browser.log`). Coverage includes
canonical hub links, old pretty-route 404s, title/handle renames, item links beyond
page one with/without JavaScript, duplicate-title transfers directly and after
sign-in, interrupted imports, early-input adoption and runner-timeout evidence.

Six focused API suites pass, including old-receipt replay, slug input rejection,
same-title creation/transfer and ID-named export archives. The first standard run
passed all backend tests but found a missing display-only hub handle in the web
row; restored that attribution prop while keeping canonical links. Browser build
and acceptance passed afterward. Final standard verification is running against
the finished source (`test-results/id-verify-final.log`). The earlier performance
and port milestone also passed hosted CI run 38135810090.

### Final verification and local cutover

`TMPDIR=$PWD/test-results/t bun run verify` passed in the isolated worktree,
including source checks, tooling/email/API/web suites, production builds and type
checks (`test-results/id-verify-final.log`). Full browser gate passed separately
as recorded above. No assertion deadlines were relaxed.

Stopped only the verified main-checkout dev orchestrator. Created a readable
custom-format backup at ignored `test-results/id-before.dump` with restrictive
permissions before applying migration `20261011113038_remove_collection_slugs`.
Compared ordered data fingerprints before and after: all 11 collections (excluding
only slug), 199 resources, 2 hubs and 5 capture receipts matched exactly. Regenerated
the local Prisma client; migration/schema parity reports no difference. No reset,
volume replacement or unrelated process termination occurred.

Restarted the ordinary dev stack on 3004/4004. Live read-only acceptance passed:
API health, native sign-in page, an existing public collection ID reader, its hub's
canonical collection link, slug-free response and old pretty-route 404. The
pre-existing `apps/web/next-env.d.ts` development change remains excluded from commits.
