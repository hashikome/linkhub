# Deliver codes-only authentication locally

> Historical milestone. The email-change workflow recorded here is retired under [ADR-0041](../../engineering-decisions/0041-fixed-account-email.md). Current authentication guidance is in [auth delivery](../../design-docs/auth-delivery-integration.md).

## Purpose / Big Picture

The user chose adoption gate #3 next, ahead of the unfinished web scaffold.
Prove the pinned better-auth integration before enabling code delivery, and
close the existing profile credential/deletion bypasses. Local API and delivery
tests can run without web screens; visual browser acceptance remains separate.

## Progress

- [x] (2026-10-06) Workflow separation verified: workflow YAML and release
  dependency gates checked; `bun run verify` passed all 109 tests with local
  service access, plus build, typechecks, lint and repository checks. No Docker
  image build or hosted workflow was run. Changes await review and commit.

- [x] (2026-10-06) User separated routine application verification from
  deployment image acceptance and selected W3 next. Auth delivery and review
  fixes are committed as `ce1c35b`, with guide follow-up `ae63939`; both pushed
  after the 109-test gate. Close this local milestone and transfer fresh image
  acceptance to the deployment runbook/debt tracker. No new image pass is claimed.

- [x] (2026-10-06) Final review reported no actionable defects; user requested
  committing the reviewed changes. The source gate passes 109 tests. This
  plan was kept active for fresh-image verification at that stopping point;
  the subsequent user sequencing decision above transfers that check to deployment.

- [x] (2026-10-06) Reproduced the production-only native OTP throttle in a fresh
  production process: distinct-address issuance returned 429 instead of 200.
  Disabled the duplicate native limiter in the auth composition root.
- [x] (2026-10-06) Production HTTP regression passes distinct-address issuance,
  resends, real code sign-in, issue/verify identity ceilings and the source
  ceiling despite spoofed forwarding. All ten wrapper tests and the full gate
  pass (109 tests), including build, typechecks and repository checks.

- [x] (2026-10-05) Reproduced P1 handover-proof identifier collisions: a code
  from the other workflow returned 200 instead of 400. Namespaced both library
  proof storage and outbox keys by account/session/address tuple; restart
  invalidates prior proofs and pending mail. Nine isolated wrapper tests pass,
  including collision, restart/attempt-limit and legacy-proof regressions.
- [x] (2026-10-05) Full verification passed 108 tests, including isolated
  database lifecycle checks, build, typechecks, privacy/boundary/doc checks.
- [x] (2026-10-06) Transferred the unfinished fresh-image rehearsal to
  deployment preparation by user direction (not a passing image check).
  Normal and host-network Docker builds had stalled in
  `bun install --frozen-lockfile` after partial dependency resolution; owned
  builds were cancelled. Previous image evidence does not cover the latest
  fixes. Retry and pass before deployment; track in
  [release preparation](../../runbooks/release.md) and the
  [debt tracker](../tech-debt-tracker.md).

- [x] (2026-10-05) Patched both delivery review findings with a stable suppression
  secret and signed outbox-reference webhook reconciliation after code expiry.
  Added regression coverage for rotation, lost receipts, early webhooks, replay,
  outcome ordering and conflicting references. Full verification passes 105
  tests, and both Swarm stack files validate with synthetic settings.
- [x] (2026-10-05) Rebuilt API/worker image rehearsal passed secret-file boot,
  queued capture delivery, cleanup, backup/restore, dependency outages and
  bounded shutdown. Archived this plan again; changes remain uncommitted.

- [x] (2026-10-05) Review found password access surviving handover and no
  enrollment after the library removes unproven password credentials. User
  explicitly chose to remove all password authentication instead of adding
  enrollment or backward compatibility; nothing has been deployed.
- [x] (2026-10-05) Disabled password auth and public routes, removed password
  hashing/rotation configuration, and moved fixtures/image rehearsal to real
  email-code authentication. Added dormant-password handover regression and
  verified code signup creates verified users without password credentials.
- [x] (2026-10-05) After review corrections, all 101 tests and the rebuilt
  image rehearsal pass. Product, SSO direction, web design, setup examples and
  API contracts now describe email-code-only authentication. No deployment,
  live email or compatibility migration was performed.

- [x] (2026-10-05) User confirmed auth delivery, not web scaffolding, is next.
- [x] (2026-10-05) Inspected better-auth 1.6.23, existing profile writes,
  shared contracts, verification schema and delivery/retention requirements.
- [x] (2026-10-05) Ran seven pinned real-database spike cases: keyed storage,
  resend, expiry/replay, concurrent instances, attempt budget, onboarding,
  native magic-link composition, email-change/session and callback failures.
- [x] (2026-10-05) Removed product email/password writes and account deletion;
  native password changes require proof and mandatory old-session rotation.
- [x] (2026-10-05) Recorded native incompatibilities and a concrete proposed
  integration in `docs/design-docs/auth-delivery-integration.md`.
- [x] (2026-10-05) Full verification passed: 87 tests (1 tooling, 4 email,
  20 unit, 62 e2e), plus disposable-database lifecycle checks; docs/changelog
  and walkthrough updated. Changes remain uncommitted for review.
- [x] (2026-10-05) User approved codes-only sign-in and both email-change
  steps, password fallback retained, optional TOTP/recovery codes deferred.
- [x] (2026-10-05) Implemented transaction-scoped auth, purpose/session/target-bound handover,
  durable encrypted outbox, isolated BullMQ worker, capture/Resend providers,
  signed webhooks, budgets, audit and retention.
- [x] (2026-10-05) Proved separate-process consumption, worker-process death,
  Redis loss/recovery, signed webhook replay, delivery failures and privacy;
  reconciled product/client/runbook contracts.
- [x] (2026-10-05) Final full gate passed with 101 tests. Image rehearsal
  passed compiled queued capture delivery, cleanup,
  backup/restore, outage behavior and API/worker shutdown. Schema parity reports
  no difference.
- [x] (2026-10-05) Prepared the completed verified milestone for user review.
  Changes are deliberately uncommitted pending that review.

## Surprises & Discoveries

- better-auth 1.6.23 joins current and target addresses with `-` in new-mailbox
  proof identifiers. Distinct valid address pairs can alias despite the wrapper's
  session and phase checks; outbox-only namespacing cannot protect consumption.

- Delivery review reproduced auth-secret rotation bypassing recipient suppression
  and expired challenges losing correlation after provider success/receipt-write
  failure. Suppression and provider receipt metadata must outlive credentials.

- Rejected raw auth routes must drain the bounded request body before responding.
  Returning early left an unread stream and consistently timed out HTTP server
  shutdown in the identity suite; moving the allowlist check after bounded body
  consumption restored clean shutdown without increasing timeouts.
- BullMQ awaits initial Redis readiness before resolving its client. The relay
  must skip publication until ready while continuing PostgreSQL maintenance;
  otherwise a startup outage can stall credential cleanup indefinitely.

- The installed OTP plugin uses atomic verification consumption, but its
  native current-email check consumes an ordinary email-verification OTP.
  Its final email-change route sets a refreshed session cookie rather than
  revoking all sessions. Runtime evidence is required before adoption.
- The app's Verification identifier is indexed, not unique. Resend and
  concurrent verification must be tested against this actual schema.
- Runtime proof confirms two native email-change sessions survive completion,
  ordinary email-verification proof authorizes an arbitrary requested target,
  and throwing delivery callbacks still report HTTP 200 with no message.
- Combining the stock magic-link and OTP plugins creates separate challenges;
  GET creates the link session and the numeric code remains usable afterward.
- By user request, copied only Resend provider/key/sender settings from the
  reference repo to ignored `apps/api/.env` with mode 0600. No values were
  printed; Docker excludes the file. No webhook secret existed in the source.

## Decision Log

- Decision: Close the reviewed local auth-delivery milestone and start W3.
  Retain compilation and real-service tests in routine verification; move
  Docker builds/rehearsals to the manually dispatched release workflow before
  publication. Preserve fresh image acceptance as deployment debt.
  Rationale: Local PostgreSQL/Redis containers and host application processes
  support product development without release images, as in Pigfarm. Earlier
  image checks remain historical evidence, not proof of the latest fixes.
  Date/Author: 2026-10-06 / User, recorded by Codex

- Decision: Explicitly disable better-auth's native HTTP rate limiter in every
  environment. Keep the shared PostgreSQL source and identity budgets and native
  per-proof wrong-attempt cap. Production regression uses a fresh child process
  and `configureApp`, because the vendor captures environment flags at import.
  Rationale: The vendor's production-only in-memory OTP limit silently reduces
  the documented budgets and is unsuitable as another cross-replica authority.
  Date/Author: 2026-10-06 / Codex

- Decision: Bind the fully initialized request-local better-auth internal adapter
  to separate current/new proof names derived from a JSON account/session/address
  tuple. Delegate proof operations rather than replacing their implementation.
  Use identical names in outbox challenge keys, clear both old proof names on
  restart, and never fall back to ambiguous native names. No schema change or
  proof migration; any pre-fix in-progress handover restarts.
  Rationale: Outbox-only changes cannot protect native proof consumption;
  explicit restart invalidation prevents reusing an earlier tuple's proof.
  Date/Author: 2026-10-05 / Codex

- Decision: Use a dedicated stable suppression HMAC secret, separate from auth
  encryption/proof secrets, and include an opaque delivery-only UUID tag in
  Resend requests. Signed webhooks reconcile receipts within retained metadata
  even after payload expiry; they never need to retain or resend expired codes.
  Production configuration requires the new secret through the existing `_FILE`
  contract. No deployed data migration is required for this unreleased feature.
  Date/Author: 2026-10-05 / Codex

- Decision: Supersede the earlier password-fallback decision. Email codes are
  the only implemented sign-up/sign-in method. No password enrollment, reset,
  migration or compatibility path; keep better-auth takeover protection intact.
  Optional TOTP/recovery codes remain a later milestone.
  Date/Author: 2026-10-05 / User

- Decision: Email codes replace direct authentication links for sign-in and
  both email-change steps. Keep password sign-in as an alternative. Optional
  TOTP and recovery codes follow in a separate milestone; collection invitations
  remain sharing work. User approved completing auth delivery locally first.
  Date/Author: 2026-10-05 / User
- Decision: Scope better-auth's Prisma adapter and onboarding hook to one
  database transaction per mutating auth request. Initially serialize auth
  mutations with a transaction advisory lock; reads remain concurrent. This
  bounds cross-process proof races and session creation during handover without
  creating another credential store. Persist encrypted delivery inputs in that
  transaction, and fail/roll back if the native callback swallowed persistence
  errors. BullMQ carries only opaque IDs; PostgreSQL owns claims and retries.
  Date/Author: 2026-10-05 / Codex

- Decision: Keep the existing individual-hub and collection-sharing model.
  The user clarified that the reference to shared spaces did not propose
  shared hubs or memberships. Invitations concern collection access and remain
  separate from authentication; an invitation URL need not sign anyone in.
  Rationale: Sharing follows the existing Google-Drive-style access model.
  Codes-only and MFA sequencing were resolved by the subsequent decision above.
  Date/Author: 2026-10-05 / User clarification, recorded by Codex

- Decision: Start with the mandated pinned integration spike and the existing
  credential bypasses, before outbox implementation.
  Rationale: Delivery cannot make an incompatible proof lifecycle correct;
  gate #3 explicitly requires proof before enabling codes or changing product
  behavior. All experiments use disposable databases and synthetic recipients.
  Date/Author: 2026-10-05 / Codex

## Outcomes & Retrospective

The local milestone is complete and committed. W3 starts next by the user's
2026-10-06 sequencing decision. The following review outcomes retain their
original evidence; the fresh image check they mention now belongs to deployment
preparation and does not keep this plan active. Source verification remains
required for every milestone; image publication remains gated by a rehearsal.

Production throttle review correction: the native HTTP limiter is deliberately
disabled; shared source/identity budgets and native per-proof attempts remain
enforced. A fresh production process reproduced the fourth-request rejection
before the fix and now proves the documented limits through `configureApp`.
The full verification gate passes 109 tests. The earlier fresh-image check
remains outstanding; this correction did not retry the stalled dependency build.

Handover review correction: colliding native identifiers cannot cross account
or workflow boundaries. Both proof phases and outbox keys share a structured
namespace; old proofs and pending mail are invalidated on restart. Three new
regressions pass and the full gate passes 108 tests. Source API build and
typechecks pass. Fresh compiled-image acceptance remains blocked by the stalled
dependency install in both Docker build attempts; no build is left running.
The patch is ready for code review, with the image check explicitly outstanding.

Delivery review correction: suppression keys now survive auth-secret rotation.
Signed provider tags reconcile receipts and establish suppression after credential
expiry without retaining or resending expired codes. The production contract
requires a separate stable suppression secret. Full verification passes 105
tests; rebuilt image rehearsal also passes. No live email was sent.

Review correction: password authentication is now disabled and unavailable over
HTTP. Both review findings are resolved by the approved feature removal, not
password enrollment or migration. Regression tests prove that a dormant
credential cannot regain access after handover, while the recipient signs in by
code to the same immutable account. All domain fixtures now use production
code issuance and verification rather than password signup. Optional first-signup
display names remain supported through the library's code verification endpoint.


The backend implementation is complete locally. Codes-only sign-in, bound
email change, encrypted durable email, worker retries/claims/cleanup, Resend and
capture providers, signed webhooks, shared budgets and auth audit are wired.
Latest full verification passed with 109 tests. The earlier image-worker rehearsal
and fresh-database schema parity passed; fresh image acceptance for the handover
namespace patch remains outstanding as described above. Web account
screens, real sender/domain validation and webhook secret provisioning are
separate acceptance work. No live message was sent. The reviewed source is
committed; fresh image acceptance is deferred to deployment preparation.

## Context And Orientation

`apps/api/src/auth/auth.ts` composes `delivery-auth.ts` and mounts through
`configureApp` before parsers. The wrapper gives `create-auth.ts` a transaction
client and callback; `resolveSessionUser` remains the domain seam. User services
can no longer mutate credentials or delete accounts. `apps/api/src/email`
contains config, encrypted outbox, provider adapter, relay/worker and webhook
verification. `packages/email` contains three codes-only templates. The additive
`20261005173120_auth_delivery` migration adds workflow, delivery, webhook,
suppression and auth-audit tables. `bun.lock` pins better-auth 1.6.23.

## Plan Of Work

Keep the original pinned native spike as negative compatibility evidence.
Implement the approved codes-only flow around library-owned proofs and
transaction-scoped persistence. Prove separate-process consumption, exact
workflow binding, issuance and handover rollback, provider failure and duplicate
handling, actual worker death, Redis disconnection, signed webhook replay and
privacy. Reconcile product/design/client/runbook contracts and include the
worker in the same immutable API image. Keep account deletion unavailable
until verified ownership/retention rules exist.

## Concrete Steps

From the repository root run `bun run check`, `bun run verify`, and
`git diff --check` for routine application verification. During deployment
preparation, separately build with
`docker build -f apps/api/Dockerfile -t nslinkhub-auth-local .` and run
`bun run verify:release-image -- nslinkhub-auth-local`. The image rehearsal
uses disposable containers, synthetic secrets/recipients and capture delivery;
it verifies worker runtime imports, queued delivery and shutdown too.

## Validation And Acceptance

- OTPs and links are synthetic, never sent externally or printed to logs.
- All findings have reproducible source/runtime evidence on 1.6.23.
- Profile updates cannot mutate auth credentials; rejected changes leave
  credentials, sessions, hub data and audit intact.
- Account deletion cannot bypass proof or an undecided retention policy.
- No undocumented credential system or silent product-flow substitution.
- Full verification passes; any blocked delivery acceptance remains explicit.

## Idempotence And Recovery

No development database reset, production email or live infrastructure. The
runner owns and drops only its generated database and each queue test removes
its random namespace. The migration was generated using `migrate dev
--create-only` against a disposable database and reviewed as additive; existing
SQL-only functions, triggers and indexes remain untouched. Production migration
application is an explicit release step before API/worker startup. Database
claims recover after expiry; provider retries preserve immutable payload/key;
expired and terminal intents erase credential-bearing payloads.

## Artifacts And Notes

Workflow-separation verification: `/tmp/workflow-separation-verify-local.log`
(109 passing tests). The sandbox-only attempt failed to open a local listener;
the rerun with local service access passed.

Baseline: reviewed W3 design `6d27cbe`, guide-pin commit `a8802c5`. Durable
contract: `docs/design-docs/auth-delivery-integration.md`. Tests include the
seven native spike cases plus production-wrapper and worker integration suites.
Delivery correction logs: `/tmp/email-lifecycle-verify.log`,
`/tmp/email-lifecycle-image-build.log`, `/tmp/email-lifecycle-image-verify.log`.
Handover collision logs: `/tmp/handover-collision-before.log` (reproduces 200
instead of 400), `/tmp/handover-collision-after.log` (nine passing wrapper tests),
and `/tmp/handover-collision-verify.log` (108 passing tests).
Image build attempts: `/tmp/handover-collision-image-build.log` and
`/tmp/handover-collision-image-build-host.log` (cancelled dependency installs).
Production throttle correction: `/tmp/auth-budget-before.log` (reproduces 429
instead of 200), `/tmp/auth-budget-after.log` (ten passing wrapper tests), and
`/tmp/auth-budget-verify.log` (109 passing tests).

Earlier disposable local logs: `/tmp/password-removal-verify.log`, `/tmp/password-removal-image-build.log`,
`/tmp/password-removal-image-verify.log`. No live email was sent. The guide's pin remains
`ce1c35b`, updated in the separate guide-only commit `ae63939`. Sweep and
repin again after the workflow-separation change is reviewed and committed.

## Interfaces And Dependencies

better-auth 1.6.23, Prisma 7.8/PostgreSQL 18, Bun, existing DTO/error contracts,
app-owned onboarding, `_FILE` secrets, shared server configuration and isolated
queue namespaces. No TOTP, recovery-code, shared-hub or invitation implementation
is included in this milestone.
