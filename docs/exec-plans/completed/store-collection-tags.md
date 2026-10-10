# Store collection tags from items

## Purpose / Big Picture

Collections expose one deduplicated tag set from their own items, across all
pages. Owners no longer maintain a second set in collection settings.

## Progress

- [x] (2026-10-10) Traced collection serialization, resource aggregation and web editing.
- [x] (2026-10-10) Store normalized tag identities and item/collection relations.
- [x] (2026-10-10) Remove collection tag inputs/contracts and retain compact chips.
- [x] (2026-10-10) Verify backfill, schema parity, API regressions and full gate; seven browser tests pass.
- [x] (2026-10-10) Inspect reader and editor screenshots at 390/768/1280/1440.

## Surprises & Discoveries

Before this change single reads returned authored tags plus resourceTagCount.
Exports do not render collection tags; discovery has no tag filtering today.

## Decision Log

- 2026-10-10: Store a collection_tags relation maintained by database triggers. Only tags on
  the collection's own items count; reference destination contents
  are never traversed. A shared unique-name Tag catalogue and ItemTag assignments are the source.
  CollectionTag is a stored union, not a read-time calculation.
- Remove obsolete collection storage rather than retain a compatibility path.
  Existing item tags are preserved; authored collection-only labels are retired.

## Outcomes & Retrospective

Implemented the three-table tag model and migrated local item tags. Collection
reads use stored relationships; item editing is the single source of assignments.
No tag editor remains on collection settings. Review rounds and committing remain
the first task for the next session; this change belongs in that review scope.

## Context And Orientation

CollectionsService owns wire serialization and list access. ResourcesService
owns normalized item tag writes. The reader uses Tags; CollectionEditForm and
collection-actions no longer submit collection tags. Prisma migrations preserve
SQL-only constraints and triggers.

## Plan Of Work

Remove collection tag writes and storage. Maintain per-tag item reference counts
transactionally and include the stored
relation in collection reads and lists. Remove resourceTagCount in favor of
Collection.tags. Remove the edit control and render a bounded chip preview with
a remaining-tag count. Update fixtures, contracts, product/design docs and ADR.

## Concrete Steps

Use Bun for Prisma generation, focused API/browser checks and `bun run verify`.
Generate the migration with `migrate dev --create-only` on a disposable database,
review SQL, and verify schema parity. Use an isolated source mirror for Next
production verification so the active development server is undisturbed.

## Validation And Acceptance

API tests cover deduplication, later pages, item edits/deletes, empty collections,
list consistency, private access and non-recursive references. Collection create
and update reject tags as unsupported input. Browser tests cover compact header
and removal of the owner tag input, including native forms. Full verification
must pass; blocked checks must be identified explicitly.

## Idempotence And Recovery

Do not reset databases or existing work. Migration backfills the relation from
resource tags and drops the obsolete collections.tags array. Resource tag arrays
become item_tags assignments, preserving their normalized names/order; resource
records remain intact. Do not seed
or import user data. Apply reviewed migration before new API code serves traffic.

## Artifacts And Notes

- Follow-up (2026-10-10): collection reads rank stored tags by item count
  descending, then name ascending for ties. Item tag order is unchanged. Updated
  API regressions cover four tags, repeated usage, ties, later pages, collection
  lists and mutations. `bun run verify` passed in the isolated copy; evidence:
  `/tmp/collection-tag-ranking-verify.log`.

- `bun run verify`: passed in an isolated source copy (including migration backfill
  and all API tests). Fresh-schema parity: no difference detected.
- Focused tag tests: 3 passed, covering API rejection of authored collection tags,
  later pages, private/reference isolation, stored counts, concurrent assignments,
  rollback and deletion cascades.
- Production browser selection: 7 passed, 105 assertions; includes capture,
  native/JS editing, references, deep links and section authoring.
- Reader and editor screenshots inspected at 390/768/1280/1440: three quiet chips and a
  remaining count, no horizontal overflow with the long-title fixture; owner form
  retains name, description and comment settings without the redundant tag input.
  Editor journey rerun after adding the two extra widths: 1 passed, 42 assertions.
- Local migration applied successfully. Local parity reveals unrelated existing
  `users.username` width drift (requires VARCHAR(20)); left for the review rounds.
- Local dev web still serves stale compiled components; production build verified
  the current source. A dev-stack restart is needed to refresh that process.

## Interfaces And Dependencies

Collection.tags remains string[] but becomes read-only and backed by CollectionTag rows.
Resource.tags remains string[] over ItemTag relations.
CreateCollectionRequest/UpdateCollectionRequest lose tags; resource requests
retain them. No new dependencies. Authorization remains backend-owned.
