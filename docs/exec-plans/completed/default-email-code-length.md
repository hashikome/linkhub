# Use Better Auth's default email code length

This ExecPlan follows `PLANS.md`.

## Purpose / Big Picture

Email authentication uses six digits, reducing manual entry while retaining the
existing expiry, proof consumption, resend and shared attempt limits.

## Progress

- [x] (2026-10-12) Confirm Better Auth 1.6.23's six-digit default and existing limits.
- [x] (2026-10-12) Update issuance, validation, copy, fixtures and durable documentation.
- [x] Verify code shape, attempts across resends and affected native/enhanced journeys.
- [x] Complete the isolated verification gate and prepare for review.

## Surprises & Discoveries

- Eight digits was enforced separately in three API workflows and the shared web
  form. Removing the library option alone would reject all new codes.
- The first gate caught one remaining test assertion expecting eight digits.
  Corrected it to six; a complete gate rerun includes the concurrent UI changes.
- Shared issue/verify budgets are independent of individual challenges; resend
  replaces proof but does not reset the identity's ten-minute attempt budget.

## Decision Log

- User approved Better Auth's default. Remove `otpLength` rather than overriding
  it with six. The current public input contract remains exactly six digits;
  integration assertions will flag any future dependency-default change.
- Supersede only ADR-0004's length choice via ADR-0057. Keep five-minute expiry,
  three wrong attempts per proof, five issues and fifteen verification attempts
  per identity per ten minutes, source budgets and the resend gap.
- Previously issued eight-digit codes require requesting a new code after the
  existing cooldown. No dual-format period or data migration is needed for this
  pre-deployment product. No user records or sessions are modified by this change.

## Outcomes & Retrospective

Implementation and verification complete. The full isolated gate passed, including
all authentication/security integration tests. Four focused production browser
journeys passed for code recovery, invitations, first-link capture with separated
paste, and account lifecycle confirmation. Both native and enhanced paths are
covered. No commit or push has been made.

## Context And Orientation

`apps/api/src/auth/delivery-auth.ts` wraps Better Auth for ordinary sign-in,
invitations and account lifecycle proofs. `apps/web/src/components/verification.tsx`
and `app/forms/[action]/route.ts` handle code entry, including pasted separators.
Tests read synthetic delivered email, including the release-image smoke helper.

## Plan Of Work

Remove the generator override, align validators and copy, update generated-code
fixtures, record the decision, and exercise the existing authentication suite.
Add focused integration evidence that resends retain the shared attempt ceiling.

## Concrete Steps

From the repository root run formatting/boundary/docs checks, then
`TMPDIR="$PWD/test-results/t" bun run verify:isolated`. Follow with an isolated
production browser run for code recovery, invitation, signup and lifecycle flows.

## Validation And Acceptance

- Generated messages contain exactly six digits; valid codes complete their
  intended flow, and malformed lengths and consumed proof remain rejected.
- Five-minute expiry, per-proof attempt limits and shared budgets still pass.
- A fresh challenge does not clear the identity verification budget.
- Web entry accepts six digits and pasted spaces/dashes with or without JavaScript.
- Required gate and focused production browser journeys pass.

## Idempotence And Recovery

No migration or external writes. Isolate builds and databases; leave the user's
3004/4004 dev stack and earlier uncommitted changes intact. Do not commit/push.

## Artifacts And Notes

Use ignored `test-results/email-code-default/` for verification logs. Installed
Better Auth's email-otp generator uses `options.otpLength ?? 6`.

## Interfaces And Dependencies

No new packages. Better Auth still owns generation, hashing, comparison and
consumption. Product validation/copy follows the pinned dependency's default;
authenticator-app TOTP and recovery codes are outside this change.

Verification update (2026-10-12): `test-results/email-code-default/verify-final.log`
records the complete isolated gate passing, including API typecheck/unit/e2e,
41 web tests, production build and web typecheck. All selected authentication journeys passed in `test-results/about-fit/browser.log`.
That combined run had one unrelated About URL assertion failure, corrected for a
focused rerun. No commit or push.
