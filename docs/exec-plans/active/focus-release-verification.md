# Focus automatic release verification

This plan follows `PLANS.md`. Updated 12 October 2026.

## Purpose and context

Keep iteration quick while retaining checks for the user journeys whose failure
would make a release unusable. Owner selected code/integration verification,
critical browser journeys on release, and a manually dispatched full browser suite.
The current production rollout continues unchanged while this follow-up is prepared.

## Progress

- [x] Record ADR-0062, partially superseding ADR-0011's browser frequency.
- [x] Tag four existing self-contained critical journeys and add a focused command.
- [x] Switch reusable CI to that command; add a manual full-browser workflow.
- [x] Focused isolated browser acceptance: four passed, 127 assertions, 28.51 seconds after build.
- [ ] Run normal pre-push verification.
- [ ] Review onboarding pin, publish after current rollout and verify automatic release.
- [ ] Reconcile handbook/acceptance records and remove temporary evidence.

## Decision log

Keep the pre-push `bun run verify` gate and repeat it on GitHub. Critical browser
coverage selects public reading, email/session isolation, invitation acceptance,
and first-link capture. No new product behavior, fixture shortcuts or live emails.
Full-suite execution is deliberate, not required on every push.

## Concrete steps and validation

Run `bun run verify:isolated test:browser --test-name-pattern '\[critical\]'` with
workspace-owned TMPDIR. Exactly four selected tests must pass in a fresh fixture.
Inspect both workflow triggers and required PostgreSQL/Redis services. Run normal
`git push` from an isolated committed checkout so its hook verifies the entire
source gate without altering local development output. Observe GitHub's focused
browser, image rehearsal, migration and deployment gates. Full suite already
passed for the preceding implementation; only test labels change here.

## Recovery and acceptance limits

Do not supersede the currently running main release before it finishes promotion.
A workflow failure blocks publication/deployment as before. No data or schema change.
The narrower automatic gate gives less broad UI coverage; intentional full-suite
runs remain available for risky or extensive changes.

## Outcomes and retained evidence

Pending verification and publication. GitHub runs will own publication evidence;
handbook owns reader guidance. Temporary isolated checkouts/logs are removed after
concise results are recorded. No retained user data or secrets.
