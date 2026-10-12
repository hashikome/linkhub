# Release preparation and operator handoff

Production CI/CD passed on 12 October 2026 through
[release 38275967261](https://github.com/hashikome/ntumie/actions/runs/38275967261),
selecting source `3215c83fbef20586255975ca820134694b7fbc63`. GitHub verified the
application/browser and image rehearsal, published immutable images to GHCR,
then coordinated a successful migration and API/web/worker promotion in Dokploy.
Independent checks accepted exact images/attempt, API/web health, running worker,
migration exit zero and shared-data readiness. Health/status/home/sign-in/support
returned HTTPS 200 at `https://ntumie.link`. The eight existing Swarm services
remained healthy. Post-start available RAM was 386 MiB with no swap; capacity and
rolling-overlap acceptance remain open.

Image acceptance is separate from routine application verification. Rehearse each
selected release commit; older evidence does not validate changed source. The
[deployment plan](../exec-plans/completed/prepare-ntumie-link-deployment.md) retains
acceptance evidence. Off-host product restore, Google callback and full user
journeys, product monitoring and capacity remain launch checks. The authorized
sender test reached the support inbox; product delivery webhooks remain backlogged.
Grafana/Loki/Alloy rollout is deferred; initial monitoring uses Kuma and Dokploy.
Browser Origin enforcement is
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
docker build -f apps/web/Dockerfile -t web-release-check .
bun run verify:release-image -- release-check web-release-check
```

The image rehearsal creates uniquely named containers, a private bridge
network, a database volume, and synthetic secret files. It publishes no ports
and cleans up only those resources. It applies every migration to an empty
PostgreSQL 18 database using the same image that serves traffic; boots the
compiled API as the `bun` user on a read-only filesystem; checks `_FILE`
inputs, health/readiness, Redis and PostgreSQL outages, bounded shutdown and
production config refusal; then dumps/restores a synthetic publication and
its audit record. It also checks separate migration/runtime PostgreSQL roles,
cross-product database refusal, Redis ACL key/channel/admin refusal and the compiled
BullMQ worker. With the web image supplied it verifies the custom server, `/healthz`,
server rendering and private responses. It never resets the development database, initializes
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
on branch pushes and pull requests, and as the first job of a main-branch release,
including compilation and real-service tests.
No required integration suite skips because services are absent. It does not
build or rehearse Docker images.

`.github/workflows/release.yml` runs on every push to `main`, including documentation
changes. A push automatically selects deployment after verification; pull requests
never deploy. Manual dispatch remains available for retries or artifact-only rehearsal. It runs the reusable verification workflow, then a
separate `image-check` job builds and rehearses both API/worker and web images. Only after
both gates pass does the publication job build and publish to GHCR with a full
commit SHA tag and build provenance/SBOM. Its summary supplies
`API_IMAGE=<registry>/<repository>/api:<sha>@sha256:<digest>` and the matching
`WEB_IMAGE=<registry>/<repository>/web:<sha>@sha256:<digest>`, with `RELEASE_SHA`
in a retained `release-inputs.txt` artifact. On a manual dispatch, select `deploy=true`
to run coordinated migration/application promotion (the default only rehearses and
publishes artifacts); no Git webhook
deploys ahead of the release checks. The first coordinated production rollout passed; see the acceptance record above.


The Dockerfile pins Bun 1.3.14 by digest, installs the frozen lockfile and
compiles in the build stage. The runtime retains the pinned Prisma CLI so
the migration uses the identical artifact, at the cost of a larger image.
No install, generation, or compilation happens at application startup.
`tsconfig.runtime.json` resolves `src/*` imports into compiled `dist/src/*`.
Environment files, generated clients, keys and disposable reference context
are excluded from the build input.

## Platform inputs before a live rehearsal

`deploy/production.env.example` records the non-secret input contract. Replace
every `SET_` marker only with a verified value; do not deploy the template.
The operator supplies non-secret references for:

- The Hashikome Dokploy project in **Stack** mode and its actual Traefik
  provider/version, HTTPS entrypoint, certificate resolver and ingress CIDRs.
  The prepared labels use the Traefik Swarm provider. Validate them against
  the installed platform before promotion.
- `PUBLIC_HOST`, `INGRESS_NETWORK`, `BACKEND_NETWORK`, `HTTPS_ENTRYPOINT`,
  `TLS_RESOLVER`, `TRUSTED_PROXY_CIDRS`, `API_IMAGE`, `WEB_IMAGE`, and full `RELEASE_SHA`.
  `PUBLIC_HOST=ntumie.link`; browser API and web origins share that hostname.
  Allow only the actual proxy addresses; never trust all forwarded headers.
- External Swarm secret names `DATABASE_URL_SECRET`, `AUTH_SECRET`,
  `REDIS_URL_SECRET`, `WEB_SOURCE_SECRET_NAME`, `GOOGLE_CLIENT_ID_SECRET`,
  `GOOGLE_CLIENT_SECRET_NAME`, `RESEND_API_KEY_SECRET`,
  and `EMAIL_SUPPRESSION_SECRET_NAME`.
  Keep the suppression secret stable across auth-secret rotation and restore;
  replacement needs reviewed suppression rekey/import. Contents stay out of Git/chat.
  The stack exposes them only through `/run/secrets/*` and `_FILE` inputs.
- An allocation on shared product PostgreSQL 18 and shared queue Redis with AOF,
  `noeviction`, separate runtime/migration roles and product key/channel ACLs.
  These are private data services, separate from Dokploy’s own database/Redis.
  The product Stack contains only API/web/worker; infra owns shared lifecycles.
  Web joins an internal API-facing network and ingress, never the data network.
- Kuma checks and Dokploy resource views, with documented worker/queue procedures.
  Sentry is optional; no DSN is required by this Stack. Grafana/Loki/Alloy remains
  deferred. Existing application log redaction remains enabled.
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
initial deploy keep `APP_REPLICAS=0` (API, web and worker) until migrations succeed; for an
upgrade keep the previous compatible image serving. Set `MIGRATION_SERVICE`
to a unique operator-owned name. `docker-stack.migrate.yml` describes the separate
one-shot Stack using `MIGRATION_DATABASE_URL_SECRET`; a Dokploy/GitHub coordinator
must observe the current attempt completed/exit-zero before promoting
`APP_REPLICAS=1`. The compiled `operations/migrate-release` task checks the scoped
owner/runtime roles, runs Prisma, reapplies product DML/default grants and refuses
runtime access to migration history before exiting successfully. Set a unique
`RELEASE_ATTEMPT` for every workflow run/attempt; an old completed task is not
evidence for the new attempt. The manual
command below is a rehearsal/reference, not an alternate normal deployment path.
On the selected disposable Swarm manager:

```bash
docker service create --name "$MIGRATION_SERVICE" \
  --network "$BACKEND_NETWORK" \
  --secret "source=$MIGRATION_DATABASE_URL_SECRET,target=database_url" \
  --env DATABASE_URL_FILE=/run/secrets/database_url \
  --restart-condition none --with-registry-auth \
  --entrypoint bun "$API_IMAGE" \
  --tsconfig-override tsconfig.runtime.json dist/src/operations/migrate-release.js
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

Verify Kuma alert/recovery delivery, Dokploy resource views and the worker/queue
operator procedure. If optional Sentry is configured, trace one sanitized synthetic
failure and verify telemetry-outage behavior and access/retention. Broader telemetry
is deferred. Content audit data has no automatic purge. Review retained audit/receipt
identifiers and validate the implemented account-deletion cascades and contribution
anonymization before public exposure. Auth events and
shared address/source challenge budgets are implemented. Worker/browser spans
and live sender proof remain separate acceptance work. Review endpoint abuse
limits against real traffic and the public status shape (what readiness
exposes) before exposure. The foundation's adoption history is in
[foundation-adoption-decisions.md](../exec-plans/completed/foundation-adoption-decisions.md).


## Registered domain and current deployment gate

The owner confirmed `ntumie.link` registration and Cloudflare DNS on 12 October 2026;
the zone is active and visible to the operator API token. Preserve iCloud MX/TXT
records. The owner confirmed the proxied root A record points to hs. Sender delivery
to the support inbox is accepted; Google callback acceptance remains separate.
Configure Google redirect
`https://ntumie.link/api/v1/auth/callback/google`, verified sending domain/address,
monitored support mailbox before live provider acceptance. Delivery/bounce webhook
integration is a separate product capability; without its optional secret the
existing endpoint refuses requests. It is not a GitHub or monitoring alert channel.
The owner created `support@ntumie.link` for user help; `hello@ntumie.link` is
available for general enquiries. The support inbox received the authorized test.
The selected sender is
`no-reply@notify.ntumie.link`. The current Resend key only permits sending and
cannot manage domains, by design. The owner configured `notify.ntumie.link`
in Resend. DKIM and return-path DNS
records were observed, with iCloud MX unchanged. The existing send-only key
accepted one owner-authorized message from `no-reply@notify.ntumie.link` to
`support@ntumie.link` on 12 October 2026. The owner confirmed inbox receipt. Transactional sender presentation is
`ntumie. <no-reply@notify.ntumie.link>`. No new webhook is required to replace
the sender. The ignored local API environment was updated without restarting
development services.

`hs` remains the selected production target (Contabo VPS S SSD, 4 cores,
8 GiB RAM, 200 GB SSD). The owner selected proceeding with setup on that host;
an upgrade assessment remains production-launch work. The
[shared data setup](https://github.com/hashikome/infra/blob/main/deploy/data-services/README.md)
owns the combined capacity budget, product database/role allocation and queue ACLs.
The owner authorized production activation through the verified GitHub release path.
Full platform recovery, off-host product restore and capacity acceptance remain
production-launch requirements; they do not block this production CI/CD setup.

## Coordinated GitHub promotion

The release workflow builds both immutable images after verification. Its optional
`deploy` input defaults to false. When selected, the `production` environment
selects `SECRETS_PROVIDER=1password` for the Hashikome installation and provides
`OP_SERVICE_ACCOUNT_TOKEN` plus non-secret `OP_DOKPLOY_KEY_REF`. The pinned official
1Password action reads the concealed Dokploy credential from Hashikome CI only in
the deploy job. Alternatively, `SECRETS_PROVIDER=github` (the default when unset)
uses the GitHub environment secret `DOKPLOY_API_KEY`. Unknown providers and failed
selected providers stop the release; there is no automatic fallback. Both supply
the same coordinator input. No desktop approval or application SDK is involved.
`deploy/production.json` selects the reviewed application/migration resources;
`DOKPLOY_REGISTRY_ID` remains a GitHub environment variable. Prepare distinct local
raw-source Stacks with base names `ntumie` and `ntumie-release`; Dokploy appends a
six-character suffix. Service keys are `api`, `web`, `worker` and `migration`:
Docker joins stack and service with `_`, while names we choose use `-` internally.
Leave Dokploy Git auto-deploy disabled. Both require the same private data network and migration secret reference.
Application inputs follow `deploy/production.env.example`; migration inputs need
only its backend network and migration secret name (image/attempt are supplied by CI).

`tooling/release.ts` refuses a superseded main revision, foreign/mutable images,
unresolved inputs, remote targets and failed or stale migration tasks. It verifies
one exact migration container at exit zero before mutating the application Stack,
then requires the selected attempt/images and healthy API/web tasks. Dokploy's
Stack listing omits completed tasks in v0.30.8, so the migration check uses its
local all-state container listing and verifies exact Swarm labels. Failures do not
automatically revert schema or select older binaries. Local fake-API tests and
compiled-image rehearsals do not replace real Swarm/GitHub/provider acceptance.

## Prepared identity cutover and Google availability

The neutral resources are prepared but undeployed until the owner pushes this
change. The first release migrates successfully before stopping the old application;
it observes old containers stopped before starting the replacement, avoiding duplicate
routes and workers. An unsuccessful migration keeps the old application serving.
If replacement startup fails, inspect and select a compatible release explicitly;
there is no automatic schema rollback. Legacy stopped Stack definitions remain
product-owned recovery evidence until independent live acceptance, then remove them
with `deleteVolumes=false` and retire previous-target references in the profile.
Infra's separate release controls shared data identities and preserves external
volumes and runtime DNS aliases. The product release works against either identity.

Production defaults `GOOGLE_AUTH_ENABLED=false` while the OAuth redirect configuration
is incomplete. This disables the backend provider and removes its discovery/UI option
even when credential files remain mounted. Email codes and passkeys are unchanged.
For re-enablement, register `https://ntumie.link/api/v1/auth/callback/google` on the
correct Google client, set the flag to `true` in the deployment environment and
release through GitHub; accept the real callback journey separately. `true` requires
both credentials, `false` skips them, and unset/empty preserves credential-based
selection for existing local installations. Any other flag value fails startup.

## Portable application configuration

`deploy/runtime.env.example` describes ordinary application variables, separate
from the Stack names in `deploy/production.env.example`. The existing runtime
accepts plain values or `_FILE` inputs; a supplied file takes precedence and an
unreadable file fails startup. A downloaded installation can use its own env
files and local services without installing 1Password. Never use the production
private-network URLs as workstation development endpoints.

For our optional 1Password supply path, `ntumie/production` holds app-owned values;
`deploy/runtime.1password.env.example` shows how shared Google/Resend fields join
that bundle using `op run --environment ID --env-file=private-integrations.env --
COMMAND`. Use a real ID and private reference file, and never run `env`/`printenv`
to inspect the result. The application's resulting variable names are identical
to plain dotenv input. Do not duplicate the integration keys inside the native
Environment. Keep migrator credentials out of this application bundle.

Swarm services continue receiving only their selected secret files. Vault edits
do not update those immutable versions or rotate upstream credentials. The
[shared secret contract](https://github.com/hashikome/infra/blob/main/docs/secrets-contract.md)
defines provider selection, ownership and coordinated rotation. Native Environment
import/readback is a separate acceptance step from the existing unattended CI
control-plane credential and from live application release.
