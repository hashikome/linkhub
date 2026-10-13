# Finish production delivery and footer alignment

This ExecPlan follows `PLANS.md`. Updated 12 October 2026.

## Purpose / Big Picture

After the owner pushes main, GitHub verifies, builds immutable images and deploys
through Dokploy. Temporarily disable the unconfigured Google provider in production.
Keep About ntumie. on the left and the supporting footer tagline on the right,
including wrapped phone layouts. Home and About retain their existing special copy.

## Progress

- [x] Server cleanup: borrowed MySQL/DHIS2 containers stopped, retained for restart;
  obsolete tasks, unused images and an empty abandoned volume removed (infra record).
- [x] Prepared undeployed neutral Dokploy targets; existing production is unchanged.
- [x] Implement named-service cutover, push-triggered release, Google switch and footer fix.
- [x] Verify isolated application/browser checks and inspect four viewport sizes.
- [x] Record results and leave source publication/deployment to the owner.

## Surprises & Discoveries

Dokploy 0.30.8 ignores appName updates and appends a random suffix on resource
creation. Replacement targets retain all credentials and external data identities.
Default Stack deployment uses --prune, so the separate migration stack remains
necessary for the established migration-before-application gate. Desktop footer
placement already matches the request; wrapping can place the tagline on the left.

## Decision Log

- Use product stack base `ntumie`, service roles `api`, `web`, `worker`; use
  `ntumie-release` / `migration` for the separately gated one-shot job. No product
  name is repeated in service keys. Infra owns its independent shared data cutover.
- Normal main pushes deploy after all existing gates; manual dispatch remains for
  artifact rehearsal or an explicit retry. Dokploy Git autoDeploy stays disabled.
- An explicit backend Google switch disables registration and discovery; retained
  credentials alone do not enable the production provider. No password-manager SDK.
- Owner performs the push and any needed dispatch; no source is published here.

## Context And Orientation

`tooling/release.ts` coordinates two raw Dokploy Stacks and checks exact image,
release attempt and migration completion. `docker-stack.prod.yml` owns API/web/worker;
`docker-stack.migrate.yml` owns the privileged migration task. `security-config.ts`
selects backend Google credentials; web provider discovery already follows the API.
`site-footer.tsx` owns page-specific labels; `globals.css` owns layout.

## Plan Of Work

Complete safe live cleanup before source changes. Preserve running legacy stacks
until the owner triggers verified GitHub promotion; stop the old app only after
migration passes. Keep stopped legacy Stack definitions as explicit rollback evidence
until independent live acceptance. Verify the new workflow and failure gates,
provider behavior and actual page rendering. Update release guidance and changelog.

## Concrete Steps

Run `bun run verify:isolated` and `bun run verify:isolated test:browser` from this
repository. Use disposable databases and captured mail. Inspect home, About and
sign-in at 390, 768, 1280 and 1440 pixels, including keyboard focus and JS-off links.

## Validation And Acceptance

Migration failure never stops or mutates the serving app. Replacement cannot share
routes/workers with the legacy app. Main push runs all verification before deploy;
PRs never deploy. Disabled Google is absent from discovery and UI. Footer links
remain left; tagline stays right on wrapped layouts. Source verification, owner
publication and live acceptance are recorded separately.

## Idempotence And Recovery

No credentials or data volumes are removed. Failed promotion requires inspection;
never automatically roll schemas back. Existing Stack definitions and immutable images remain until live acceptance,
then the infra owner retires them. The superseded native PostgreSQL definition is
removed after replacement health to release its old DNS endpoint; the data volume
and identical replacement configuration remain. No direct server
application builds or local release bypass.

## Outcomes & Retrospective

Local implementation and handoff complete. Full isolated `verify` passed; the
complete browser suite passed 106 tests with one optional performance measurement
skipped (2,249 assertions). The final focused layout check additionally passed at
320/390/768/1280/1440px in both JS modes (120 assertions). Screenshots were visually
inspected at all four standard widths, with narrow wrapping and hover/focus/pressed
states. Focused release/config checks passed 14 tests; infra's rendering, stateful
admission and cutover tests passed. Handbook source/strict build/generated-site
checks passed (49 pages). No real mail or provider callback was sent.

The limited UI review scored 33/40 on Nielsen's ten heuristics; layout and provider
availability issues are addressed, with broader error/recovery journeys outside the
screenshot review. Existing quiet typography/canvas and page-specific footer labels
remain. Evidence is retained in ignored `ref/footer-review/review.md` until review.

Source publication and live cutover acceptance are pending the owner's push.
Push infra and wait for shared-service readiness before pushing ntumie, then handbook.
The server cleanup is accepted separately from these prepared release changes.
After live acceptance, retire the old stopped Stack definitions without volumes and
remove their previous-target references. Native PG retirement is part of its
coordinator because a stopped old Swarm service retains a DNS endpoint.

## Artifacts And Notes

Infra owns `docs/server-adoption.md` and its production data profile. Temporary UI
screenshots are product-owned review evidence under ignored `ref/`; remove after
owner review and live acceptance. `workspace/handoff.md` records cross-repo status.

## Interfaces And Dependencies

GitHub main, GHCR, Dokploy 0.30.8, existing external Swarm secrets/data network and
shared PostgreSQL/Redis. The app continues to accept normal env and `_FILE` inputs.

## Publication and live acceptance — 12 October 2026

The owner subsequently authorized the agent to push in order. Infra `4c3dc17`
([run 38297513031](https://github.com/hashikome/infra/actions/runs/38297513031))
passed before ntumie `6cb03c1`
([run 38298443767](https://github.com/hashikome/ntumie/actions/runs/38298443767)).
Handbook `15a56c1` / run `38301835146` also passed. The later focused-CI release
`6fb4cd3` / run `38301467702` is the current production revision; its acceptance
is recorded in [the completed verification plan](focus-release-verification.md).

Independent public checks confirmed ready PostgreSQL/Redis, disabled Google
sign-in, and the requested footer labels/alignment at 320/390/1280px. Borrowed
MySQL/DHIS2 containers remain stopped with their data preserved. Legacy app/queue
Stack definitions remain referenced by the coordinators; remove those references
safely before retiring the records. Physical data volumes retain their old names.

The existing API did not regain database readiness after the PostgreSQL endpoint
replacement, although DNS/TCP and a fresh authenticated database client worked.
The normal application release restored readiness; the published debt tracker
owns connection-recovery follow-up before future maintenance/public launch.

Initial administrator email was configured with owner authorization. One pending
invitation was sent once across both releases; the owner found it in Junk.
On 13 October the owner confirmed the invitation flow completed successfully
(user acceptance; no subsequent database check).
These final acceptance notes are local until the next source publication.
