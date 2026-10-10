# Collection contributors, resource tags and discussion

## Purpose / Big Picture

Replace provisional sharing widgets with a useful collection sidebar. Contributors
appear above Discussion. The collection header shows +N tags beside its tag
chips, counting distinct tags across every resource. Discussion follows Contributors
independently of the collection header and starts at
half the rendered collection height. It grows with comments to the collection
bottom, then scrolls internally. On narrow screens the sidebar follows the
resources. Sharing and hub engagement remain separately recorded backlog work.

## Progress

- [x] (2026-10-08) Remove hub/collection/footer share widgets and record their redesign backlog.
- [x] (2026-10-08) Add linked contributor avatars and place Discussion below the summary.
- [x] (2026-10-08) Aggregate tags across all collection resources in authorized API reads.
- [x] (2026-10-08) Render +N tags beside collection-tag chips in the header.
- [x] (2026-10-08) Verify pagination-independent counts and access boundaries.
- [x] (2026-10-08) Finish verification, browser acceptance, visual inspection and documentation.

## Surprises & Discoveries

The contributor API already supplies five recent people plus the total. Resource
reads are paginated, so the client cannot derive a complete tag summary from the
first page. Tying the discussion position to the folding header moved it during scrolling;
the user directed a stable position immediately below the summary instead.
Short collections require the sidebar height to use the rendered sheet height,
not the viewport-sized grid row, so growing discussions stop at the correct edge.

## Decision Log

- 2026-10-08 / User: defer sharing UI; record it alongside subscriptions and hub engagement.
- 2026-10-08 / User (final layout): Contributors sit at the top; Discussion follows
  Contributors, starting at half the collection height and growing with comments
  up to the collection bottom before scrolling internally. Header alignment was rejected
  because it moved Discussion while scrolling.
- 2026-10-08 / User (final tag placement): move the resource-tag count from the
  sidebar into the collection header as +N tags alongside collection-tag chips.
  Keep the count only, with no resource-tag list. Omit a zero suffix.
- 2026-10-08 / User: contributor rows show only usernames beside avatars, never
  display names; larger groups show avatars with usernames on hover. Use rows
  for totals up to three and compact avatars above that.
- 2026-10-08 / Implementation: derive counts in the backend after collection access
  checks. Count distinct tags; do not traverse referenced collections. Keep existing
  contributor ordering and cap. A ResizeObserver tracks collection height only.

## Outcomes & Retrospective

Delivered username-only contributor rows (compact avatars above three people),
header resource-tag counts and a stable discussion panel that grows from half
the collection height to its bottom edge. Support matches the header navigation
font size and is vertically centered. Sharing remains deferred.

`bun run verify` passed, followed by all 45 browser journeys (542 assertions).
After the final discussion-growth change, the production build and five focused
collection browser journeys passed (73 assertions), including short collections,
header folding, comments with/without JavaScript and attribution. Local Chrome
checks at 1280, 390 and 320px confirmed header tag placement, footer alignment,
no overflow and growth followed by internal scrolling. Biome, docs and diff
checks passed. Earlier people/identity and first-link changes remain preserved
and uncommitted. No commit or push was performed.

## Context And Orientation

`CollectionsService.readCollectionView` is the authorized single-collection read.
`CollectionReader` combines the main sheet and sidebar. `CollectionSidebar`
tracks sheet height without binding position to its header. `CollectionContributors` uses the existing
person/avatar contract. Shared contracts live in `packages/types`.

## Plan Of Work

Add a resource-tag aggregate to single-collection reads, scoped by immutable
collection and hub IDs. Render +N tags beside the collection-tag chips. Keep
Discussion usable when either section grows and preserve native mobile flow.
Update focused design docs and CHANGELOG, then verify API and browser behavior.

## Concrete Steps

Use Bun/Biome. Run `bun run verify` and `bun run test:browser` sequentially in the
isolated `/tmp/nslinkhub-docs-verify-oJR5L3` checkout to preserve the live dev build.
Inspect local Chrome at 1280, 390 and 320px, including folded descriptions.

## Validation And Acceptance

- Contributors link to person profiles without granting additional access.
- Tag counts include resources after the first page, exclude other collections
  and private referenced contents, and reflect resource edits/removal.
- Unreadable collections expose no tag summaries; no schema migration is needed.
- Discussion stays below the summary without moving during header folding, and
  starts at half the collection height and grows with content to the collection
  bottom, bounded by remaining sidebar space.
- Native forms and no-JavaScript reading work; mobile does not overflow.
- Full verification and browser suites pass. Sharing controls remain absent.

## Idempotence And Recovery

No migrations, new dependencies or destructive operations. Tests own disposable
DBs. Keep development records intact. Preserve all prior uncommitted work.

## Artifacts And Notes

Temporary browser scripts/screenshots live under `/tmp`; this document and
focused designs retain all durable decisions.

## Interfaces And Dependencies

Add optional `resourceTagCount: number` to the Collection
wire type for single reads. Existing collections-list responses stay unchanged.
Reuse the API avatar endpoint and person profile links. The tag count is
informational; filtering is separate planned work.
