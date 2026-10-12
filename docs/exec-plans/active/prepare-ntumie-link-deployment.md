# Prepare ntumie.link for deployment

## Purpose / Big Picture

Complete repeatable production CI/CD for the registered `ntumie.link` domain and
the reviewed ntumie. application using
GitHub-built immutable API/worker and web images on Hashikome Dokploy. The owner clarified the milestone on 12 October: extend the shared infrastructure
and deployed handbook path to ntumie., prove its production deployment, and leave
production-readiness follow-ups separately recorded. Product-email webhooks are
backlogged; they do not block this CI/CD milestone.

## Progress

- [x] (2026-10-12) Owner confirmed purchase and Cloudflare DNS; public NS records
  resolve to Cloudflare and existing MX records point to iCloud. Preserve mail DNS.
- [x] (2026-10-12) Rename committed through `e703e9e`; GitHub Verify passed and the
  product checkout was clean before this deployment milestone.
- [x] (2026-10-12) Confirmed one public origin is required by host-only session cookies:
  `https://ntumie.link/api/*` goes directly to Nest; remaining paths go to Next.
- [x] (2026-10-12) Built API/worker and custom web images; three consecutive combined
  rehearsals passed after updating the synthetic fixture for current signup/hub APIs.
- [x] (2026-10-12) Prepared product/migration Stack inputs and CI API/web image
  publication with digest artifacts; replicas default to zero. Initial source was published; final configuration corrections and application
  image promotion remain part of this milestone.
- [x] (2026-10-12) Reconciled shared data and Kuma/Dokploy monitoring contracts;
  infra owns concrete allocation SQL, queue Stack and combined capacity budget.
- [x] (2026-10-12) Owner selected keeping `hs` and assessing an upgrade; shared data
  services must be part of the setup immediately.
- [ ] Assess capacity upgrade and independent recovery before production launch;
  owner clarified this is production setup on the existing Contabo host.
- [ ] Finish production target allocation, secret references and provider inputs.
- [x] (2026-10-12) Owner created `support@ntumie.link` for user support;
  `hello@ntumie.link` also exists, for general enquiries. Support inbox receipt
  was owner-confirmed. The send-only credential is intentional.
- [x] (2026-10-12) Owner added `notify.ntumie.link` in Resend. Public DKIM and
  return-path DNS are present; iCloud MX remains intact. Resend accepted the one
  authorized support-mailbox test (HTTP 200); owner confirmed inbox receipt.
- [x] (2026-10-12) Compiled migration/grant task passed repeat execution and wrong-role
  refusal in the image rehearsal. Local coordinator tests refuse stale/failed/timed-out
  migration completion before application mutation; opt-in production CI job added.
- [x] (2026-10-12) Full isolated product gate passed; final focused coordinator and
  Stack tests passed after optional-webhook and worker-egress adjustments.
- [ ] Complete real Dokploy/Swarm execution through GitHub.
- [x] (2026-10-12) Prepared shared production PostgreSQL/Redis and separate idle
  application/migration targets. New credentials passed 1Password byte comparisons.
- [ ] Configure GitHub environments, publish source and deploy through verified CI.
- [ ] Review/publish source, prove isolated Swarm and off-host restore, then verify live launch.

## Surprises & Discoveries

- Existing production Stack has only API/worker; no web Dockerfile exists.
- Production shares one origin, despite the initial proposed API subdomain. The
  config validator rejects different hostnames because cookies are host-only.
- `hs` has 7,941 MiB RAM, 1,129 MiB available and no swap at inspection. Unrelated
  DHIS2/PostgreSQL/MySQL workloads remain untouched. Do not assume capacity for a
  web/API/worker, product PostgreSQL and queue Redis from a successful static site.
- Earlier release docs required Alloy and dedicated queue Redis; the owner accepted
  Kuma/Dokploy monitoring and shared services by purpose in the platform plan.
- An initial worker shutdown rehearsal exited 1 while other verification/builds
  were running. Its cause is unproven; three subsequent combined image rehearsals
  passed, including Redis outage and bounded clean worker shutdown. No worker
  behavior was changed to hide the failure.
- The initial isolated full gate exceeded `/tmp` storage quota during installation.
  Running the same gate with a disposable checkout on the workspace disk passed;
  existing development services and data were not reset.

## Decision Log

- 2026-10-12 / owner: Domain bought; proceed with deployment setup. DNS is Cloudflare.
- 2026-10-12 / implementation: Keep same-origin path routing, immutable GitHub builds,
  `_FILE` secrets and an explicit successful migration barrier. Preserve existing
  local data/services and the domain's mail records.
- 2026-10-12 / owner: Keep hs; assess upgrade before launch. Account for shared data
  services now: database/roles and Redis ACL namespaces are allocations, not
  separate per-product instances.
- 2026-10-12 / implementation: Prepare artifacts while host capacity is unresolved;
  no purchasing, destructive restore, server build or production migration inferred.
- 2026-10-12 / owner: Continue production setup on Contabo VPS S SSD (4 cores,
  8 GiB RAM, 200 GB disk); an upgrade is not a prerequisite for preparation.
- 2026-10-12 / owner: Display the product as **ntumie.**, including email sender
  presentation; retain `ntumie` for technical identifiers.
- 2026-10-12 / owner: Production support mailbox is `support@ntumie.link`;
  selected sender is `no-reply@notify.ntumie.link`. Preserve iCloud mail records.

## Outcomes & Retrospective

Local deployment preparation is verified; launch remains in progress. No production
product services, DNS changes, new secrets or migration have been created. Existing
platform recovery acceptance remains in the shared workspace and infra records.

Acceptance on 12 October 2026: full `bun run verify:isolated` passed, both images
built, five deployment contract tests passed, and synthetic Swarm rendering passed
for application, migration and shared queue manifests. Three combined image
rehearsals passed web rendering/health, compiled signup and capture delivery,
PostgreSQL DDL/other-database refusal, Redis cross-namespace/channel/admin refusal,
dump/restore, dependency outages and bounded shutdown. The final run also denied
runtime access to Prisma migration history. These are disposable Docker checks,
not a Swarm rollout or an off-host production restore.

Infra's allocation script was applied twice to disposable PostgreSQL; a non-root,
read-only shared queue rehearsal preserved its fixture across an AOF restart.
The allocator also passed reapplication after a synthetic migration, preserving
product DML grants while removing runtime access to migration history. Final
tooling tests passed (12 tests), and handbook source/build/site checks passed.
The current 4-vCPU/8-GiB host cannot be approved from its 1,129-MiB available RAM:
assess 16 GiB and CPU options with unrelated workloads included. Proposed caps are
2.5 GiB steady plus 1 GiB rolling overlap, and 3.5 CPU steady/5.5 during overlap.
These budgets are planning inputs, not measured production requirements.

Next setup work: prepared shared-service and application/migration targets, secret
references, Google callback and exact ingress trust; review/source publication,
GitHub images and real coordinator acceptance. The sender is accepted through
one authorized message received in the support inbox. Delivery/bounce webhook
integration is separate from the sender change and operational monitoring.
Capacity upgrade, independent recovery and off-host restore remain production
launch checks; the owner explicitly selected proceeding with production setup. Retain this
active plan until those gates are resolved; durable decisions live in ADR-0061,
the release runbook and infra's data-service contract.

## Context And Orientation

`apps/api/Dockerfile` supplies Nest, the worker and Prisma migrations. The custom
web server at `apps/web/server.ts` owns trusted source attribution and must be used
in production; a generic Next standalone server would bypass this boundary.
`packages/config/src/public-origins.ts` requires matching public scheme/hostname.
`docker-stack.prod.yml` owns runtime configuration; `.github/workflows/release.yml`
owns image publication. `tooling/verify-release-image.ts` owns isolated image proof.
The canonical shared platform plan lives in hashikome/workspace; the current source
contracts are `docs/design-docs/infra-deployment.md` and `docs/runbooks/release.md`.

## Plan Of Work

Add a frozen-lockfile web image running the existing custom server as non-root.
Rehearse both images with synthetic files and disposable resources. Complete the
production web/API/worker topology, exact same-origin configuration, scoped secret
mounts, ingress priorities and migration gate. Publish both images only after image
and application checks pass. Resolve platform/provider inputs before enabling any
public promotion; preserve explicit pending gates rather than treating build success
as deployment acceptance.

## Concrete Steps

From the repository root: `bun run verify:isolated`; build each Dockerfile and run
its image rehearsal; render production/local Stack with synthetic references.
Use `gh` for publication metadata and SSH/Dokploy read-only inventory. Runtime
mutations follow reviewed source → GitHub verification/build/GHCR → Dokploy Stack.

## Validation And Acceptance

Images must run without startup compilation, as non-root on read-only roots, with
secret files excluded from builds. Verify current migrations, API/worker flows,
web rendering/source attribution and private cache behavior. Reject mutable/foreign
images and migration failure before serving. Public acceptance separately includes
TLS, authentication, Google callback, Resend delivery/webhook, recovery, monitoring
and a representative save/read/share journey.

## Idempotence And Recovery

Image rehearsals own uniquely named disposable resources and remove only those.
Do not initialize Swarm on the shared workstation or restore over `hs`. Preserve
existing DNS/mail, development data and unrelated services. Database rollback is
reviewed per migration; never automatically reverse SQL or assume old binaries are
compatible. Product publication follows AGENTS.md review requirements.

## Artifacts And Notes

Public DNS: Cloudflare nameservers, proxied A/AAAA answers, iCloud MX. Records alone
do not validate origin routing or domain-scoped API authorization. Secrets remain
in the operator store and selected 1Password vaults, never this plan.
Temporary verification checkouts and this milestone's raw logs were removed after
promoting results here. Local `ntumie-api:deployment-check` and
`ntumie-web:deployment-check` images are retained by this deployment task for the
next coordinator rehearsal; replace/remove them when that rehearsal is complete.
They are local test artifacts, never release inputs.
Dokploy v0.30.8 filters Stack task listings to desired-state=running; the coordinator
uses its local all-state container listing for migration acceptance and checks the
exact Swarm service/task labels, image, command, attempt and exit code. Remote
Dokploy servers are deliberately refused by this first adapter.

## Interfaces And Dependencies

Bun 1.3.14, Next custom server, Nest/Prisma7/PostgreSQL18, BullMQ/Redis7, Dokploy0.30.8,
Traefik Swarm provider, Cloudflare DNS, Google OAuth and Resend. Shared data services
require scoped product roles/queue ACLs, persistent queue policy and off-host recovery.


### First live activation and unattended secret delivery

The first shared-data GitHub release started pinned PostgreSQL successfully.
Queue deployment failed before service creation: Docker Stack misinterpreted a
hyphen in a required-value error message. Updated both product manifests and the
infra queue manifest to use identifier-only required messages; regression checks
assert resolved names/images rather than only the renderer exit status.
The owner selected 1Password at the CI/CD credential boundary, with no application
SDK. Deploy jobs use the pinned official action and separate read-only service
accounts scoped to Hashikome CI. Runtime secrets remain versioned Swarm files;
provider/database rotations are coordinated operations, not implicit on vault edits.
Live deployment acceptance remains pending while the corrected pipeline runs.

Two isolated full gates stopped at different default five-second limits (export
setup, then the multi-step Google consent/factor journey); the export suite passed
unchanged on rerun. Integration suites now have a 15-second default, preserving
explicit timing contracts. No tests are skipped and development services are not
reset. The full gate must pass before publication.

### Provider portability and native custody — 12 October 2026

The owner selected consumer-based configuration: application environment bundles,
reusable typed API fields, separate CI credentials and native SSH items. Applications
retain plain env/`_FILE` inputs. Added portable runtime examples and explicit
`SECRETS_PROVIDER` selection (`1password` or `github`, default GitHub for independent
installs); failed/unknown providers cannot silently fall back. Both live production
environments explicitly select 1Password. Synthetic checks passed provider selection,
missing-key and multiline-injection failure behavior in both workflows.

The owner imported native Environment `ntumie/production`; a private readback plus
Google/Resend field composition matched all 19 expected application variables. The
plain dotenv path produced the same inputs, excluding the migrator identity.
Existing CI accounts read only deployment credentials; they do not yet read this
Environment. Runtime Swarm versions remain explicit, with no automatic vault-edit
synchronization. SSH maintenance and broader custody are infra-owned.

The earlier full isolated gate passed after the integration timeout adjustment.
The full provider/template gate passed. Production naming and neutral runtime
inputs then passed focused documentation, coordinator and Stack checks; normal
pre-push verification and the GitHub release remain required.

### Production naming and neutral runtime inputs

The owner clarified that local development and production are the only permanent
environments, on one server. Existing services were moved into the default Dokploy
production groups; superseded GitHub and empty Dokploy staging environments were
removed. Production CI holds the verified provider token and target variables.
The native application Environment was renamed and updated by the owner.

Neutral values are `hashikome-products-postgres`, `hashikome-products-queue`,
`hashikome-data` and `ntumie-email`. Infra owns activation of the matching network
and ACL before product rollout; existing storage/service identities are preserved.
New neutral versioned Swarm secrets are prepared. Native Environment readback
passed all 19 expected variables after this update. The preview follow-up lives
in the technical-debt tracker and does not establish an accepted live preview.
