# Focus automatic release verification

This plan follows `PLANS.md`. Updated 12 October 2026.

## Purpose and context

Keep iteration quick while retaining checks for the user journeys whose failure
would make a release unusable. Owner selected code/integration verification,
critical browser journeys on release, and a manually dispatched full browser suite.
Implementation, publication and production acceptance completed on 12 October 2026.

## Progress

- [x] Record ADR-0062, partially superseding ADR-0011's browser frequency.
- [x] Tag four existing self-contained critical journeys and add a focused command.
- [x] Switch reusable CI to that command; add a manual full-browser workflow.
- [x] Focused isolated browser acceptance: four passed, 127 assertions, 28.51 seconds after build.
- [x] Normal pre-push verification passed in an isolated checkout.
- [x] Reviewed onboarding pin; published `6fb4cd3` after the first rollout; automatic release passed.
- [x] Handbook published; final acceptance recorded and temporary verification evidence retired.

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

Implementation `96f3d00` and reviewed onboarding `6fb4cd3` are published. The normal
pre-push `bun run verify` passed; [release 38301467702](https://github.com/hashikome/ntumie/actions/runs/38301467702)
passed verification, four critical browser journeys, immutable image publication,
migration and deployment. The browser step, including the production web build,
took 59 seconds. The manual full-suite workflow is registered; the preceding full
suite passed 106 tests with one optional measurement skipped.

Independent live acceptance passed home, About and sign-in at 320/390/1280px,
Google-disabled discovery/UI, PostgreSQL/Redis readiness and exact deployed image
references. Bootstrap remained one invitation and one send across the two releases;
the recipient confirmed receipt in Junk, then confirmed successful completion of
the invitation flow on 13 October (user acceptance; no subsequent database check).

Handbook commit `15a56c1` / [release 38301835146](https://github.com/hashikome/handbook/actions/runs/38301835146)
published the reader guidance and passed protected-site/revision checks. Temporary
isolated checkouts, logs, downloaded artifacts and acceptance helpers are retired.
These final acceptance notes are local until the next source publication.
