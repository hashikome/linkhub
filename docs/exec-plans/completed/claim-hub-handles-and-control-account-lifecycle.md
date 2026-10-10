# Claim hub handles and control the account lifecycle

## Purpose / Big Picture

A generated hub handle is provisional. People explicitly claim a permanent hub
handle. All issued handles remain reserved after renames or deletion. Usernames
remain freely editable under their existing validation and uniqueness rules. Settings separates reversible account
deactivation from permanent deletion after the existing 14-day grace period.
Email codes confirm account actions; self-service recovery cannot lift moderation.

## Progress

- [x] (2026-10-10) Inspect identity, auth delivery and operator lifecycle boundaries.
- [x] (2026-10-10) Persist hub handle claims and self-service recovery eligibility; review migration.
- [x] (2026-10-10) Enforce claims, purpose-bound account confirmations and recovery in the backend.
- [x] (2026-10-10) Deliver native Settings/account flows and specific confirmation copy.
- [x] (2026-10-10) Cover isolation, replay, moderation, access restoration and handle permanence.
- [x] (2026-10-10) Run verification and browser checks; document results and update handoff.

## Surprises & Discoveries

Operators already deactivate and schedule deletion; availability queries hide
inactive owners' content. Reuse these boundaries instead of a second deleted flag.
The existing local username column has pre-existing width drift; avoid resets.

## Decision Log

- 2026-10-10: Web confirmation includes the sealed flow's nonce and action, so
  a newer flow in another tab cannot change the action an older form confirms.

- 2026-10-10: Existing development hubs receive an unclaimed handle state;
  no trustworthy historical claim flag exists. Generated hub handles remain unclaimed.
- 2026-10-10: Usernames stay mutable with lowercase/hyphen-insensitive uniqueness (ADR-0026).
  Claimed hub handles cannot change through profile PATCH; hub display names can.
- 2026-10-10: Account actions use better-auth OTPs bound to action, account,
  operations version and (for active-account actions) initiating session. Recovery
  creates no usable session; sign in afresh after reactivation.
- 2026-10-10: Self-deactivation retains data indefinitely. Deletion retains the
  accepted 14-day grace period. Cancellation leaves an inactive account; explicit
  reactivation follows. Operator actions revoke self-recovery eligibility.
- 2026-10-10: Exceptional handle recovery is an audited deployment procedure,
  not a self-service reset or an operator private-content bypass.

## Outcomes & Retrospective

Implemented and locally migrated. Usernames remain freely editable; explicit hub
claims and retained reservations prevent handle recycling. Account actions are
purpose-bound and reversible deactivation is separate from scheduled deletion.
Whole-diff review and commits remain the next session's first step.

## Context And Orientation

User persistence is in apps/api/prisma/schema.prisma. Profile changes are handled
by modules/users; auth/delivery-auth.ts composes better-auth OTP verification and
transactional email. operations/account-deletion.ts owns final cleanup; account
availability is enforced by modules/hubs/availability.ts and collection policy.
Web Settings uses ProfileEditor; native form routing is app/forms/[action]/route.ts.

## Plan Of Work

Add claim and self-recovery fields. Enforce claim confirmation under the existing
authority transaction. Extend app-owned auth delivery with purpose-bound account
codes, sharing the lock and revocation helper. Add Settings confirmation and a
native account page for send/verify/recovery. Test through production HTTP.

## Concrete Steps

Generate migration with `bunx prisma migrate dev --create-only` against a disposable
migrated database, inspect SQL, generate the client. Run `bun run verify` in an
isolated source mirror and focused `bun run test:browser` checks.

## Validation And Acceptance

Generated hub handles allow one explicit claim; subsequent handle changes fail;
username and display-name changes succeed. Retired handles cannot be reclaimed. Concurrent claims cannot overwrite the winner.
Ordinary sign-in/invitation codes cannot confirm account actions. Wrong codes,
replays, expired sessions and operator interventions cannot restore access.
Deactivation hides owned content and revokes sessions; recovery restores content
but never old sessions/grants. Deletion cancellation stops the cleanup deadline.
Native forms work with accessible confirmation, error and recovery states.

## Idempotence And Recovery

Preserve all uncommitted work and user data. No production or development account
is deactivated/deleted for tests. Use disposable databases. No commits before the
requested whole-diff review rounds.

## Artifacts And Notes

Migration generated against a disposable database and reviewed: two added fields,
reservation table/backfill, and trigger; no drops or changes to prior constraints.
Account lifecycle regressions pass through production auth delivery.
UI register: quiet; existing Schibsted Grotesk, canvas and semantic tokens.
Refactoring UI hierarchy/semantics guidance keeps entry actions secondary and
reserves destructive emphasis for final deletion confirmation. Visual QA completed at 390/768/1280/1440 for handle claiming and deactivation.
The initial pass found checkbox text crowding, an unnecessarily full-width claim
button and a tight back-link/title gap; all three were corrected and screenshots
re-rendered/inspected. Scoped score: hierarchy 8/10, legibility 9/10, interaction
clarity 9/10, responsive fit 8/10. Existing Settings layout remains intact.

- `bun run verify`: passed in isolated copy; `/tmp/account-verify.log`.
- Focused production browser journeys: 4 passed, 85 assertions (Settings errors,
  native/JS authoring, stable UUID links, account recovery).
- Final browser check after adding per-form confirmation binding: 2 passed,
  30 assertions, including two-tab action replacement; `/tmp/account-browser-final.log`.
  Its production build/typechecking passed. Captures: `/tmp/handle-claim-*.png`
  and `/tmp/account-deactivate-*.png`.
- Migration applied locally with no reset; `/tmp/account-local-migration.log`.
  No real account was disabled/deleted. Earlier unrelated username width drift
  remains recorded for next-session review.

## Interfaces And Dependencies

Prisma remains backend-private. Profile exposes claim state; account commands use
app-owned HTTP routes and better-auth proof primitives, no bespoke OTP generator.
