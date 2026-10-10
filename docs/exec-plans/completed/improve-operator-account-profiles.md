# Improve operator account profiles

## Purpose / Big Picture

Let an operator follow an actor ID from Audit Log into a useful account profile.
The list shows name/username, copyable User ID, email, role, status,
unexpired session count and direct row navigation. Verification is detail-only; Member since is shown in local time. The detail API/page also shows public profile fields,
hub, suspension evidence and bounded active-session metadata, never credentials.

## Progress

- [x] (2026-10-09) Inspected User, Account and Session schemas and current API; user approved improving the API from actual source fields.
- [x] (2026-10-09) Implemented typed summary/detail contracts and account screens; IP/user agent omitted as requested.
- [x] Verify authorization, missing values, session expiry, no credential disclosure and browser flows.
- [x] Update contracts/changelog and complete repository verification.

## Surprises & Discoveries

The UI list queries users, not better-auth's accounts table. No durable last-login
field exists. Session update/verification times must not be called last login.
The user explicitly excluded IP and user agent. Do not select or return either.

## Decision Log

- 2026-10-09: Keep the paginated summary and enrich the authorized detail endpoint.
  Use existing persisted fields; no new tracking, schema, private-content reads,
  activity scoring or identity inference, IP addresses or user agents. Return at most 100 active sessions,
  explicitly showing the total count if more exist. Query expiry at one instant.
- 2026-10-09: Full UUID search remains exact; other account searches match
  username/email/hub fragments. Joined is the user creation timestamp.

## Outcomes & Retrospective

Completed and verified on 2026-10-09. Full `bun run verify` passed, followed by
52 production browser tests (798 assertions), including JavaScript-free forms,
permission boundaries, ID copying, direct account navigation and collection actions.
Reviewed the final account profile screenshot: Member since, Account updated,
Last login, and permitted actions at the bottom. Local schema parity reports
“No difference detected”. No real user account or collection was deleted.


## Context And Orientation

`operations.service.ts` owns cookie/operator authorization and audited reads.
`packages/types/src/operations.ts` owns the wire contract. `manage-rows.tsx`,
`app/manage/page.tsx` and `app/manage/accounts/[id]/page.tsx` render the list/detail.
The large preexisting worktree and audit work must be preserved.

## Plan Of Work

Add an account-detail type with profile fields, suspension facts and explicitly
selected active sessions. Keep the summary lightweight. Keep verification and hub context on detail. Render session metadata
on detail with local timestamps and explicit unknown values. Add HTTP and browser
regressions, document the bounded operator metadata boundary and verify.

## Concrete Steps

Use Bun/Biome. Run `bun run verify` and `bun run test:browser` in the scratch
checkout to preserve the running development build. Use disposable test databases.

## Validation And Acceptance

Ordinary users and bearer-only callers cannot read operator profiles. No password,
session token, provider token or private content enters summary/detail responses.
Expired sessions are excluded. Missing metadata stays unknown. Suspension values
come from storage. Audit records identify the account read. List and detail work
with and without JavaScript at desktop and mobile widths.

## Idempotence And Recovery

Additive API/presentation changes and a nullable last-login migration; no backfill. Tests use
synthetic accounts and isolated databases.

## Artifacts And Notes

Verification evidence will be recorded on completion.

## Interfaces And Dependencies

Existing Prisma, better-auth session records, shared types and Manage components.
No new dependencies. Existing operator authority and private-content boundaries
remain authoritative.

## Last-login scope amendment (2026-10-09)

The user explicitly requested durable Last login on successful sign-in. Add nullable
`users.last_login_at`, update it in the existing sign-in transaction for ordinary
and invitation verification, return `lastLoginAt` in operator account APIs and
render it on detail in local time to seconds. This supersedes the earlier no-new-tracking
scope; it does not infer activity from session metadata. No backfill: existing
accounts remain unknown until they sign in. Test successful/new/repeated login,
failed verification, transaction rollback, session reads and session deletion.

### Final account navigation refinement (2026-10-09)

The user replaced single-row selection with direct account navigation: no Select
or Action column/toolbar on the Accounts list. Clicking a row opens account detail;
its name remains a native link for keyboard/no-JavaScript access. ID copying does
not navigate. Account detail presents permitted action buttons at the bottom,
without a chooser dialog. Consequence/reason forms remain authoritative for mutations.
This supersedes the earlier selection and account-dialog presentation decisions.

Final profile date order: Member since, Account updated, Last login. Member since is the existing account creation timestamp; no duplicate storage field.

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
