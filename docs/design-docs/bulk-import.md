# Bulk import

Status: implemented and verified (ExecPlan:
[deliver-bulk-import](../exec-plans/completed/deliver-bulk-import.md)). Settled in
[ADR-0012](../engineering-decisions/0012-bulk-import-through-reviewed-drafts.md).
Bulk import is Save a link at scale: the same rules for every link, a preview
step to fix things before they land, and destinations that can span many
collections.

## Personal-library migration follow-up

The user supplied a Markdown resource-library export for a future personal
import. It combines heading levels, explanatory prose and ordered links. Keep
the original input private and unchanged; use synthetic equivalents for tracked
parser fixtures. A personal Markdown-to-CSV preparation step is separate from
shipping a Markdown importer or the paid DOCX/AI workflow.

Before importing, review the collection/section mapping, prose treatment,
resource order, destinations and visibility. Sections are flat and their
optional descriptions are bounded, so nested headings and long prose need an
explicit mapping rather than silent truncation. Any reset/reseed or two-account
test setup needs current confirmation of the intended accounts and ownership;
old session notes are not permission to wipe development data.

### Bookmark structure

Browser wrappers are removed. Meaningful root folders and deeper folders with
children become named collections; their leaf children become flat sections.
Parent collections reference their child collections under ADR-0047, without
inheriting access. Folder names are preserved, rather than replaced with
"Imported links" or concatenated into nested section labels.

## Ownership prerequisite

Imports are owner-only management actions. The person must already own a hub;
imports never create one implicitly. The import page prompts a hubless
person to Create hub before uploading. Only collections owned by that hub may
be destinations, including an existing target shared with other people.
Contributors can edit items but cannot import, even if they own another hub.
The API enforces ownership and target existence independently of client guidance.

Draft creation resolves the caller's hub; no `hubId` input is accepted.
Creating a draft without a hub returns `hub_unavailable`. Other accounts cannot
read or mutate a draft (404); service roles confer no draft access.

## Journey

1. **Start** (Manage › Import, `/manage/import-export`, also reached from Save a
   link's "Bulk import links"): upload
   a bookmarks file (HTML, as every browser exports it), a CSV, or a plain-text (.txt) file with one URL per line. Nothing is saved to any collection yet.
2. **Preview**: a table of every row, filling in as titles resolve, with a
   summary line ("184 ready · 12 need attention · 3 duplicates") and filters
   All / Ready / Needs attention.
3. **Placement**: folder structure supplies collection and section names. Links
   outside meaningful folders need a named collection; choose another collection
   in this draft or enter a new name. There is no arrangement selector.
4. **Fix**: edit a failed row's address in place (re-checked at once), add or
   remove tags, or select rows to revalidate or remove.
5. **Import N links**: select up to 50 ready rows and import that selection to its destinations. Rows
   that still need attention stay in the draft ("12 links need attention"),
   reachable from the import page until fixed or dropped.

Plain-text files use UTF-8, one URL per line, with no header. Blank lines are
ignored. There is no inline paste entry point. Files containing NUL characters
are rejected with a validation response before draft rows are persisted.

## Rows and statuses

Each row holds a resource URL, optional tags and its prescribed or reviewed
placement. Link titles, link descriptions and site names come from the page;
bookmark link labels are ignored. CSV collection and section titles are authored structure and are preserved.

| Status | Meaning | Importable |
| --- | --- | --- |
| Processing | Waiting for its title | No (yet) |
| Ready | Valid public address; title found, or a real site without one (the address stands in) | Yes |
| Failed | Not an address, not public, domain doesn't exist, or the site couldn't be reached; the reason is shown | After a fix or revalidation |
| Duplicate | Same canonical address earlier in this draft for the same destination | No; dropped on import |
| Already saved | Already in its destination collection | No; skipped on import |
| Imported | Saved to its destination | — |
| Skipped | Dropped by the owner or inside a skipped folder | No |

Checks are the Save a link checks: canonical address, the public-address rule,
tags normalized and capped. Editing an address rechecks it against shared metadata.
A failed lookup is shown as needing attention after its first failed attempt;
the worker may still retry it in the background. Selected revalidation schedules
a fresh attempt. A reachable page without a title is Ready, including successful PDF, image and
other non-HTML responses; unsupported bodies are not downloaded for metadata.

## Folders and destinations

Bookmark folders form a tree, translated automatically:

- Strip browser-owned containers at the export boundary: the toolbar marker or
  recognized Bookmarks bar/Toolbar/Menu, Other/Mobile/Unfiled bookmarks names.
  Preserve similarly named folders nested inside user folders.
- Every meaningful root folder becomes a named collection draft, with publishing enabled by default and an explicit opt-out before import.
- A deeper folder with children becomes another named collection, referenced
  from its parent collection by immutable ID. A leaf child becomes a section,
  using its own name, inside the nearest collection. Sections never nest.
- Collapse a collection whose only source content is one child collection
  reference, promoting that child. Repeat through chains. Keep collections with
  their own links, sections, or multiple child collections. Ignore empty folders;
  failed/pending links still count as source content so lookup timing never changes
  the mapping. Already created collections and manual corrections are preserved.
- Direct links stay unsectioned in their collection. Direct links precede child
  references, which precede sections; each group's source order is preserved.
- Empty and failed-only branches create no collection or section until a ready
  descendant is committed. Ancestor collections can be created with a reference
  as their only item. Repeated commits reuse destinations and reference receipts.
- Wrapper/root links and TXT files have no supplied destination name. They remain
  Needs attention until a collection is chosen for the unfiled group or per row.
  Naming a group reuses an unambiguous collection in this draft or creates a new
  destination draft; existing library collections are never matched by title.

For example, Library → Engineering → C becomes Engineering with a C section
when Library has nothing else. If Library has other content, it remains a
collection containing a reference to Engineering.
CSV keeps its separate creation contract below.

Optional row corrections affect only that row. The legacy single/split, per-folder
mapping and publication controls are removed. Existing draft placement is migrated;
already imported resources and receipt IDs remain intact. Manual corrections remain.
New collection drafts default to published, with an independent Published choice before Import. Drafts stay private until submission; existing collection visibility is preserved.

Create section headings only alongside an accepted item. Preserve source locations
in the draft. Partial commits reuse headings and insert repaired rows within their
section. Reference receipts are not foreign keys: owner deletion/transfer cleanup
must not cause a later import batch to recreate a deliberately removed reference.

## Limits

- One file up to 10 MB and 5,000 links per draft; larger exports are imported in
  parts (one folder at a time).
- Up to 3 open drafts per account; a draft expires 30 days after its last change.
- Title lookups have a separate account budget of 15,000 lookup candidates per
  rolling day, deduplicated within each submission; retries count again. Shared metadata jobs run with
  concurrency four and one-second host spacing, outside the write lock.
- Folder names are capped at 255 characters and source paths at 2,000; up to
  1,000 source folders and 64 HTML nesting levels. Oversized structure is rejected,
  never silently truncated.
- Expiry maintenance removes up to 100 drafts per minute in the worker. Deleting
  or expiring a draft never deletes imported content.

## API contract

- `POST /api/v1/imports` (`sourceKind`: `bookmarks`, `csv` or `text`; multipart
  `file` required for every format) → draft summary and folder tree.
- `GET /api/v1/imports` → open uploads first, then recent completed uploads (up to 23 total); each includes collection drafts.
- `PATCH /api/v1/imports/:id/destination` (`collectionTitle`) places the unfiled group.
- `GET /api/v1/imports/:id` → draft summary, folder tree and destinations;
  `GET /api/v1/imports/:id/rows?status=&cursor=` → paginated rows;
  `GET /api/v1/imports/:id/rows/:rowId` → one row for correction.
- `PATCH /api/v1/imports/:id/rows/:rowId` (address, tags, collectionTitle, sectionTitle), `DELETE …/rows/:rowId`.
- `POST /api/v1/imports/:id/selection` retries, removes, or assigns a collection to selected unfiled rows;
  `POST /api/v1/imports/:id/revalidate` retries all failed rows; `POST /api/v1/imports/:id/drop-failed`.
- `GET /api/v1/imports/:id/collections/:collectionId` → collection-scoped counts.
- `PATCH …/collections/:collectionId` persists `published` before creation.
- `POST …/collections/:collectionId/commit` queues ready links with an optional `published` choice, atomically; `DELETE …/collections/:collectionId` discards only that collection draft.
- `GET …/rows?collectionId=` scopes pagination to that draft collection.
- `POST /api/v1/imports/:id/commit` → per-destination counts; idempotent per row.
- `DELETE /api/v1/imports/:id` discards a draft.

Every edit, delete and commit carries the summary's integer `version`, including
DELETE request bodies. Stale revisions return 409. A completed commit replay
returns zero new imports. Rows are paginated (maximum 100); cursors bind to the
draft. Closed receipts can be read until expiry. Destination authority, row
receipts, content and activity records commit atomically.

The former one-shot `POST /imports/csv` and `/imports/bookmarks-html` routes
and contracts are removed. Clients must stage, review and submit a commit.

## CSV: bulk creation

CSV creates new collections, published by default with a per-collection choice. It never matches, appends to or updates an
existing collection, even if its title is identical. Repeated titles in this
file group rows into one new collection; repeated section titles inside that
collection group their resources. A later upload creates another set of collections;
only retries of the same draft are idempotent.

The exact headers (in any order) are:

```csv
collection,section,url,tags
Web development,HTML,https://developer.mozilla.org/en-US/docs/Web/HTML,html;reference
Web development,CSS,https://developer.mozilla.org/en-US/docs/Web/CSS,css;reference
Reading,,https://www.gutenberg.org/,books
Reading,,https://standardebooks.org/,
```

All four headers are required; unknown and duplicate headers are rejected.
`collection` and `url` identify the required destination and resource. Empty or
invalid resource addresses stay visible as failed rows for repair. `section` and
`tags` may be empty. Blank sections create a flat collection with no headings.
Collection and section descriptions are edited after import. Resource notes
are deferred; description and notes columns are not accepted. A collection or
section occupies one consecutive block; returning to an earlier block is an
error. Unsectioned resources precede sections. These rules preserve file order
without inferred grouping or a second placement decision.

Collection and section titles are at most 255 characters. Separate tags with
semicolons (at most 30, each at most 80 characters); normal tag normalization
applies. File-wide limits remain
10 MB and 5,000 resources. UTF-8 BOMs, quoted commas, escaped quotes, CRLF and
embedded newlines are supported. Blank records are ignored. Malformed quotes,
column mismatches, conflicting definitions and invalid sizes fail validation
before persistence. Link titles are fetched; there is no link-title column.

The web start page offers a downloadable template. CSV preview displays its
prescribed collections, optional sections and row validation results. It has
no destination or arrangement controls, and the backend rejects these mutations
for CSV drafts. Import confirmation still stages and commits ready rows in
bounded batches. Sections are created only with a ready resource; their
nonempty invariant is rechecked atomically on commit.

## Web

`/manage/import-export` (a section of [Manage](manage-workspace.md)) lists open
drafts and starts a new one. `/manage/import-export/:id?collection=:collectionId` is the preview:
links first in a bounded management table with counted status filters and 25-row
Load more. Imported history appears once there are saved rows; it is never imported
again. Columns are Select (checkbox), Link (title and address), Tags, Section,
Collection, Status and Edit.
Folder structure supplies placement; CSV retains its prescribed placement.
Edit opens inputs in that row for collection, optional section, address and tags.
Save and Cancel stay in the review table. Changing placement reuses an unambiguous planned group or creates a
private draft destination. CSV collection/section fields are read-only. Imported
rows display their actual saved collection and section. Flat rows insert before
references and section headings.

Review lists collection drafts rather than file contents. Each opens a scoped table
with its own counts and Published preference (default enabled). Import queues all
currently ready links in that collection, independently of selection/pagination.
The existing worker processes durable jobs in 100-link authority transactions;
ready row IDs are snapshotted at submission. Failed/processing links wait for a
later job and receipts reuse the same destination. Concurrent workers serialize
through the authority lock; failures roll back one batch and record a retryable
failed job. Queued/running collection rows cannot be edited, moved, removed or
submitted through the legacy synchronous commit endpoint. The worker rechecks
account status, hub ownership, destination policy and expiry each batch.

Row actions appear after selection: Revalidate N links, confirmed Remove N links,
or placement for unfiled links. Refresh is always first; Import is last before
Clear selection. There is no separate selected count. Selection is limited to 50
pending rows; imported/skipped rows cannot be selected. Publishing belongs to the
whole collection draft. The Import submission includes an unsaved publishing
choice atomically. Once a destination exists, its normal collection controls own
publishing; subsequent jobs preserve that setting. View collection opens the saved
result; completion reports remaining failed/processing links. Related child drafts
remain separately reviewable; ancestor references retain the bookmark mapping.
Discard on the review list removes only that draft and preserves saved content.
Discarding unfiled links retains the synthetic export root as a structural anchor
for other collection drafts. Discarding a real collection promotes its pending
child collections to its parent, without recreating the discarded collection.
Native forms and account-bound interrupted actions preserve collection scope.
The legacy bounded draft-wide API commands remain available to API clients.
The Manage tab is Import. Planned web export controls belong to individual
collections and the Manage Collections selection, not this import workflow.
Mutations preserve the selected status, including after sign-in.
Account-bound pending actions preserve submitted edits through sign-in.
Native forms work without JavaScript; Load more follows cursor pages in that case.
With JavaScript it appends rows and announces completion or a retryable error;
inline saves and selected actions preserve loaded rows. Without JavaScript, Edit
uses the same review URL with an `edit` row ID; native forms keep all operations
available. Old standalone editor URLs redirect to this inline review.
The page polls every five seconds while lookups or import jobs remain. Polling pauses while a
form or disclosure is being edited, rows are selected, during submission, in hidden tabs, or after
loading additional pages; explicit Refresh updates the view. Native
forms use the shared HTTP adapter and the signed visitor budget boundary.

## Paid or free

Bookmarks and CSV import are free (ADR-0028). File/job and abuse budgets remain
operational limits, not a payment requirement for ordinary imports. AI curation
and DOCX import are paid convenience features with separately enforced entitlements.

## Document and AI follow-up

[Document imports and assisted curation](ai-curation.md) extend this draft model
with paid DOCX extraction, including exported Google Docs, and paid AI organization.
They reuse ownership, validation and reviewed commit; they cannot commit publication
without the owner's submission. Direct Google access and other document formats
remain separate scope choices.


### Import workspace views

Import has two permanent subsections: **New import** for uploading a file and **Review**
for collection drafts and recent results, including those still processing. Opening a draft keeps
Review active; selecting Review returns to the list without discarding work.
The former `?tab=drafts` address redirects to `?tab=review`.
The review list owns collection-draft discard; New import links there when all three
slots are occupied. Upload file opens the file picker and displays the selected
filename; native file input remains available without JavaScript. File-preparation
instructions live at `/support/imports`, linked from New import and Support.
There is no completed-history tab while drafts remain temporary working state.

Collection-job completion finalizes duplicate and already-saved rows only in the
submitted collection. Failed and processing rows remain reviewable; other collection
drafts are untouched. An upload closes once no pending rows remain, freeing its
open-draft allowance. Destination-name matching excludes discarded collection drafts;
reusing a discarded title creates or selects a live destination.

## Editing tag lists

The inline row editor uses one tag per line. Persisted tags normalize whitespace
to spaces, making line breaks an unambiguous editing separator. Commas, semicolons,
quotes and Unicode remain literal characters within a tag. Saving an address or
placement change preserves untouched tags; native and enhanced forms use the same
parser without client-side truncation. The API owns tag validation/normalization.
The CSV file format remains unchanged (semicolon-separated tags within its cell).

Import-row forms accept up to 64 KiB of URL-encoded data, covering maximum-length
Unicode tags and placement after percent-encoding; other native forms keep their
16 KiB limit. Streamed byte counts enforce the bound without trusting Content-Length.
Origin, encoding and backend field validation still apply. Interrupted valid edits
use the same lossless pending-action recovery as smaller edits.
