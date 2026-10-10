# Infrastructure & Deployment Direction (ns series)

Status: API/worker release artifacts and local rehearsals exist; the web image
and live deployment acceptance are pending. Nothing is deployed.
The [release runbook](../runbooks/release.md) owns commands, required operator
inputs, local evidence limits, migration ordering and outstanding live proof.

The deployment model is shared across the ns series and recorded here as
NSLinkHub's own: the ns series is personal work under the namestarlit brand and
runs on its **own** VPS and Dokploy instance — completely separate
infrastructure from anything the author's company operates.

## Direction

All ns products (nslinkhub, nsworklog, later nsauth, future ns*) deploy to a
single namestarlit VPS managed by **self-hosted Dokploy**:

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
  (`docker stack deploy`); ns products use it. Production topology files are
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
    in other namestarlit projects. It is how stack-dialect behavior
    (secrets, `deploy.*` policies, ordering without `depends_on`) is
    rehearsed before anything reaches the VPS.
  - `docker-stack.stag.yml` only if a dedicated staging environment ever
    materializes — see the environment strategy below.
- **No dedicated staging environment.** Pre-release verification is
  **Dokploy preview deployments** (per-branch/PR previews on the same VPS)
  plus the `docker-stack.local.yml` simulation. A permanent staging
  environment is added only if previews prove insufficient.
- **Each product repository owns its own runtime definition**: Dockerfiles,
  both topology files above, health/readiness checks, environment and
  secret-file contracts, migration commands, and release ordering. Dokploy
  values are deployment inputs; durable runtime decisions stay documented in
  source control.
- **A private ns infrastructure repository (working name: nsinfra) owns the
  shared operational layer**: VPS provisioning, host hardening, firewall and
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

namestarlit VPS
  -> Dokploy management services and deployment queue
  -> Dokploy-managed Traefik
       -> nslinkhub web + api
       -> nsworklog
       -> nsauth (when it exists)
  -> product workers (the nslinkhub email and link-metadata worker)
  -> PostgreSQL 18 (one instance, one database per product)
  -> dedicated queue Redis per product that needs one
  -> shared services (uptime/observability) as nsinfra adds them
```

Defaults, revisitable when load or isolation needs justify it: one PostgreSQL
instance with per-product databases; a dedicated queue Redis per product that
runs queues (AOF persistence, `noeviction`, never reused as a cache). The VPS
is one failure domain: apply explicit resource limits, monitor disk and
memory pressure, keep builds off-host, and keep required backups **off-host**
with tested restores.

### Origins: direct backend routing

Production uses one public origin: Traefik routes `/api/*` straight to the API,
all other paths to the web. Development follows Pigfarm's direct API pattern:
API 4000, web 3000, with no Next rewrite. Exact-origin credentialed CORS admits
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
  (`prisma migrate deploy` for nslinkhub), ordered before the new app
  version serves traffic.
- Dokploy project/environment names stay configurable — operational naming is
  not a durable contract (the naming-boundaries rule).
- GitHub environments and required approvals gate production deploys when the
  release risk warrants them; workflows get only the GHCR and Dokploy
  permissions they need.

## Repository artifacts and release boundary

The workspace has separate `apps/api` and `apps/web` boundaries. The API
Dockerfile also supplies the worker process; local/production Swarm topologies
and verification/release workflows are repository-owned. Web image preparation
and automatic Dokploy promotion remain pending.

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
Swarm/Dokploy/Traefik, TLS, off-host restore, live email and shared telemetry
checks. Local image evidence is not proof of a working production platform.
