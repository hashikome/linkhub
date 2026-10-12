# ADR-0061: ntumie.link and shared product data services

Status: Accepted for deployment preparation; live acceptance pending
Date: 2026-10-12

## Context

The owner bought `ntumie.link`, confirmed Cloudflare DNS and selected continuing
on `hs` with an upgrade assessment before launch. He reaffirmed that shared data
infrastructure must be designed into this deployment now. Earlier product release
notes still described dedicated queue Redis and Alloy as a release prerequisite.

## Decision

Use `https://ntumie.link` for both browser and API origins. Traefik routes `/api/*`
to Nest with higher priority than the web route. Host-only cookies forbid an API
subdomain without a separate reviewed auth change. The custom Bun/Next server,
including source-attribution signing, remains the production web entrypoint.

Use shared product PostgreSQL 18 and shared queue Redis, each separate from
Dokploy's internal services. Allocate a product database, distinct migration/runtime
roles, connection budget and scoped Redis username/key/channel namespace. Product
Stack releases contain only application services. No product may share the broker
without real-client ACL tests and combined memory/queue/recovery acceptance.
Queue Redis uses AOF/noeviction; cache Redis remains a different, unneeded purpose.

Initial monitoring is Uptime Kuma plus Dokploy resource views and an explicit
worker/queue procedure. Grafana/Loki/Alloy remains deferred; optional Sentry does
not require a secret mount for the first deployment. This adopts the already
accepted shared-platform policy and supersedes conflicting requirements in the
older product infrastructure/release prose; it changes no implemented telemetry.

Application replicas default to zero. A separate one-shot migration uses only its
scoped migration database credential. GitHub verifies and publishes both immutable
images; live promotion needs successful migration completion plus platform/provider
acceptance. Failed application updates pause for review: do not automatically
select an old binary after an unreviewed schema change.

## Consequences

Assess aggregate host capacity now, including shared services, application overlap,
backups and future product admission. Preserve unrelated workloads and existing
mail DNS. Domain purchase is accepted; image publication, provider setup, shared
service provisioning, recovery and public launch remain independently verified gates.
The [deployment plan](../exec-plans/active/prepare-ntumie-link-deployment.md) owns
current progress; infra owns the service lifecycle and allocation contract.
