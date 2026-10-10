# Deliver bulk import through reviewed drafts

This ExecPlan is a living document. Maintain it according to `PLANS.md`.
Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and
`Outcomes & Retrospective` current as work proceeds.

## Purpose / Big Picture

People bring their existing links in bulk — a browser bookmarks export, a CSV,
or a pasted list — and review everything before it lands: titles resolved from
the pages, failures explained and fixable in place, and folders mapped either
to sections of one collection or to separate collections. Observe it by
uploading a bookmarks file with folders at Manage › Import & export (`/manage/import-export`), splitting two folders into
new collections, fixing one failed address, importing the ready rows, and
finding the remaining failure still waiting in the draft.

Design: [bulk-import.md](../../design-docs/bulk-import.md). Decision:
[ADR-0012](../../engineering-decisions/0012-bulk-import-through-reviewed-drafts.md).

## Progress

- [x] (2026-10-08) Design, decision (ADR-0012) and this plan written; Save a
  link's "Bulk import links" fake door confirmed the demand.
- [ ] M1 — Draft model and parsing (API).
- [ ] M2 — Background title lookups and revalidation (worker), on the
  link-metadata foundation's lookup queue (built first; `PRODUCT.md` §11).
- [ ] M3 — Folder destinations and commit (API).
- [ ] M4 — Web start and preview pages under Manage (`/manage/import-export`), after
  the Manage workspace exists (`PRODUCT.md` §11).
- [ ] M5 — Remove one-shot import, expiry cleanup, docs and acceptance.

## Surprises & Discoveries

- Observation: browsers export the whole bookmarks tree as one file; none
  export a single subfolder.
  Evidence: Chrome, Firefox and Safari export menus. Hence folder mapping lives
  in the preview, not in the export.

## Decision Log

- Decision (2026-10-09, product owner): importing is owner management, not
  contribution. Require an existing personal hub and requireManage for every
  destination; never create a hub implicitly. The future import page prompts
  explicit Create hub before upload. This replaces any earlier contributor
  import permission; see ADR-0012 and ADR-0018 amendments.


- Decision: imports resolve titles like every save; source titles are ignored.
  Rationale: one rule for every link (ADR-0007). Date/Author: 2026-10-08 / Paul
- Decision: a server-side draft with a preview step, partial commits, and
  failures that wait for a fix or drop.
  Rationale: fix before landing; scale beyond a request. Date/Author: 2026-10-08 / Paul
- Decision: folders become sections, or split into separate collections per
  folder (new, existing, section of parent, or skip).
  Rationale: one export serves any arrangement. Date/Author: 2026-10-08 / Paul
- Decision: limits of 1,000 links per draft, 3 open drafts, 30-day expiry.
  Rationale: bounded storage and lookup load; larger exports import by folder.
  Date/Author: 2026-10-08 / Claude, confirmed by Paul

- Decision (2026-10-10): preserve source/folder provenance for future document
  extraction and AI suggestions, but keep them outside this milestone. Reuse this
  reviewed draft/commit contract; see [assisted curation](../../design-docs/ai-curation.md).
  Confirmed in ADR-0028: bookmarks/CSV remain free; paid DOCX extraction and
  AI organization are separate follow-ups.
- Decision (2026-10-10): commit headings only with at least one accepted item;
  failed-only/skipped folders must not create empty sections (ADR-0027).

- Decision (2026-10-10): ADR-0028 sets public-by-default new collections with
  a private choice; drafts stay private. Coordinate creation defaults with the
  entitlement/quota rollout, while preserving existing destination visibility.

## Outcomes & Retrospective

Not started.

## Context And Orientation

`apps/api/src/modules/imports/` parses CSV (`url`, optional `title`) and
bookmarks HTML (anchors only, no folders) and writes straight into one
collection with a per-row report, ignoring source titles and enqueuing shared
link-metadata lookups. Save a link
(`collections/capture.service.ts`, `POST /api/v1/capture`) holds the rules to
reuse: canonical URLs (`resources`), `isPublicLinkHost` (`@nslinkhub/types`),
tag normalization (`maxTags`, `maxTagLength`), title lookup
(`resources/page-metadata.ts`, SSRF-guarded) and the default collection naming.
Background work runs in the BullMQ worker that already delivers email
(`apps/api/src/email/worker.ts`). Writes run under the global authority lock
(ADR-0005); lookups must not. The web posts native forms to
`apps/web/src/app/forms/[action]/route.ts`.

## Plan Of Work

**M1 — Draft model and parsing.** Migration (create-only, reviewed) for
`import_drafts` (id, user, hub, source kind, row/status counts, expires_at),
`import_folders` (draft, parent, path, position, destination mode
`collection|section|skip`, target collection id or new title) and `import_rows`
(draft, folder, position, raw address, canonical url, tags, status, reason,
resolved title, resource id once imported). Parsers: bookmarks HTML as a folder
tree (`<DL>`/`<H3>` nesting), CSV `url`, optional `tags`, optional `folder`
path, and pasted lines. Initial checks per row (address, public rule,
duplicates, already saved). Endpoints: create, read summary, list rows with
status filter and cursor, edit/drop a row, discard a draft; all scoped to the
owning account (other accounts get 404).

**M2 — Title lookups.** Reuse the link-metadata queue and shared
`link_metadata` rows (delivered first): one pending row per address after the draft
commits, bounded concurrency, per-host spacing, a per-account budget separate
from link previews. Results move rows to Ready or Failed with a reason;
editing an address or **Revalidate failed** re-queues. No lookup runs under the
write lock.

**M3 — Destinations and commit.** Folder destination edits (one collection with
sections, or per-folder new/existing/section/skip) with defaults as designed;
recompute Duplicate/Already saved on change. Commit in batches under the write
lock: create new collections with the owner’s reviewed visibility, headings for section folders in tree
order, resources for Ready rows; mark rows Imported with their resource id so a
retry never duplicates. Return per-destination counts.

**M4 — Web.** `/manage/import-export` (open drafts; upload, CSV or paste; start) and
`/manage/import-export/:id` (structure panel, summary, filters, paginated table, row edit and
drop, bulk actions, Import N ready). Reuse Save a link's address state, tag
pills and destination picker. Native forms first; JavaScript adds polling and
in-place updates. "Bulk import links" on Save a link links here.

**M5 — Finish.** Remove `POST /imports/csv` and `/imports/bookmarks-html` and
their types; expired-draft cleanup in the worker; update PRODUCT.md (journey,
§9, §10), collections-and-resources.md, SECURITY/RELIABILITY where touched,
CHANGELOG; move this plan to `completed/`.

## Concrete Steps

From the repository root: `bun run infra:up`; in `apps/api`,
`bunx prisma migrate dev --create-only --name import_drafts`, review the SQL,
apply; then `bun run verify` and `bun run test:browser`.

## Validation And Acceptance

- E2E: bookmarks with nested folders parse into the right tree; CSV with
  `folder`/`tags`; a source title is ignored; non-public, malformed and
  non-existent addresses fail with reasons; duplicates and already-saved rows
  are marked; another account cannot read or act on a draft (404); limits
  enforced.
- E2E: commit creates new collections and sections in order with the reviewed visibility, imports
  only Ready rows, leaves failures in the draft, and is idempotent on retry.
- Browser (with and without JavaScript): upload a bookmarks file, split two
  folders into collections, fix one failed row, import, see "N links need
  attention", drop failed, draft closes.

## Idempotence And Recovery

Rows record their resource id when imported; a repeated commit skips them.
Lookups are retriable jobs; a crashed worker leaves rows Looking up until the
job is retried. Discarding a draft deletes only the draft, never imported links.

## Artifacts And Notes

None yet.

## Interfaces And Dependencies

New `@nslinkhub/types` contracts for drafts, folders, rows and statuses; the
worker's `link-metadata` queue and `resources/page-metadata.ts` are reused.
