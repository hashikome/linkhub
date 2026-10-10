# Bulk import

Status: designed, not built (ExecPlan:
[deliver-bulk-import](../exec-plans/active/deliver-bulk-import.md)). Settled in
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

## Ownership prerequisite

Imports are owner-only management actions. The person must already own a hub;
imports never create one implicitly. The future import page prompts a hubless
person to Create hub before uploading. Only collections owned by that hub may
be destinations, including an existing target shared with other people.
Contributors can edit items but cannot import, even if they own another hub.
The API enforces ownership and target existence independently of client guidance.

The current one-shot API accepts `targetCollectionId`, or `createCollection`
with title and slug. It resolves the caller's hub; no `hubId` input is needed.
Creating an import destination without a hub returns `hub_unavailable`.

## Journey

1. **Start** (Manage › Import & export, `/manage/import-export`, also reached from Save a
   link's "Bulk import links"): upload
   a bookmarks file (HTML, as every browser exports it) or a CSV, or paste a list
   of links, one per line. Nothing is saved to any collection yet.
2. **Preview**: a table of every row, filling in as titles resolve, with a
   summary line ("184 ready · 12 need attention · 3 duplicates") and filters
   All / Ready / Needs attention.
3. **Structure** (files with folders): keep everything in one collection with
   folders as sections, or split folders into collections; see below.
4. **Fix**: edit a failed row's address in place (re-checked at once), add or
   remove tags, drop rows; **Revalidate failed** retries lookups; **Drop all
   failed** clears them.
5. **Import N ready links**: commits every ready row to its destination. Rows
   that still need attention stay in the draft ("12 links need attention"),
   reachable from the import page until fixed or dropped.

## Rows and statuses

Each row holds an address, optional tags and its folder path — the only things
taken from the person: the link, and where it goes. A title in the file
(bookmark text, a CSV `title` column) is a hint for whoever reads the file and
is ignored; titles, descriptions and site names always come from the page.

| Status | Meaning | Importable |
| --- | --- | --- |
| Looking up | Waiting for its title | No (yet) |
| Ready | Valid public address; title found, or a real site without one (the address stands in) | Yes |
| Failed | Not an address, not public, domain doesn't exist, or the site couldn't be reached; the reason is shown | After a fix or revalidation |
| Duplicate | Same canonical address earlier in this draft for the same destination | No; dropped on import |
| Already saved | Already in its destination collection | No; skipped on import |
| Imported | Saved to its destination | — |

Checks are the Save a link checks: canonical address, the public-address rule,
tags normalized and capped. Editing an address moves the row back to Looking up.

## Folders and destinations

Bookmark folders (and a CSV `folder` column such as `Design/Typography`) form a
tree. The structure choice:

- **Keep in one collection**: one chosen destination (existing or new); every
  folder becomes a heading (section) in order, nested folders flattened to
  "Design › Typography".
- **Split into collections**: each folder gets a destination —
  - a new collection named after the folder (default for top-level folders);
  - an existing collection the person owns;
  - a section in its parent folder's destination (default for subfolders);
  - skip (for leftovers such as "Other bookmarks").

Links outside any folder, and pasted lists, go to one chosen collection. New
collections default to public with an explicit private choice before commit
(ADR-0028, rollout pending). Drafts stay private and existing destinations retain
their visibility. The current one-shot API still creates private collections. Changing a destination re-marks "Already saved" and
"Duplicate" rows for the new target.

Create section headings only alongside at least one accepted item in the same
commit. Skipped, duplicate or failed-only folders must not leave empty sections
(ADR-0027). Preserve source locations in the draft for review.

## Limits

- One file up to 10 MB and 1,000 links per draft; larger exports are imported in
  parts (one folder at a time).
- Up to 3 open drafts per account; a draft expires 30 days after its last change.
- Title lookups run in the worker with a per-account budget separate from Save a
  link's previews, limited concurrency and politeness per site.

## API sketch

- `POST /api/v1/imports` (multipart file or pasted `urls`) → draft with rows.
- `GET /api/v1/imports/:id` → draft summary, folder tree and destinations;
  `GET /api/v1/imports/:id/rows?status=&cursor=` → paginated rows.
- `PATCH /api/v1/imports/:id/rows/:rowId` (address, tags), `DELETE …/rows/:rowId`.
- `PATCH /api/v1/imports/:id/folders/:folderId` (destination mode and target).
- `POST /api/v1/imports/:id/revalidate`, `POST /api/v1/imports/:id/drop-failed`.
- `POST /api/v1/imports/:id/commit` → per-destination counts; idempotent per row.
- `DELETE /api/v1/imports/:id` discards a draft.

The implemented one-shot `POST /imports/csv` and `/imports/bookmarks-html`
remain available until this draft workflow ships, when they will be removed
without compatibility endpoints.

## Web

`/manage/import-export` (a section of [Manage](manage-workspace.md)) lists open
drafts and starts a new one. `/manage/import-export/:id` is the preview:
structure panel, summary, filters and the paginated table, with native forms
for every action (works without JavaScript; the page refreshes to show progress,
and polls with JavaScript). Reuses Save a link's pieces: blue/red address
state, tag pills, destination picker.

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
