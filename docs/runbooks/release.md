# Release preparation and operator handoff

Status: release artifacts and local rehearsal tooling exist; nothing is deployed.
Image acceptance is separate from routine application verification. Rebuild and
rehearse the exact release commit before publication; older image evidence does
not validate the current source. The
[completed release-foundations plan](../exec-plans/completed/deliver-release-foundations.md)
retains milestone evidence.

GHCR publication, Swarm/Dokploy promotion, off-host restore, live email/webhooks
and Sentry/Alloy rollout remain unverified. Browser Origin enforcement is
implemented and tested locally; each new browser workflow needs its own
acceptance. Self-service account lifecycle and editable hub handles are
implemented ([ADR-0033](../engineering-decisions/0033-permanent-hub-handles-and-self-service-accounts.md),
[ADR-0043](../engineering-decisions/0043-deliberate-hub-handle-changes.md));
include email confirmation, recovery restrictions, 14-day deletion/cancellation
and the 30-day handle cooldown with non-reusable retired reservations in release acceptance. Generic vendor deletion
remains disabled.

## Deployment preparation checks

Routine development uses `bun run infra:up` and `bun run verify`, which compile
and test the application without building Docker images. When deployment work
starts, run the additional image checks from the repository root with Docker
available:

```bash
bun run infra:up
bun run verify
docker build -f apps/api/Dockerfile -t release-check .
bun run verify:release-image -- release-check
```

The image rehearsal creates uniquely named containers, a private bridge
network, a database volume, and synthetic secret files. It publishes no ports
and cleans up only those resources. It applies every migration to an empty
PostgreSQL 18 database using the same image that serves traffic; boots the
compiled API as the `bun` user on a read-only filesystem; checks `_FILE`
inputs, health/readiness, Redis and PostgreSQL outages, bounded shutdown and
production config refusal; then dumps/restores a synthetic publication and
its audit record. It never resets the development database, initializes
Swarm, sends mail, or sends remote telemetry. Local Sentry-envelope capture
is covered by API unit tests. This restore is local, not off-host proof.

`docker-stack.local.yml` is the separate Swarm rehearsal artifact. Validate
its dialect with `API_IMAGE` and `LOCAL_SECRETS_DIR` set using
`docker stack config -c docker-stack.local.yml`. On an explicitly selected
disposable Swarm host, create synthetic `postgres_password`, `database_url`,
`auth_secret` and `email_suppression` files. Use independent random auth and
suppression secrets of at least 32 characters; the database URL uses host
`postgres`, database `rehearsal`. Deploy with `API_REPLICAS=0`, run the migration as a one-shot
service on `<stack>_local` using secret `<stack>_database_url`, check its exit
code, then redeploy with `API_REPLICAS=1`. Probe through the attachable overlay
network; no host ports are exposed. Remove that stack and its owned volumes
afterward. A passing bridge-network rehearsal or `stack config` does not
prove Swarm scheduling, ingress, secrets distribution, or rolling updates.

## Image and release workflow

`.github/workflows/verify.yml` runs the complete application verification gate
on pushes and pull requests, including compilation and real-service tests.
No required integration suite skips because services are absent. It does not
build or rehearse Docker images.

`.github/workflows/release.yml` is manually dispatched on `main` when preparing
deployment artifacts. It runs the reusable verification workflow, then a
separate `image-check` job builds and rehearses the API/worker image. Only after
both gates pass does the publication job build and publish to GHCR with a full
commit SHA tag and build provenance/SBOM. Its summary supplies
`API_IMAGE=<registry>/<repository>/api:<sha>@sha256:<digest>`. There is no
deployment webhook yet. Publication and live rollout remain pending.


The Dockerfile pins Bun 1.3.14 by digest, installs the frozen lockfile and
compiles in the build stage. The runtime retains the pinned Prisma CLI so
the migration uses the identical artifact, at the cost of a larger image.
No install, generation, or compilation happens at application startup.
`tsconfig.runtime.json` resolves `src/*` imports into compiled `dist/src/*`.
Environment files, generated clients, keys and disposable reference context
are excluded from the build input.

## Platform inputs before a live rehearsal

The operator supplies non-secret references for:

- The namestarlit Dokploy project in **Stack** mode and its actual Traefik
  provider/version, HTTPS entrypoint, certificate resolver and ingress CIDRs.
  The prepared labels use the Traefik Swarm provider. Validate them against
  the installed platform before promotion.
- `PUBLIC_HOST`, `INGRESS_NETWORK`, `BACKEND_NETWORK`, `HTTPS_ENTRYPOINT`,
  `TLS_RESOLVER`, `TRUSTED_PROXY_CIDRS`, `API_IMAGE`, and full `RELEASE_SHA`.
  Allow only the actual proxy addresses; never trust all forwarded headers.
- External Swarm secret names `DATABASE_URL_SECRET`, `AUTH_SECRET`,
  `REDIS_URL_SECRET`, `SENTRY_DSN_SECRET`, `RESEND_API_KEY_SECRET`,
  `RESEND_WEBHOOK_SECRET_NAME`, and `EMAIL_SUPPRESSION_SECRET_NAME`.
  Keep the suppression secret stable across auth-secret rotation and restore;
  replacement needs reviewed suppression rekey/import. Contents stay out of Git/chat.
  The stack exposes them only through `/run/secrets/*` and `_FILE` inputs.
- A PostgreSQL 18 product database and dedicated Redis with AOF and
  `noeviction`, reachable only over the private backend network. The product
  stack contains the API; the platform owns these shared-service lifecycles.
- A Sentry API project with reviewed access/retention, and shared Alloy
  stdout/dependency-metric collection. The API defaults to a 10% trace sample;
  `SENTRY_TRACES_SAMPLE_RATE` can override it. Request and error logs remain
  allowlisted even without a DSN.
- An encrypted off-host backup destination, restore destination, retention
  policy, and a named operator responsible for running the restore drill.

Validate the fully supplied topology with `docker stack config`; never print
resolved secret contents. The public status contract is:
`/api/v1/health` is dependency-free; `/api/v1/status` reveals dependency state
and is 503 only for PostgreSQL failure. API liveness is the container health
check; ingress uses readiness. Review this dependency-detail exposure before
public routing. Restrict development API documentation at the edge as needed.

## Migration-before-serve and rollback

Take and verify a recoverable backup before a release migration. For the
initial deploy keep API replicas at zero until migrations succeed; for an
upgrade keep the previous compatible image serving. Set `MIGRATION_SERVICE`
to a unique operator-owned name. On the selected Swarm manager:

```bash
docker service create --name "$MIGRATION_SERVICE" \
  --network "$BACKEND_NETWORK" \
  --secret "source=$DATABASE_URL_SECRET,target=database_url" \
  --env DATABASE_URL_FILE=/run/secrets/database_url \
  --restart-condition none --with-registry-auth \
  --entrypoint bun "$API_IMAGE" \
  node_modules/prisma/build/index.js migrate deploy
docker service ps --no-trunc "$MIGRATION_SERVICE"
```

Inspect the task's `Status.State` and `Status.ContainerStatus.ExitCode` using
`docker inspect` on its task ID. **Require completed with exit code 0** before
promotion; a submitted task is not a completed migration. Preserve sanitized
logs and remove the one-shot service. Then let Dokploy deploy the reviewed
`docker-stack.prod.yml` with registry authentication. Never run migration
automatically in every API replica.

Review rollback compatibility for the exact image pair and migration set being
released. The migration chain starts at `0_init` with reviewed additive changes;
never assume an older binary can serve a newer schema. Roll back an image only
when compatible, preserve audit data, and never automatically reverse SQL.
Migration failures require inspection through the
[migration runbook](migrations.md). Column or contract changes need an explicit
compatibility and recovery review before promotion.

## Outstanding live acceptance

Before public exposure, actually run the disposable Swarm rehearsal, GHCR
pull and secret distribution, migration-before-traffic and rolling rollback,
TLS/health routing, and off-host backup restore. Verify the restored identities,
collection content/sharing, audit trail and SQL-only invariants. Record image
digest, migration set, dates, outcome and operator in repository-local evidence
without secret values. Validate resource limits against measured load.

Follow one deliberate synthetic sanitized API failure by request ID through
Sentry issue/trace/log and Alloy/Loki; confirm dependency metrics and alert
delivery, telemetry-outage behavior, and operator access/retention. Content audit data has no automatic purge. Review retained audit/receipt
identifiers and validate the implemented account-deletion cascades and contribution
anonymization before public exposure. Auth events and
shared address/source challenge budgets are implemented. Worker/browser spans
and live sender proof remain separate acceptance work. Review endpoint abuse
limits against real traffic and the public status shape (what readiness
exposes) before exposure. The foundation's adoption history is in
[foundation-adoption-decisions.md](../exec-plans/completed/foundation-adoption-decisions.md).
