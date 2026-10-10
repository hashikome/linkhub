# Append Manage table pages

## Purpose / Big Picture

Make Accounts, Access, both Collections contexts, Team and Invitations behave like Audit:
Load more appends rows without moving headings or replacing existing results,
and disappears on the last page. Preserve native next-page links without JavaScript.

## Progress

- [x] Inspected all Manage lists and their authorization/read boundaries.
- [x] Implement shared continuation and reuse server-rendered row actions.
- [x] Rename the People tab and page to Access per user feedback; keep its route.
- [x] Exercise pagination, failures, authorization and native fallback in the browser
  (all six list views; 68 assertions).
- [x] Run verification and record completed work (2026-10-09).

## Surprises & Discoveries

Service Collections previously truncated active holds at 100. Add API cursor
pagination there too, preserving minimal metadata and operator authorization.

## Decision Log

- Keep row rendering and operation IDs on the server. A read-only server action
  fetches the next page through serverRead and returns rendered rows to the shared
  client table. This preserves existing action forms and avoids duplicating their
  authorization presentation rules in browser code. Each read uses current session
  cookies and API authorization; the client supplies only list kind, sealed search
  context and cursor. Audit keeps its existing JSON continuation.

## Outcomes & Retrospective

Completed. Every Manage list now appends pages and removes its continuation
control on exhaustion. Access is the owner-facing label. Service holds now page
through all results while retaining the same limited metadata and authorization.

## Context And Orientation

Manage pages currently render tables with native cursor links. AuditEvents is the
existing enhanced list. OperatorTableRegion and globals.css provide the common
scroll boundary and sticky table headings. operator-ui and invitation-form render
server-owned action forms including operation IDs.

## Plan Of Work

Extract existing row renderers, create a shared client continuation table and a
bounded server action, replace native-only lists, then verify both delivery paths.

## Concrete Steps

Run bun run verify in the isolated verification workspace. Run focused browser
checks through tooling/verify-browser.ts with disposable database fixtures.

## Validation And Acceptance

Existing rows survive continuation and retryable failures; repeated clicks do not
issue parallel loads; duplicate IDs are not appended. Last-page completion removes
the link and announces results. Headers remain fixed while rows scroll. Search
context is preserved without exposing unsealed search in the URL. Server reads
recheck authorization. Native links remain usable without JavaScript.

## Idempotence And Recovery

Read-only continuation changes no product records beyond existing audit reads.
Tests use disposable databases. Failed loads retain the same cursor for retry.

## Artifacts And Notes

- `bun run verify`: passed in the isolated verification workspace.
- Production browser pagination test: all six list views, enhanced and native
  delivery, retry, sticky headings, final-page completion, session loss and row
  action IDs; 68 assertions passed.
- Existing Audit, native management action and owner/service-context browser
  regressions: three tests, 76 assertions passed.
- Held-collections HTTP test: cursor traversal without duplicates/private titles,
  wrong-scope cursor rejection and denied non-operator reads passed.
- `bun run check:docs` and `git diff --check`: passed.
- Disposable logs: `/tmp/nslinkhub-manage-more-verify.log`,
  `/tmp/nslinkhub-manage-more-browser.log`, and
  `/tmp/nslinkhub-manage-regressions-browser.log`.

## Interfaces And Dependencies

The active-holds API gains standard cursor metadata; no schema changes. Shared types, serverRead and existing action forms
remain authoritative; no server implementation is imported into browser modules.
