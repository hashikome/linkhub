# Capture core audit effects

## Purpose / Big Picture

Make the interim audit useful for a bounded set of real operations: publication,
share-link enable/disable/rotation, direct-access changes and collection transfer.
New hub records retain before/after state and the actual result in the mutation
transaction. Service records already carry reasons/results/state transitions.
The reader presents this evidence without inventing missing historical values.
The comprehensive audit and wide-event milestones in PRODUCT §11 remain deferred.

## Progress

- [x] (2026-10-09) Read the handoff, current contracts and mutation writers.
- [x] (2026-10-09) User rejected a cosmetic/filter-only pass and chose core change capture.
- [x] (2026-10-09) Added/reviewed migration, applied locally and verified no schema difference; effects captured under mutation lock.
- [x] (2026-10-09) Presented actual targets/effects/results and added unified search, local seconds and local-day date ranges.
- [x] (2026-10-09) Verified atomicity, no-ops, old records, authorization and browser continuation.
- [x] Update contracts/changelog, run full verification and browser checks.
- [x] (2026-10-09) Follow-up: rename Audit Log, reorder Timestamp/Actor/Action/Target/Outcome/Change; support copied actor IDs in Accounts and separate Email, Username and Active sessions columns.
- [x] (2026-10-09) Search displayed row content, keep desktop timestamps on one line, and reuse blue-underlined tabs for My hub / Service.

## Surprises & Discoveries

Hub rows contain action names but no effects. Repeated publication/share commands
can record an action even when no state changed. Service session revocation stores
account state, so active → active is not evidence of how many sessions ended.
Service invitation targets must prefer invitationId over recipient user ID.
The first full API gate passed. Browser coverage exposed a test selector matching
both Published and Unpublished; the exact no-op assertion is corrected. No event
data was wrong. Final checks include the subsequently requested filter simplification.
Browser coverage also caught empty search accidentally inheriting the canonical
hub scope ID, which ceased matching ordinary rows under content search. Removed
that fallback. Retry checks now compare immutable event instants rather than
transient UTC-to-local display text during hydration.
The expanded Accounts table overflowed at tablet width; it now switches to
labelled rows below 1024px. Renamed headings required updating existing browser
assertions. Source review confirms no durable last-login field exists; the API
returns current unexpired session counts.

## Decision Log

- 2026-10-09: Follow the user's explicit approval for a small capture slice under
  ADR-0020. Reuse bounded before/after state and outcome columns, as in service
  audit; do not introduce arbitrary JSON or authored-content snapshots.
- Keep read recording; default the web to actions/decisions with an explicit
  all-events view. Apply filtering before pagination and bind it to cursors.
- Preserve stable actor/target ID copying. Show missing historical evidence
  explicitly. State labels are presentation; IDs remain authoritative.
- 2026-10-09 user follow-ups: one Search field plus Action and date range;
  Include read events is a checkbox. The later row-content search correction supersedes exact identity lookup in
  the single Search field. Explicit API identity filters still resolve to IDs. Show viewer-local `YYYY-MM-DD HH:mm:ss`, without
  offsets in rows; date ranges follow the same local days.
- 2026-10-09: Accounts resolves a full user UUID exactly. Show the current active
  session count already owned by auth; do not present retained session creation
  times as a durable last-login history.

- 2026-10-09: User corrected search to match displayed audit content. Share label
  catalogs between web and API, match all words case-insensitively before pagination,
  preserve scope and cursor binding, and keep local dates in date filters.

## Outcomes & Retrospective

Completed and verified on 2026-10-09. Full `bun run verify` passed, followed by
52 production browser tests (798 assertions), including JavaScript-free forms,
permission boundaries, ID copying, direct account navigation and collection actions.
Reviewed the final account profile screenshot: Member since, Account updated,
Last login, and permitted actions at the bottom. Local schema parity reports
“No difference detected”. No real user account or collection was deleted.


## Context And Orientation

`apps/api/src/common/audit.ts` writes hub records. Collection mutations and their
transaction/row lock are in `modules/collections/collections.service.ts`.
`common/audit-query.ts` binds canonical filters to cursors. Service recording
and reads live in `modules/operations`. `packages/types` owns wire contracts.
The web's `AuditEvents`, `AuditFilters` and audit route/continuation render both
scopes. Preserve the large pre-existing worktree and already applied migrations.

## Plan Of Work

Add nullable before/after/outcome columns to hub audit; validate allowed states
by action. Derive effects from locked persisted state when performing the covered
mutations, including no-op commands and transfer records in both hubs. Add API
filtering for actions versus all events. Render explicit effect text and targets
from action semantics, retain known service reasons/outcomes, and mark legacy
details unavailable. Update API and browser regressions and current docs.

## Concrete Steps

Use `bunx prisma migrate dev --create-only` in `apps/api` against an isolated
database; inspect SQL, deploy and check parity. Run `bun run verify` and
`bun run test:browser` in the scratch checkout so development `.next` is untouched.

## Validation And Acceptance

Covered new records show truthful previous/resulting state. No-ops say no change.
Audit failure rolls back the mutation; failed authorization/version checks create
no success evidence. Legacy rows remain null. No tokens/content enter effects.
Owner/service scopes, filter-bound cursors, append pagination, native forms,
full-ID copying and mobile layouts work. Full repository gates pass.

## Idempotence And Recovery

Use an additive migration and disposable test databases; do not backfill unknown
effects or reset user data. Apply reviewed migration before running changed code.

## Artifacts And Notes

Evidence and verification logs will be recorded on completion.

## Interfaces And Dependencies

Bun, Biome, Prisma, existing API envelopes and UUID identity rules. No new packages.
Attribution continues using the existing action catalog. No richer private content
is exposed to service operators. SQL-only invariants must survive migration.

Verification checkpoint (2026-10-09): full `bun run verify` passed in the isolated
checkout (`/tmp/nslinkhub-final-profile-verify.log`), including the Last login
transaction regression and bounded profile API. Local migration parity reports
“No difference detected”. Final browser verification passed: 52 tests, 798 assertions.

Final evidence: `/tmp/nslinkhub-final-profile-verify.log`,
`/tmp/nslinkhub-final-profile-browser.log`, `/tmp/account-profile-true.png`,
`/tmp/account-profile-false.png`, `/tmp/manage-action-dialog.png` and
`/tmp/manage-action-dialog-mobile.png`. Earlier attempts exposed a stale
last-login exclusion assertion and an intermittent unrelated capture journey;
the final complete runs pass with the updated contracts.
