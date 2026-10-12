# Infrastructure & Deployment Direction (Hashikome)

Status: API/worker and web release artifacts are being prepared for the registered
`ntumie.link` domain. Image verification and live acceptance are separate; nothing
is deployed. See the active deployment plan for current evidence.
The [release runbook](../runbooks/release.md) owns commands, required operator
inputs, local evidence limits, migration ordering and outstanding live proof.

The owner confirmed a shared Hashikome foundation on 11 October 2026. This
supersedes the earlier direction of a separate personal namestarlit VPS/Dokploy
instance and an nsinfra repository. ntumie. is now a company product; WorkLog and
the portfolio remain personal. This ownership change does not deploy anything.

## Direction

Use Hashikome's shared self-hosted Dokploy administration and the existing
`hashikome/infra` repository for company infrastructure. Host topology, capacity,
shared identity scope, and implementation remain separate planning work. The
product-owned release contracts below remain the intended approach:

- **GitHub Actions owns verification and builds.** It runs the repository's
  verify workflow, builds immutable production images from the reviewed
  commit, tags them with the full git commit SHA (human-readable tags may be
  added, never replacing the SHA tag), pushes them to **GHCR**, and triggers
  Dokploy only after every required image exists.
- **Dokploy owns running them.** It pulls the prebuilt images and runs each
  product's repository-owned topology, and manages domains, TLS, Traefik
  routing, deployment history, logs, and shared services.
  **No source builds on the VPS** — Dokploy must never clone and compile a
  product on the production host.
- **Swarm stack mode, not standalone compose.** Dokploy runs on Docker Swarm
  underneath, and its Compose service type offers an explicit **Stack** mode
  (`docker stack deploy`); company products use it. Production topology files are
  written in the swarm dialect from day one: no `build:` (unavailable in
  stack mode — which mechanically enforces the prebuilt-image rule), no
  reliance on `depends_on` (ignored by swarm; migration-before-serve ordering
  is an explicit release step anyway), `deploy.restart_policy` and
  `deploy.resources` instead of top-level `restart:`/limits, **named volumes
  only** (relative-path bind mounts don't persist reliably), and
  `--with-registry-auth` on deploys since GHCR images are private. Swarm's
  native secrets (`/run/secrets/<name>`) are exactly the `_FILE` convention.
- **Topology files per product, one purpose each** (stack files are
  environment-suffixed `docker-stack.<env>.yml`):
  - `compose.yml` — local development only (the modern Compose default
    filename). Full compose dialect is fine here: localhost-bound published
    ports, healthchecks, whatever makes `docker compose up -d` pleasant.
  - `docker-stack.prod.yml` — the production topology, consumed by Dokploy's
    Stack mode. Never contains `build:`.
  - `docker-stack.local.yml` — a required artifact, not a contingency: the
    local single-node-swarm simulation of the production topology
    (`docker swarm init` + `docker stack deploy`), the established practice
    in other projects. It is how stack-dialect behavior
    (secrets, `deploy.*` policies, ordering without `depends_on`) is
    rehearsed before anything reaches the VPS.
- **Local development and production are the permanent environments.** The single
  VPS is production; a host upgrade or replacement does not change that role.
  Configuration bundles identify the environment while internal service names
  and queue namespaces remain neutral (for example `ntumie-email`).
- **Temporary previews are a planned same-host capability, not an accepted live
  feature.** Dokploy's built-in GitHub Application previews do not directly cover
  this raw multi-service Stack. Any preview coordinator must use GitHub-built
  images, separate preview data/queue credentials, captured email, bounded
  capacity and teardown on PR closure. The local Swarm simulation remains the
  pre-release topology check; no permanent staging server is planned.
- **Each product repository owns its own runtime definition**: Dockerfiles,
  both topology files above, health/readiness checks, environment and
  secret-file contracts, migration commands, and release ordering. Dokploy
  values are deployment inputs; durable runtime decisions stay documented in
  source control.
- **The private `hashikome/infra` repository owns the shared operational layer**: VPS provisioning, host hardening, firewall and
  SSH policy, pinned Dokploy installation/upgrades/backup/recovery, DNS and
  TLS policy, registry integration, shared backup destinations with
  restore-drill automation, and shared observability/uptime services. It
  references versioned product artifacts but owns no product code.

## Initial Topology

```txt
GitHub Actions (per product repo)
  -> verify and build
  -> push immutable SHA-tagged images to GHCR
  -> update release inputs and trigger Dokploy

Hashikome infrastructure
  -> Dokploy management services and deployment queue
  -> Dokploy-managed Traefik
       -> ntumie. web + api
       -> shared identity (when implemented)
  -> product workers (the ntumie. email and link-metadata worker)
  -> PostgreSQL 18 (one instance, one database per product)
  -> shared product queue Redis with product ACLs and queue namespaces
  -> shared services (uptime/observability) as company infrastructure adds them
```

Accepted initial topology: one shared product PostgreSQL instance with per-product
databases and runtime/migration roles; one shared queue Redis with product ACLs,
key/channel namespaces, AOF persistence and `noeviction`. Queue Redis is never a
cache or Dokploy’s internal Redis. New products must pass isolation and aggregate
capacity checks before admission. A dedicated exception needs a concrete reason. The VPS
is one failure domain: apply explicit resource limits, monitor disk and
memory pressure, keep builds off-host, and keep required backups **off-host**
with tested restores.

### Origins: direct backend routing

Production uses `https://ntumie.link` as one public origin: Traefik routes `/api/*` straight to the API,
all other paths to the web. Development follows Pigfarm's direct API pattern:
API 4004, web 3004, with no Next rewrite. Exact-origin credentialed CORS admits
only WEB_ORIGIN; cookie mutation checks remain independent (ADR-0036).

`BETTER_AUTH_URL` identifies the public API and Google callback destination.
`WEB_ORIGIN` identifies web redirects, public links and the passkey origin.
It defaults to an explicitly configured BETTER_AUTH_URL in single-origin
production. Both must share a hostname and scheme for host-only cookies.
The development launcher sets both from PORT and WEB_PORT. Public browser
requests use the validated API origin rendered into the document at runtime;
no environment-specific client build is needed.

`API_INTERNAL_ORIGIN` remains the private server-to-server address. API and web
share WEB_SOURCE_SECRET for attributable SSR reads/native forms. Neither value
is browser configuration. X-Request-Id and Retry-After are exposed by CORS;
credentials and authorization remain backend-owned. See
[local development](../runbooks/local-development.md) and
[security](../SECURITY.md#origins-cors-and-csrf).

## Conventions (apply to every ns product)

- Production images are immutable and pinned by SHA tag and digest.
- Secrets reach services through deployment-secret `_FILE` inputs; secret
  values are never logged and never baked into images.
- Health and readiness endpoints are part of each product's API contract.
- Migrations run as an explicit release step owned by the product repo
  (`prisma migrate deploy` for ntumie.), ordered before the new app
  version serves traffic.
- Dokploy project/environment names stay configurable — operational naming is
  not a durable contract (the naming-boundaries rule).
- GitHub environments and required approvals gate production deploys when the
  release risk warrants them; workflows get only the GHCR and Dokploy
  permissions they need.

## Repository artifacts and release boundary

The workspace has separate `apps/api` and `apps/web` boundaries. The API
Dockerfile also supplies the worker process; local/production Swarm topologies
and verification/release workflows are repository-owned. The web image uses the
existing custom server and `/healthz` liveness endpoint. Automatic Dokploy promotion
remains gated on capacity/recovery and a verified migration coordinator. The
application Stack defaults every replica count to zero; `docker-stack.migrate.yml`
uses a separate migration credential and must complete successfully before serving.

`readSecret` in `apps/api/src/config/secret.ts` resolves `<NAME>_FILE` before
`<NAME>`, trims file content and fails on unreadable paths. Database, auth,
Redis and email credentials use that contract. Development defaults match
`compose.yml`; supplied configuration is validated, and production requires
explicit secrets rather than public development defaults.

`GET /api/v1/health` is dependency-free liveness. `/api/v1/status` probes
PostgreSQL and queue Redis: ready, degraded for Redis-only failure, unavailable
with HTTP 503 when PostgreSQL fails. Public probe exposure must be reviewed
before deployment.

Push/PR CI runs application builds and real-service tests. The manual release
workflow gates image publication on verification and image rehearsal. Local
application development needs PostgreSQL/Redis containers and host app
processes, not image acceptance. Before exposure, complete the release runbook's
Swarm/Dokploy/Traefik, TLS, off-host restore, live email, Kuma availability and Dokploy resource
checks. Grafana/Loki/Alloy is deferred by the platform owner; it is not a launch gate. Local image evidence is not proof of a working production platform.


## Shared-platform allocation

The owner selected keeping `hs` and assessing its RAM upgrade before launch. Infra
owns the [shared data setup](https://github.com/hashikome/infra/blob/main/deploy/data-services/README.md):
PostgreSQL 18 with product database/roles and connection budgets, and persistent
queue Redis with tested ACL/key/channel boundaries. Product Stack releases never
create or replace these services. Web has no data-network attachment or database
credential; API/worker have only ntumie's runtime credentials. Migration uses the
separate scoped owner role. Admission of Pigfarm or another product needs its own
isolation, capacity and restore acceptance.
