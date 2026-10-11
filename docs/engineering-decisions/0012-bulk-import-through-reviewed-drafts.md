# ADR-0012: Bulk import through reviewed drafts

**Status:** accepted  
**Date:** 2026-10-08

New destination visibility is amended by [ADR-0028](0028-free-public-curation-paid-private-sharing.md):
public by default with a private choice before commit. Drafts remain private;
bookmarks/CSV import remains free. This default is implemented by the collection-draft milestone below.

## Context

Imports wrote every parsed row straight into one collection and reported
failures afterwards, keeping whatever title the file carried. That contradicted
resolved titles (ADR-0007), gave people no chance to fix or drop bad rows before
they landed, and forced a whole bookmarks tree into a single collection.

## Options considered

- One-shot import with a per-row report (the previous behaviour).
- Client-side preview that submits only the rows that pass.
- A server-side import draft, reviewed and then committed in steps.

## Decision

Bulk import is Save a link at scale. Imported links are staged in a
server-side draft owned by the account, checked by the same rules as any save,
with titles resolved in the background; the person reviews and fixes the draft,
chooses destinations, and commits ready rows while the rest wait. Nothing is
written straight into a collection from a file. Journey, statuses, folder
mapping and limits: [bulk-import.md](../design-docs/bulk-import.md).

## Rationale

- One rule for every link that enters the product, whether one or a thousand.
- Mistakes are fixed before they reach a collection, not cleaned up after.
- Folder structure carries over as guides (sections) or splits into
  collections, so one browser export serves any arrangement.
- Network-bound title lookups never run inside the write lock or a request.

## Constraints to preserve

- No import path accepts a title; titles always come from the page.
- Nothing reaches a collection before the person chooses to import.
- Drafts are private to their account and expire; they hold only what the rows
  need (addresses, tags, folder paths, statuses), never page content.
- Destination writes go through the normal collection policy and write lock;
  importing is idempotent per row.

## Links

- [bulk-import.md](../design-docs/bulk-import.md)
- [ADR-0007](0007-resolved-titles-read-only-items.md)


## Owner-only import amendment — 2026-10-09

Imports are owner management under the clarified
[optional-hub boundary](0018-people-and-hubs-are-separate.md#import-and-bookmark-boundary-amendment--2026-10-09).
This replaces contributor import access: the destination policy must require
management authority, including when committing reviewed drafts. Imports require
an existing personal hub and never create one implicitly; the future import
page guides explicit creation. Ordinary contributions and account-owned
collection bookmarks remain available without a hub.

## CSV creation contract amendment — 2026-10-10

The product owner clarified CSV as bulk creation in the application's structure,
not a user-export format requiring folder interpretation. CSV has the exact
`collection,section,section_description,url,tags` layout. Each named collection
is new; existing content is never matched, appended to or updated. Repeated
collection/section definitions group consecutive rows, with consistent section
descriptions and deterministic file order. Preview validates and confirms the
prescribed placement; there are no destination-mapping controls for CSV.

This supersedes the earlier generic CSV `url,tags,folder` mapping. Bookmark
HTML retains its translation/review workflow. Plain-text uploads contain one URL
per line; there is no inline paste. Reviewed drafts, server-owned authorization,
metadata resolution, partial commits and per-draft idempotence remain intact.

## Lean CSV columns amendment — 2026-10-10

The product owner narrowed the creation contract to exactly
`collection,section,url,tags`, superseding the `section_description` column in
the preceding amendment. All four headers remain required; `section` and `tags`
values may be empty. Blank sections create a flat collection without headings.

Collection and section descriptions can be edited after import: their small
number does not justify repeating prose in every resource row. Resource notes
would benefit from bulk entry, but their column is deferred until the resource
notes feature exists. Unsupported columns fail validation rather than being
ignored. Remove import-only description fields, rendering and storage with a follow-up
migration; keep applied migration history intact. Normal resource and collection
descriptions remain supported after import. Creation-only placement and ordering
guarantees are unchanged.

## Import capacity amendment — 2026-10-10

The product owner's real Chrome export contains 1,115 bookmarks, exceeding the
initial 1,000-link cap despite being below 1 MB. Raise the per-draft cap to 5,000
links for every source format and the daily per-account lookup budget to 15,000
candidate URLs (three full drafts). This replaces the initial 1,000/3,000 limits
while retaining 10 MB uploads, three open drafts, 100-link commit batches,
background lookup processing and the existing structure limits.

## Bookmark review amendment — 2026-10-10

The product owner chose two automatic arrangements: one collection with sections,
or top-level bookmark folders as collections and deeper folders as sections.
This supersedes the proposed recursive bookmark-to-collection reference mapping:
users can organize their source bookmarks before importing; import need not model
an arbitrary nested collection graph. The collection-reference capability in
ADR-0047 remains independent.

Review is one bounded table with Link, Section, Collection, Status, Edit and Revalidate.
File headings and mode decide placement. Optional row corrections move only that
row to an unambiguous planned group or new private collection/section; they never
rename siblings or mutate imported resources. Applying a mode restores source
placement for remaining rows. CSV keeps its creation-only prescribed structure.
Imported history reflects saved placement and never re-imports receipt rows.

## Folder-derived collections amendment — 2026-10-11

Inspection of the owner's Chrome export exposed the shortcomings of depth-only
mapping: Bookmarks bar is a browser wrapper, broad branches contain hundreds of
links, and leaf folders represent narrower sections. The owner accepted automatic
branch/leaf mapping. This supersedes the two-mode bookmark review amendment above.

Ignore recognized browser wrappers at the export boundary. Meaningful roots and
branching folders become private collections with their own names. Leaf children
become flat sections using their own names. Parent collections reference child
collections under ADR-0047; there is no nested section or inherited permission.
Loose links require an explicit collection name rather than an invented default.
Direct links precede child references, then sections, preserving source order
within each group. Create ancestors only when ready descendants are committed.

Remove single/split, per-folder destination/publication APIs, and mode-reset
provenance. Migrate pending draft structure without moving saved resources or
losing receipts/manual row corrections. Tradeoff: structural branching is a
predictable default, not an inference about subject importance; row corrections
remain available. CSV remains creation-only and prescribed.

Draft actions follow the active status tab. All exposes applicable operations;
Ready exposes import; Needs attention exposes retry/drop failed. Discard is
explicitly draft-wide and appears only on All. Preserve the tab after submission.

Single-reference refinement: omit an intermediate collection whose only source
content would be one child collection reference, repeating through chains. Own
links (including failed/pending ones), sections or multiple child collections
justify retaining it. Ignore empty source folders before making this decision.
This is determined from the source, never from which metadata finishes first;
existing saved collections and manual placements are not automatically removed.

### 2026-10-11 refinement: inline correction and selected actions

The product owner replaced standalone editing and per-row retry with a first-column
checkbox, Link, Tags, Section, Collection, Status, Edit table. Edit changes the row
in place. Selection exposes confirmed removal and retry for unreachable links,
plus Clear selection. Native form fallbacks stay on the review screen. Selected
commands are atomic and limited to 50 rows, keeping interrupted commands within
the account-bound pending-action cookie budget. This supersedes the earlier
separate row editor and Revalidate column; draft-wide tab-aware actions remain.


## 2026-10-11: Selection-scoped review actions

Supersedes the tab-wide action controls above. Bulk actions appear after selecting
rows and target only those rows: import ready links, retry unreachable links,
remove links, or assign a collection to selected unfiled links. Action labels show
the affected count. Refresh remains a button in the same row even without a
selection. This makes scope explicit and avoids accidentally changing unselected
rows. Whole-draft discard moves to the imports list, with confirmation. The Manage
navigation label is Import; planned web exports belong to collection surfaces.
The existing API-wide batch contracts remain available to API clients.

## 2026-10-11: Collection drafts and background imports

Supersedes file-level review and selected-row import above. Uploads produce
collection drafts. Review lists those collections, and each review page scopes
rows/counts to one immutable draft collection ID. Row selection repairs or removes
links; Import queues all currently ready links in that collection, across pages.
The worker saves batches automatically. Failed/processing rows stay for later
repair; persisted receipts reuse the same saved collection. Queued/running drafts
cannot be edited. Completion links to the saved collection.

Each new collection draft has a Published choice, enabled by default, implementing
the creation-default portion of ADR-0028. Drafts remain private before submission.
Existing collections keep their publishing state; later jobs never overwrite it.
Existing owner/viewer/contributor roles, direct shares and link grants remain
unchanged. No public/private/subscribers access enum is introduced. Billing and
private-sharing entitlements remain outside this milestone.
