# Make CSV imports describe collections and sections directly

This ExecPlan follows `PLANS.md` and records the product owner's correction to
bulk import: bookmarks are user exports; CSV is a documented product format.

## Purpose / Big Picture

A CSV specifies collections, optional sections, resource URLs and
resource tags. Uploading it determines placement without a destination-mapping
step. Preview validates and confirms the prescribed structure. Bookmarks retain
folder mapping. TXT remains file-only, one URL per line; inline paste is removed.

## Progress

- [x] (2026-10-10) Removed inline paste and implemented required TXT uploads;
  targeted parser and all 20 import API tests pass. Full isolated gate and focused native/enhanced browser checks passed.
- [x] (2026-10-10) Settled creation-only CSV contract and updated product/design documentation.
- [x] (2026-10-10) Implemented strict parsing, prescribed new destinations and section descriptions.
- [x] (2026-10-10) Added CSV template and prescribed-placement review without mapping controls.
- [x] (2026-10-10) Parser regressions and all 22 import API tests passed, including
  prescribed creation, same-name existing collections, descriptions/tags, partial
  commits and retained heading boundaries. Full isolated gate exited 0.
- [x] (2026-10-10) Focused bookmarks/TXT/CSV browser scenarios passed with and
  without JavaScript. Final CSV typography/grouping rerun passed at 390/1280 px.
- [x] (2026-10-10) Applied the two additive local migrations; Prisma schema diff
  reports no difference. Existing drafts and resources were preserved.

- [x] (2026-10-10) Follow-up: reduced CSV to exactly `collection,section,url,tags`, documented blank sections for flat collections, and removed obsolete code/storage. Full isolated verification and the focused CSV browser scenario passed.

- [x] (2026-10-10) Capacity follow-up: raised file limit to 5,000 links and daily lookup budget to 15,000. Both supplied Chrome files parse all 1,115 links and 20 folders; four invalid addresses remain reviewable. All-format boundary tests, 23 import API tests and the full isolated gate passed.

## Surprises & Discoveries

- The initial CSV accepted `url,tags,folder` and asked for mapping after upload. That
  adds decisions the product owner explicitly wants the file to resolve.
- Sections are ordered heading resources, not separate entities. Each heading
  must have at least one following resource before the next heading.
- A pending review found insertion before a row can split its existing section
  after a folder-mode change; insertion boundaries need to preserve whole sections.

## Decision Log

- Decision (2026-10-10, product owner): CSV uses the product's collection/section
  structure, including section descriptions and resource tags. No folder mapping
  or collection selection is required after a valid CSV upload.
- Decision (2026-10-10, product owner): no inline paste. TXT is a file upload.
- Decision (2026-10-10, product owner): CSV is creation, not update. Every
  collection is new. No existing collection IDs, name matching or append behavior.

- Decision (2026-10-10, product owner follow-up): descriptions are edited after
  import; notes are deferred. Use exactly `collection,section,url,tags`, with
  blank section/tag values allowed. This supersedes the earlier description
  column. Remove obsolete import-description plumbing and storage via a
  follow-up migration; keep applied migration history intact.

- Decision (2026-10-10, product owner capacity follow-up): raise the file cap
  from 1,000 to 5,000 links so the supplied Chrome library fits. Scale the daily
  lookup budget from 3,000 to 15,000 (three full drafts); keep 10 MB uploads,
  folder/depth bounds, three open drafts and 100-link commit batches.

## Outcomes & Retrospective

Initial milestone completed: creation-only CSV, strict five-column contract, section descriptions,
a downloadable template and review without destination controls. TXT replaced
inline paste. Bookmark translation retains its separate mapping workflow.

The follow-up now ships exactly `collection,section,url,tags`. Empty section
and tag values are supported; flat collections create only link resources.
Descriptions are edited after import, notes remain deferred, and import-only
description code/storage has been removed.

The section integrity gate also caught an invalid test fixture with an empty
existing heading; the fixture now includes an existing resource. Retaining
heading receipts across mapping changes fixes the reviewed partial-commit split.
The earlier bulk-import plan remains a historical record.

## Context And Orientation

`import-parser.ts` parses bounded files. `imports.service.ts` creates private
drafts, derives destinations, then commits ready rows through owner policy under
the authority transaction. `ImportFolder` stores grouping and heading receipts;
`ImportRow` stores addresses, tags and immutable import receipts. The web start
and preview pages live under `apps/web/src/app/manage/import-export/`.

## Plan Of Work

Document a single strict layout, parse it into collection/section groups before
persistence, create new destinations from file titles without matching existing collections. Render prescribed placement as a read-only
summary. Keep validation and partial-commit receipts, and enforce section structure
through the resource service's existing invariant. Supply an example file.

## Concrete Steps

Run parser tests, disposable API tests, `bun run verify:isolated`, and focused
`bun run verify:isolated test:browser` import scenarios. Do not build into the
running development checkout's `.next` directory.

## Validation And Acceptance

- A valid CSV creates its stated collections, optional sections and tagged
  resources without any mapping step, with and without JavaScript.
- Format conflicts fail predictably; invalid URLs remain identifiable for repair.
- CSV rejects destination changes; identical existing titles never become targets.
- Partial commits preserve source order and cannot create empty sections.
- TXT and bookmarks continue working; no inline paste is offered or accepted.

## Idempotence And Recovery

Keep applied migration history and use follow-up migrations. Preserve existing
drafts, receipts and resources; the obsolete import-description column was empty
locally before removal. Verification uses disposable databases. No reset of user
data or active development artifacts.

## Artifacts And Notes

TXT targeted API evidence: `/tmp/nslinkhub-text-import-targeted.log` (20 passing).
TXT gate: `/tmp/nslinkhub-text-import-final-verify.log`; browser run:
`/tmp/nslinkhub-text-import-browser.log` (both passed).
Creation-only gate: `/tmp/nslinkhub-structured-csv-verify.log` (exit 0).
Focused browser: `/tmp/nslinkhub-structured-csv-browser.log` (3 passed), followed
by `/tmp/nslinkhub-structured-csv-visual.log` (CSV rerun, 1 passed) after the final
spacing/typography adjustment. Biome checked the final cosmetic and optional-chain
cleanup. Screenshots: `/tmp/structured-csv-true-{390,1280}.png`.

Prisma generated `20261010190441_structured_csv_imports` with `migrate dev
--create-only` against a disposable DB; reviewed SQL adds only the nullable
500-character section-description column. `20261010230000_text_file_imports`
updates the SQL-only source-kind constraint and preserves existing line-list
drafts. Both are applied locally, without resetting data.

Lean CSV follow-up: removed import-only descriptions from parser, service, wire
types, preview and CSS. Generated and reviewed
`20261010231000_remove_import_descriptions`; its only SQL drops the unused
`import_folders.section_description` column. Applied locally after confirming
zero non-null values; Prisma schema parity reports no difference. Resource
section descriptions remain available for editing after import. The CSV fixture
and template now include a flat collection with blank section/tag values.

Follow-up verification: `/tmp/nslinkhub-lean-csv-final-verify.log` exited 0
(full gate, including all 22 import API tests and production web build/typecheck).
`/tmp/nslinkhub-lean-csv-final-browser.log` exited 0 (one CSV scenario, both
JavaScript modes, sectioned and flat collections; 86 other scenarios filtered).
The initial browser assertion used an incorrect resource-kind string; it was
corrected to assert the exact resource list, then both verification runs restarted.

Capacity evidence: `/tmp/nslinkhub-import-capacity-targeted.log` (23 API tests
passed, including persistence of 5,000 unique links with an existing lookup
budget) and `/tmp/nslinkhub-import-capacity-verify.log` (full isolated gate, exit
0). Parser accepts 5,000 and rejects 5,001 links for CSV, TXT and bookmark HTML.
The real library was parsed without uploading it into an account.

## Interfaces And Dependencies

Bun, NestJS, Prisma/PostgreSQL, shared wire types and Next.js native forms. Backend
owns file validation, authorization and section invariants. No new library needed.
