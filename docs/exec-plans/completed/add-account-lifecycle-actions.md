# Add account lifecycle actions

## Purpose / Big Picture

Deliver the requested Accounts table: Account (name/username), copyable User ID,
Email, Role, Status, Member since and Sessions, with direct navigation to detail actions. The API owns available actions. Add
Inactive through reversible deactivation and admin-only account deletion using
PRODUCT's existing 14-day grace period. The scheduled deletion is cancellable;
expired requests remove the user and owned hub/content while preserving anonymous
contributions and audit IDs. Self-service deletion remains a later workflow.

## Progress

- [x] (2026-10-09) User specified final columns and admin deletion; read current authority, suspension and planned deletion contracts.
- [x] (2026-10-09) Implemented inactive/deletion schema, authority, cleanup and regression tests (21 API tests pass).
- [x] (2026-10-09) Implemented backend-driven direct Action menu and detail forms.
- [x] Document settled boundaries, verify and present the completed change.

## Surprises & Discoveries

Existing suspension revokes sessions, proofs and operator grants and suppresses
owned content. Most policies already require active accounts; three explicit
suspended checks need broadening. The PRD specifies deletion after 14 days, and
foreign keys already cascade owned hubs/content and anonymize retained contributions.

## Decision Log

- Inactive means deliberately deactivated, never inferred from session count.
- Operators may deactivate/suspend ordinary accounts; admins may additionally
  schedule/cancel deletion of non-admin accounts. No self-deactivation/deletion or
  restriction of admin accounts. Protected admin lifecycle stays outside this UI.
- Scheduling deletion disables access immediately. Cancellation leaves the user
  inactive; reactivation is separate and never restores revoked grants/sessions.
- Keep recent-verification, reason, version and idempotency requirements. Cleanup
  and cancellation share the existing authority lock. Cleanup records its terminal
  result atomically and never erases operator audit history.

## Outcomes & Retrospective

Completed and verified on 2026-10-09. Full `bun run verify` passed, followed by
52 production browser tests (798 assertions), including JavaScript-free forms,
permission boundaries, ID copying, direct account navigation and collection actions.
Reviewed the final account profile screenshot: Member since, Account updated,
Last login, and permitted actions at the bottom. Local schema parity reports
“No difference detected”. No real user account or collection was deleted.


## Context And Orientation

OperationsService owns operator transactions. Auth/session guards and collection
availability require active users. RequestBudgetMaintenance owns periodic cleanup.
Prisma SQL-only invariants and existing worktree changes must be preserved.

## Plan Of Work

Add a nullable deletion deadline and expand the account-state CHECK to inactive.
Add commands and backend action availability, block inactive sign-in/invitations,
and prune due deletion requests transactionally. Render a native Action menu
leading to a reasoned operation form, and show scheduled deletion prominently.
Verify role boundaries, races, retries, cancellation and owned/retained content.

## Concrete Steps

Generate with `prisma migrate dev --create-only` against a disposable database;
review SQL, deploy locally and check parity. Run `bun run verify` and
`bun run test:browser` in the scratch checkout.

## Validation And Acceptance

Actions displayed match API capability and backend checks resist forged commands.
Deactivation revokes access; reactivation allows only fresh sign-in. Only admins
schedule/cancel non-admin deletion. Due cleanup removes owned content, anonymizes
other contributions and retains audited identities. Retries and races cannot
restore access or delete a cancelled account. No real account is deleted in tests.

## Idempotence And Recovery

Use additive migration and disposable test data. A scheduled deletion can be
cancelled before cleanup; final deletion is irreversible and described in the UI.
Do not execute lifecycle commands against user data during implementation.

## Artifacts And Notes

Verification evidence will be recorded at completion.

## Interfaces And Dependencies

Existing authority lock, Prisma, Bun, periodic maintenance and native forms. No
new dependency, private-content inspection or external message delivery.

Latest steering: Accounts uses single-row selection (explicit user choice), with action buttons above the table and no name link or Action column. Joined is restored between Status and Sessions. Collection rows retain the direct Action dialog.

### Final account navigation refinement (2026-10-09)

The user replaced single-row selection with direct account navigation: no Select
or Action column/toolbar on the Accounts list. Clicking a row opens account detail;
its name remains a native link for keyboard/no-JavaScript access. ID copying does
not navigate. Account detail presents permitted action buttons at the bottom,
without a chooser dialog. Consequence/reason forms remain authoritative for mutations.
This supersedes the earlier selection and account-dialog presentation decisions.

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
