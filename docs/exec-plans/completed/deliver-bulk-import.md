# Deliver bulk import through reviewed drafts

This ExecPlan is a living document. Maintain it according to `PLANS.md`.
Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and
`Outcomes & Retrospective` current as work proceeds.

## Purpose / Big Picture

People bring their existing links in bulk — a browser bookmarks export, a CSV,
or a plain-text file — and review everything before it lands: titles resolved from
the pages, failures explained and fixable in place, and folders mapped either
to sections of one collection or to separate collections. Observe it by
uploading a bookmarks file with folders at Manage › Import & export (`/manage/import-export`), splitting two folders into
new collections, fixing one failed address, importing the ready rows, and
finding the remaining failure still waiting in the draft.

Design: [bulk-import.md](../../design-docs/bulk-import.md). Decision:
[ADR-0012](../../engineering-decisions/0012-bulk-import-through-reviewed-drafts.md).

## Progress

- [x] (2026-10-10) Checked local username lengths and restored the drifted
  column from varchar(60) to the committed varchar(20), under a table lock;
  both existing usernames fit (maximum 18), with no reset or truncation.
- [x] (2026-10-10) Baseline `bun run verify` passed in a disposable checkout, isolated
  from the active development server and its Next.js build directory.
- [x] (2026-10-08) Design, decision (ADR-0012) and this plan written; Save a
  link's "Bulk import links" fake door confirmed the demand.
- [x] (2026-10-10) M1 — Draft model and parsing (API).
- [x] (2026-10-10) M2 — Background title lookups and revalidation (worker), on the
  link-metadata foundation's lookup queue (built first; `PRODUCT.md` §11).
- [x] (2026-10-10) M3 — Folder destinations and commit (API).
- [x] (2026-10-10) M4 — Web start and preview pages under the implemented Manage workspace
  (`/manage/import-export`; `PRODUCT.md` §11).
- [x] (2026-10-10) M5 — Removed one-shot import; delivered expiry cleanup,
  documentation and API/native/enhanced browser acceptance.

- [x] (2026-10-10) Patched review findings for reachable non-HTML metadata,
  stale destination recovery in section/skip mode, and staged snapshot deletions.
- [x] (2026-10-10) Review patch verification passed: metadata HTTP regression
  (PDF/image/unsupported bodies, untitled HTML and HTTP failure), all 17 import API
  tests (including missing metadata and four deleted/transferred destination recovery
  cases), and disposable Git snapshot regression (staged/unstaged deletions, rename,
  current edits, environment exclusions and unchanged source index). Full
  `bun run verify:isolated` exited 0, including production web build/typechecking;
  evidence: `/tmp/nslinkhub-review-fixes-verify.log`.

- [x] (2026-10-10) Follow-up review fixes verified: original-page fallback after
  failed oEmbed and source ordering across folders sharing a collection. Metadata
  tests cover provider 404s, malformed JSON, provider timeout, untitled pages,
  original-page failure and blocked private redirects; successful oEmbed avoids
  a second request. All 19 import API tests pass, including collection/section
  folders sharing an existing destination and reverse-order repairs. Full
  `bun run verify:isolated` exited 0, including production web build/typechecking;
  evidence: `/tmp/nslinkhub-import-followup-verify.log`.

- [x] (2026-10-10) Replaced inline paste with required TXT upload; full isolated
  gate and focused native/enhanced browser checks passed. Further CSV contract
  changes are tracked in [the creation-format plan](make-csv-imports-schema-driven.md).

## Surprises & Discoveries

- oEmbed availability is not page reachability. Providers get at most half the
  shared lookup deadline, reserving time for the original page with the same
  DNS, redirect and size guards when metadata is unavailable.
- Later-folder insertion boundaries include both heading and resource receipts
  for the same destination. Collection-mode folders do not necessarily have a
  heading; section-mode repairs also stop before later collection-mode rows.

- Review caught two mismatched success conditions: reachable non-HTML content
  was treated as an unreachable page, and inactive folder selections were still
  authorized. Empty metadata now retains successful reachability, while target
  authorization applies only to collection mode. SSRF checks remain unchanged.
- The snapshot overlay must enumerate HEAD as well as the current index and
  untracked files: staged deletions disappear from the index before they disappear
  from the fresh clone. A disposable Git fixture guards this distinction.

- Full browser verification exposed pre-existing stale footer/auth assertions,
  a timezone fixture using a deliberately expired shared session, and timestamp
  comparisons racing hydration. Updated the fixtures without weakening the
  underlying access, return-path or pagination checks. Owner navigation acceptance
  now includes the implemented Import & export entry.
- Too many parallel disposable checkouts exhausted local disk quota. Removed
  only this task's completed baseline checkout; the wrapper cleans its own tree.

- The broad file budget originally covered polling and all draft mutations;
  narrowed it to import creation so review does not exhaust its own upload limit.
- Partial commits must preserve the position of earlier repaired rows and folders,
  not merely append to an existing section. Regression coverage exercises both.
- The web boundary gate caught a separate fetch path; import multipart and
  version-bearing DELETE bodies now use the shared HTTP adapter.

- Local migration history has an old checksum mismatch for `people_and_hubs`.
  No reset was performed. The new migration was generated with `migrate dev
  --create-only` against a freshly migrated disposable database.
- An isolated checkout with independent dependencies/build output passes the
  entire baseline gate, including Next.js production build and route typegen.

- Observation: browsers export the whole bookmarks tree as one file; none
  export a single subfolder.
  Evidence: Chrome, Firefox and Safari export menus. Hence folder mapping lives
  in the preview, not in the export.

## Decision Log

- Decision (2026-10-10, product owner): bulk import is file-only: bookmarks HTML,
  CSV and TXT. Remove the pasted-list UI and API request contract. TXT contains
  one URL per line. An additive SQL migration relabels existing line-list drafts
  as text imports without changing their rows or receipts.


- Decision (2026-10-10): derive row status/counts from shared metadata, destination
  ownership and canonical saved URLs; store only source fields, validation errors
  and import/drop receipts. This avoids a second metadata state machine.
- Decision (2026-10-10): commit at most 100 ready links per request and budget
  3,000 lookup candidates per account per rolling day, deduplicated within each
  submission. Retries count again. This bounds authority-lock work and fetch load.

- Decision (2026-10-10): ship explicit visibility choices but retain the current
  private default until ADR-0028's coordinated entitlement rollout. No billing,
  global default change or existing-content publication belongs to this slice.
- Decision (2026-10-10): draft edits and commits carry a revision; destinations
  are reauthorized under the existing authority lock. Shared metadata jobs remain
  the sole network fetch path. Import lookups have their own account budget.
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

The API/worker and native web import workflow are implemented and verified.
`bun run verify:isolated` passed the complete `verify` gate, including API HTTP
tests, web HTTP tests, production compilation and route typechecking. Targeted
import/parser/budget coverage passed 23 tests. Imports pass in both JavaScript
modes, including explicit hub creation and foreign-origin rejection.

All 86 browser scenarios have passing evidence: the last full run passed 83;
its three failures (discussion code-page synchronization, timestamp fallback
comparison, and account-proof fixture cooldown) were corrected and each passed
a focused production-browser rerun. Earlier stale footer/auth assertions, an
expired shared timezone session and the new owner navigation expectation were
also corrected and passed in that full run. No application auth rules changed.
Screenshots of start, review and editing were inspected, with review coverage at
390, 768, 1280 and 1440 pixels and in dark mode.

The additive migration is applied locally; the username column fits the committed
20-character definition without truncation. An older migration checksum mismatch
remains recorded in the debt tracker. No retained development data was reset.

Private creation defaults remain in force until the coordinated ADR-0028 rollout.
No document extraction, AI provider or payment implementation was added.

## Context And Orientation

`apps/api/src/modules/imports/` stages CSV, bookmarks HTML and plain-text files in
account-owned drafts, preserving folder/source provenance. `import-parser.ts`
bounds source parsing; `import-state.ts` derives row statuses from shared metadata,
destination ownership and saved URLs; `ImportsService` handles revisioned edits
and atomic commits through the existing collection/resource services. Save a link
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
`import_drafts` (id, user, hub, source kind, revision, closed, expires_at),
`import_folders` (draft, parent, path, position, destination mode
`collection|section|skip`, target collection id or new title) and `import_rows`
(draft, folder, position, raw address, canonical url, tags, status, reason,
resolved title, resource id once imported). Parsers: bookmarks HTML as a folder
tree (`<DL>`/`<H3>` nesting), CSV `url`, optional `tags`, optional `folder`
path, and text-file lines. Initial checks per row (address, public rule,
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

**M4 — Web.** `/manage/import-export` (open drafts; upload HTML, CSV or TXT; start) and
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

- Full core gate: `/tmp/nslinkhub-import-release-verify.log` (exit 0).
- Import/parser/budget tests: `/tmp/nslinkhub-import-current-tests.log`
  (23 pass, 0 fail).
- Full browser run: `/tmp/nslinkhub-import-release-browser.log` (83 pass;
  three fixture failures subsequently corrected).
- Final import/native origin and cross-tab proof checks:
  `/tmp/nslinkhub-import-final-browser-checks.log` (3 pass, 0 fail).
- Pagination correction passed in `/tmp/nslinkhub-browser-final-repairs.log`;
  final discussion correction passed in `/tmp/nslinkhub-discussion-final-check.log`
  (1 pass, 0 fail). Together these cover all 86 browser scenarios.
- Representative screenshots: `/tmp/bulk-import-start-390.png`,
  `/tmp/bulk-import-true-390.png`, `/tmp/bulk-import-true-1440.png`,
  `/tmp/bulk-import-true-dark.png`, `/tmp/bulk-import-edit.png`.
- Migration adds only the three import tables and their indexes/constraints;
  generated in a fresh database, reviewed and applied locally without reset.
  Historical migration checksums were left untouched.
- Guide content was swept; its commit pin must advance after the reviewed
  implementation commit exists, per the guide-only commit convention.

## Interfaces And Dependencies

New `@nslinkhub/types` contracts for drafts, folders, rows and statuses; the
worker's `link-metadata` queue and `resources/page-metadata.ts` are reused.
