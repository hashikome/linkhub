# Prepare ntumie.link for deployment

## Purpose / Big Picture

Complete repeatable production CI/CD for **ntumie.** on the existing shared
Hashikome server: GitHub verifies and builds immutable API/worker and web images,
then Dokploy pulls them in Swarm Stack mode. A successful migration must precede
application promotion. The owner selected this infrastructure milestone separately
from public-launch capacity, recovery and complete provider/user acceptance.

## Progress

- [x] (2026-10-12) Registered `ntumie.link`; owner confirmed its proxied Cloudflare
  root record points to hs. Same-origin `/api/*` routing preserves host-only cookies.
  iCloud and Resend mail records are preserved.
- [x] (2026-10-12) Added the non-root custom web image and compiled migration/grant
  task, immutable image publication, coordinator and scoped application Stack.
- [x] (2026-10-12) Allocated shared PostgreSQL 18 runtime/migrator roles and persistent
  queue Redis ACLs. Infra production run `38268947859` passed through GitHub.
- [x] (2026-10-12) Consolidated permanent environments to local development and
  production. Neutral data aliases, private network and `ntumie-email` namespace
  are configured; existing storage identities remain unchanged.
- [x] (2026-10-12) Prepared application and migration targets with Git auto-deploy
  disabled. Exact ingress trust and versioned Swarm secret references are supplied.
- [x] (2026-10-12) Configured unattended, separate read-only 1Password CI accounts;
  selectable GitHub secrets provider remains supported. Native application
  Environment composition matches equivalent plain inputs across 19 variables.
- [x] (2026-10-12) Sender `ntumie. <no-reply@notify.ntumie.link>` accepted via one
  authorized message received at `support@ntumie.link`. `hello@ntumie.link` is for
  general enquiries. No additional real mail was sent.
- [x] (2026-10-12) Normal isolated full pre-push verification passed and source
  `3215c83` published after fixing the worker shutdown failure described below.
  Four targeted Redis regressions, API typecheck and complete image rehearsal pass.
- [x] (2026-10-12) Corrected GitHub release `38275967261` passed application/browser
  verification and the complete image rehearsal, including Redis-outage shutdown.
- [x] (2026-10-12) Image publication, exact-attempt migration and application
  promotion passed in release `38275967261`.
- [x] (2026-10-12) Independent read-only acceptance verified exact images/attempt,
  migration exit zero, API/web health, worker running and shared-data readiness.
  Health/status/home/sign-in/support returned HTTPS 200. No users or mail created.
- [x] (2026-10-12) Reconciled the release runbook, ADR, README and launch follow-ups;
  reader guidance is maintained in the handbook and workspace coordination record.

## Surprises & Discoveries

- One public origin is required; a separate API hostname would violate the
  application's host-only session-cookie contract.
- Docker Stack misread a hyphen in required-variable error text. Identifier-only
  messages and resolved-name assertions now protect the production manifests.
- Dokploy 0.30.8 omits completed tasks from its normal Stack task listing. Migration
  acceptance uses its local all-state container listing and verifies exact Swarm
  labels, command, image, run attempt, completion and exit code zero.
- Real-service integration journeys exceeded the default five-second limit at
  different steps. Their default is now 15 seconds; explicit test/performance
  limits and all required suites remain. Full verification passed afterward.
- Release `38270497833` passed verification/browser and image migration, isolation,
  rendering, capture delivery and restore checks, then failed worker shutdown after
  Redis loss. Publication/deployment were skipped. A controlled TCP fixture
  reproduced BullMQ producer disconnect waiting for an `end` event that may never
  arrive during ioredis reconnect backoff. `ProducerQueue` force-closes its owned
  connection; email and metadata regressions cover reconnecting and never-ready
  Redis. The ten-second worker deadline and clean-exit requirement remain intact.
- The image fixture could observe PostgreSQL's temporary initialization socket
  before it restarted. TCP readiness now selects the final application listener.
- A full verification snapshot exceeded `/tmp` capacity initially. Disposable
  checkouts on the workspace disk run the unchanged gate without disturbing the
  development server or its build output. No development data was reset.

## Decision Log

- Owner: one server, local development and production only. Upgrade/replacement
  changes capacity, not the environment model. Runtime names remain neutral.
- Owner: shared data infrastructure is part of this setup now. Product-specific
  roles/ACLs allocate shared services; never use Dokploy's internal data stores.
- Owner: images build on GitHub, never Dokploy/hs. Coordinated releases use main,
  immutable GHCR digests, an explicit migration barrier and raw Swarm Stacks.
- Owner: secret shape follows the consumer. Complete application environments,
  reusable API fields, separate privileged/CI credentials and native SSH keys;
  applications remain independent of 1Password and can use ordinary env files.
- Owner: product email-delivery webhook work is backlogged; existing GitHub and
  Kuma/Dokploy monitoring remain separate. No webhook secret is mounted.
- Owner: temporary same-host PR previews are desired later. They require GitHub
  builds, isolated data/queue, captured email, capacity bounds and teardown;
  Dokploy Application previews do not establish raw multi-service Stack support.

## Outcomes & Retrospective

Shared data is live and its unattended GitHub release is accepted. Product source,
local full verification, four shutdown regressions and compiled-image acceptance
are complete. Release `38275967261` deployed source `3215c83` through the migration
barrier. Independent read-only inspection accepted all three selected application
tasks, API/web health, migration exit zero, shared-data readiness and public HTTPS.
The existing eight Swarm services remained healthy. This completes production CI/CD
setup, not full public-launch acceptance.

Capacity/load, full control-plane recovery, off-host product restore, Google
production callback, complete user journeys and product monitoring acceptance are
public-launch follow-ups. They are tracked separately from this CI/CD milestone.
The current Contabo VPS S SSD has 4 CPU, 8 GiB RAM and 200 GB disk; pre-application
headroom was roughly 1 GiB; after activation it was 386 MiB, with no swap.
That idle observation does not establish load or rolling-overlap capacity.
Planning limits cover shared data plus
application services and rolling overlap, but are not measured load capacity.

## Context And Orientation

`apps/api/Dockerfile` supplies Nest, worker and the compiled Prisma migration.
`apps/web/Dockerfile` runs the custom web server required by trusted-source
attribution. `docker-stack.prod.yml` owns API/web/worker and routing;
`docker-stack.migrate.yml` owns the one-shot migration target.
`.github/workflows/release.yml` and `tooling/release.ts` coordinate release gates.
Infra owns shared data in
[deploy/data-services](https://github.com/hashikome/infra/tree/main/deploy/data-services).
ADR-0061, the deployment design and release runbook retain engineering contracts;
the handbook owns operator reading guidance.

## Plan Of Work

Completed: corrected GitHub release, exact migration/application inspection and
read-only HTTPS acceptance. The release runbook and technical debt tracker own
remaining launch gates; handbook operations owns reader guidance. This plan
retains the completed CI/CD milestone and its limits.

## Concrete Steps

Use `bun run verify:isolated` for full local verification when development is
running. Build/rehearse release images with `bun run verify:release-image` and
render synthetic Stack inputs. Publish through the normal pre-push hook.
Dispatch `release.yml` on main with `deploy=true`; inspect its recorded immutable
inputs and exact Dokploy tasks. Never run a competing local application deployment.

## Validation And Acceptance

Local rehearsal proves compiled migration/grant idempotence and wrong-role refusal,
secret-file startup, web rendering, PostgreSQL DDL/other-database refusal, Redis
key/channel/admin refusal, queued capture delivery, synthetic dump/restore,
dependency degradation and clean bounded shutdown. Runtime cannot read Prisma
migration history. These disposable Docker checks are not off-host recovery.

Live CI/CD acceptance requires successful exact-attempt migration exit zero,
selected API/web/worker images and health, shared-data readiness and HTTPS routing.
Complete authentication/Google/save/read/share journeys, alert delivery and restored
product identities/content/audit are separate launch acceptance. The one authorized
sender test is accepted; delivery webhook integration remains backlogged.

## Idempotence And Recovery

Rehearsals use uniquely named disposable resources and remove only those. Do not
initialize Swarm on the shared workstation or restore over hs. Preserve existing
DNS/mail, development data and unrelated services. Production rollout uses the
separate migration barrier; SQL rollback is never automatic. Review old-binary/new-
schema compatibility before selecting an earlier image pair.

## Artifacts And Notes

Shared-data release:
[38268947859](https://github.com/hashikome/infra/actions/runs/38268947859).
Initial blocked product release:
[38270497833](https://github.com/hashikome/ntumie/actions/runs/38270497833).
Corrected release:
[38275967261](https://github.com/hashikome/ntumie/actions/runs/38275967261).
Handbook Access-only cleanup and guidance passed release
[38272297060](https://github.com/hashikome/handbook/actions/runs/38272297060).

Release attempt `38275967261-1` selected API/worker digest
`sha256:dd38329cb4458f7a0022b10683ebf1c73136926c0b873e7a01e0b0fdd73385bd`
and web digest
`sha256:941ed226022bed707af312569bfaa4c861ae5a194acc01afcb4a94a1366e0155`.
Both tags use full source SHA `3215c83fbef20586255975ca820134694b7fbc63`.

Temporary publication/rehearsal logs, bootstrap metadata and local test images are
owned by the release task until the final owning documentation is published. The
controlled shutdown probe and its Redis fixture were removed after promoting the
regression tests. Never use local test images as production release inputs.
Private credentials remain outside source; old bootstrap scripts are superseded
and must not reset active replica counts or environment names.

## Interfaces And Dependencies

Bun 1.3.14; Next custom server; Nest/Prisma7/PostgreSQL18; BullMQ/Redis7;
Dokploy0.30.8; existing Traefik; Cloudflare; Google OAuth and Resend. Shared
services require scoped roles/ACLs, persistent queue policy and independent recovery.
