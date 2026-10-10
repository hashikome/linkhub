# Simplify authentication entry choices

## Purpose / Big Picture

A missing-account Google continuation offers Create account or Already have an
account? Sign in. First-link capture uses email codes directly. Explicitly confirmed Google creation
uses the provider-verified email and name without another inbox code. Google connection
is automatic after proof; no separate linking workflow is required.

## Progress

- [x] (2026-10-10) Compare Pigfarm policy and implementation; update copy, entry routing and cancellation destination.
- [x] (2026-10-10) Update ADR-0038, focused designs, product definition and support.
- [x] (2026-10-10) Implement confirmed Google identity registration through Better Auth and document ADR-0039.
- [x] (2026-10-10) Focused API (9 tests, 306 assertions), API/web types and browser (3 tests, 110 assertions) pass.
- [x] (2026-10-10) Full `bun run verify` passed; temporary verification servers exited.

## Surprises & Discoveries

Pigfarm ADR-0008 and `apps/api/src/auth/create-auth.ts` auto-link verified same-email
existing users, disable provider signup and refuse explicit linking UI. Its closed
invitation registration differs from nslinkhub's confirmed Google identity creation.
The existing Google cancellation form discarded the saved destination.

## Decision Log

- 2026-10-10: User changed new-account policy to trust verified Google identity;
  ADR-0039 supersedes ADR-0038's extra inbox code. Preserve explicit creation
  consent and stricter attachment proof for an existing external-email account.

- 2026-10-10: Follow the user's two-choice wording and direct-email capture rule.
  Amend ADR-0038 explicitly; retain automatic backend linking after valid proof.
- 2026-10-10: Returning to sign-in is a native POST cancellation, not a plain
  link, so the pending Google cookie and record are cleared before account switching.

## Outcomes & Retrospective

Two-choice browser journeys passed (3 tests, 107 assertions). The user then
replaced the extra email-code creation proof with trust in the verified Google
identity plus explicit Create account consent. Backend implementation and focused
API checks are complete (9 tests, 306 assertions); new browser checks passed (3 tests, 110 assertions). Full verification passed,
including API, web tests, production build and typechecks. Temporary servers
exited; no development server or live account data was changed.

## Context And Orientation

`apps/web/src/app/sign-in/` presents shared email verification and Google
continuation. `apps/web/src/lib/security-forms.ts` transports cancellation to
the backend. `apps/api/src/auth/` continues to own all identity and proof rules.

## Plan Of Work

Keep two actions on missing-account Google screens, preserve safe destinations
when cancelling, route capture directly to code issuance, and update browser
coverage for cancellation, creation and capture with and without JavaScript.

## Concrete Steps

Run Biome on changed source and `bun run check:docs`. Use a disposable checkout
for `bun run verify` and `TEST_DIRECT_API=1 bun run test:browser -t` focused on
Google inline verification and first private-link capture.

## Validation And Acceptance

The missing-account screen has exactly two buttons. Sign in clears pending
Google state and offers email/Google at the preserved destination. Google callback creates nothing; Create account atomically creates and links
using the staged verified identity without an email code.
First-link capture works with JavaScript disabled, preserves retries and uses
email directly. No test servers remain after verification.

## Idempotence And Recovery

No migrations or live data edits. Verification uses disposable databases and
temporary ports; preserve the user's development servers and build artifacts.

## Artifacts And Notes

Initial full gate failed on the unrelated audit timeline pagination expectation
in `test/operations.e2e.spec.ts`; the complete rerun passed without changes to
that unrelated test.

Browser assertions are in `apps/api/test/browser/reading.browser.ts`.

## Interfaces And Dependencies

The new POST `/google-connection/register` accepts only explicit consent and
consumes a validated pending identity; cancellation and email contracts remain. Better Auth owns proof; the frontend transports and presents it.

Verification artifacts: `/tmp/nslinkhub-google-consent-api.log`,
`/tmp/nslinkhub-google-consent-browser.log` and
`/tmp/nslinkhub-google-consent-verify.log`. Mobile light/dark and desktop screenshots
were inspected; the two-action creation screen fits without horizontal overflow.
