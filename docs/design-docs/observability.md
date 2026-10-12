# Observability

Current rollout: Kuma and Dokploy resource views are the accepted first-deployment
baseline. Grafana/Loki/Alloy below is deferred direction, not a launch gate; see
[ADR-0061](../engineering-decisions/0061-shared-platform-deployment-baseline.md).

## Delivery status

The API telemetry foundation below is implemented. A comprehensive wide event
logging strategy is a separate deferred milestone, after most system operations
are built ([PRODUCT.md §11](../../PRODUCT.md#11-delivery),
[ADR-0020](../engineering-decisions/0020-logging-after-core-operations.md)).
Future domain context, pseudonymous references and audit correlation described
here are direction, not instructions to implement them during current feature
work. Keep the existing privacy boundary and release verification requirements.
Audit strategy/redesign has its own milestone after fundamental operations;
external operational telemetry does not replace internal audit evidence.

## Direction

Use one application telemetry pipeline:

- LogTape is the structured logging API for NestJS and the email worker.
- Sentry owns application errors, traces, and correlated structured logs.
- The same allowlisted, redacted record reaches console and Sentry log sinks.
- Shared Grafana Alloy infrastructure collects container stdout for Loki and
  PostgreSQL/Redis metrics for the Grafana metrics backend. It is outside the
  application image and owns shipping credentials, buffering, and retries.

Use one application tracing pipeline. The [release runbook](../runbooks/release.md)
owns deployment acceptance; the [completed foundation record](../exec-plans/completed/foundation-adoption-decisions.md)
retains adoption rationale and evidence.

## Implemented API foundation

The API pins LogTape and its Sentry sink to 2.3.0, and `@sentry/bun` to
10.69.0. `src/entrypoint.ts` awaits telemetry initialization before dynamically
importing Nest/auth/Prisma. `tsconfig.runtime.json` maps aliases to compiled
output; both source and production scripts enter through that boundary.

`common/observability` owns SDK imports. A Nest logger adapter discards arbitrary
framework text. Allowlisted event names/properties go to console and Sentry;
SDK hooks reconstruct safe errors/transactions/spans and scrub log/metric
attributes. Default SDK integrations are disabled, so there is no automatic
SQL, body, console or URL capture. Stack frames retain line/column numbers,
not source filenames, snippets or variables; diagnosis is deliberately less
rich until a reviewed source-map/path policy exists.

AsyncLocalStorage and Sentry isolation scopes isolate each request. The API
mints `req_<random>` IDs and ignores caller `X-Request-Id`. Manual incoming
spans use registered server route templates (or `<unmatched>`). Finish/close
produce one completion event per incoming request, including aborted requests.
Unexpected failures create one sanitized issue; expected failures do not.
Request count/duration metrics use bounded method, route, status and outcome
labels. Health transitions emit aggregate state only. Shutdown flush is bounded
at two seconds within a five-second API shutdown deadline.

`telemetry.spec.ts` captures real SDK envelopes on loopback, verifies concurrent
request/trace isolation and correlation, and injects arbitrary sensitive values
and a failing sink. `bun run check:telemetry` guards application logging/SDK
imports. No remote project or shared collector has been verified.

The email worker initializes the shared telemetry pipeline and emits allowlisted
startup/shutdown events; its shutdown deadline is ten seconds. Per-job tracing,
worker metrics and browser instrumentation remain outstanding.

The rest of this document includes future browser/worker/domain instrumentation.
The API currently emits no domain pseudonyms or audit references; do not invent
them or export raw IDs. Browser-to-API propagation and worker/SQL spans wait for
those slices. Shared collector rollout remains an operator gate.

## Unified Trace And Error Model

```txt
NestJS API and workers
  -> LogTape -> redacted console -> stdout -> shared Alloy -> Loki
             -> same redacted record -> Sentry logs
  -> one Sentry SDK -> sanitized errors and application traces
  -> bounded HTTP/readiness/worker metrics

Next.js browser (when instrumented)
  -> separate Sentry project -> sanitized browser errors and traces

Shared Alloy
  -> dependency metrics -> Grafana metrics backend
```

Use a single Bun SDK initialized before application imports; a Nest logger
adapter and exception filter use that initialized client. Prove this preload
path against our compiled Nest build and pinned Bun/SDK versions, rather than
assuming a source-run reference configuration transfers unchanged.

Request/job context must be isolated across concurrent work. Emit one final
request event with route template, status, duration, request ID, and available
trace ID, plus bounded domain milestones. Never use raw URLs, handles, query
strings, or resource IDs as route labels. Resolve route templates after Nest
routing; use a fixed unmatched label for unresolved routes. Handle aborted
responses without emitting duplicate completion events.

Unexpected failures create one sanitized exception issue correlated to the
request event. Expected validation failures, authorization denials, and
readiness degradation are outcomes, not duplicate exception issues. Apply the
same privacy rules at SDK hooks as at log sinks: automatic SDK capture does
not necessarily pass through the application logger.

The compatibility spike must prove concurrent context isolation, correct route
and status attribution, one incoming span, correlated sanitized exceptions,
allowlisted browser/API/worker propagation, and bounded shutdown flushing.
Production telemetry outages must not prevent core requests from completing.
The future browser SDK gets a separate public configuration entry; server
secrets never enter the browser bundle. Correlation context never grants access.

## Log Flow

The API writes structured JSON logs to standard output. The deployment runtime
captures standard output and Grafana Alloy forwards logs centrally. The API must
not write rotating log files or synchronously send every log line to an external
vendor during a request. Use human-readable pretty logs only for interactive
local development.

## Required Log Context

External telemetry uses an allowlist. Include:

- `service.name`, environment, release, and runtime version;
- request ID and trace ID;
- pseudonymous `hub_ref` when needed for operational filtering;
- pseudonymous `actor_ref` and selected `entity_ref` (e.g. collection, resource)
  only when needed to debug a workflow;
- opaque `audit_ref` when an authorized operator may need to inspect the internal
  audit record;
- module, operation, duration, outcome, and error class.

Do not send direct hub, user, collection, resource, or other domain-record IDs
to external telemetry systems. Derive external references with a
telemetry-specific keyed HMAC and a type namespace, such as `hub:<id>` or
`actor:<id>`. Keep the key outside observability providers. Use enough output
entropy to avoid collisions, and version the derivation key so references can be
rotated deliberately.

Pseudonymous references make logs and traces searchable without exposing the
immutable UUIDv7 database IDs. They are still protected data and must follow
access-control, retention, and minimization rules. Keep high-cardinality
references out of metric labels.

## PII And Sensitive Data

External logs, traces, metrics, and Sentry events must not contain PII,
credentials, secrets, or sensitive domain data.

Never send:

- names, email addresses, or other contact details;
- passwords, hashes, tokens, cookies, authorization headers, session tokens,
  share tokens, or API keys;
- raw request or response bodies by default;
- collection titles, resource URLs/notes, or other user-authored content;
- direct hub IDs, user IDs, collection IDs, resource IDs, or other domain-record
  IDs — use approved pseudonymous references only when needed;
- SQL parameters or database rows.

Use explicit serializers and redaction rules before emitting logs or telemetry.
Do not attach arbitrary request objects, error context, or user objects to
Sentry. Disable or scrub headers, cookies, request bodies, and query parameters
(the browser-friendly `?s=<share token>` in particular) unless a reviewed
allowlist permits specific fields.

Operational logs should record event shape and outcome, not business payloads.
For example, record `operation=collection.publish`, `outcome=ok`, with a
`hub_ref` and selected `entity_ref` when needed for investigation. Keep the raw
affected hub, collection, and user identifiers in the internal audit record.

## Internal Audit Logs

Sensitive audit records live in PostgreSQL with implemented scope-aware access,
retention rules and audited reads; see [attribution and activity](attribution-and-activity.md)
and [service operations](service-operations.md). The broader strategy and
presentation redesign remain deferred in `PRODUCT.md` §11. Existing evidence
records who acted, the entity, timestamp and bounded effects/reasons where captured.

When external telemetry needs to correlate with an internal audit record, emit an
opaque random `audit_ref` rather than the database audit-record ID or sensitive
payload. The application resolves `audit_ref` for authorized operators. Do not
derive `audit_ref` from a database ID.

## Initial Metrics

Track:

- API request count, error rate, and latency;
- database latency and pool pressure;
- background-job success, failure, and duration (email delivery);
- publication and share-link activity counts (aggregate, no identifiers);
- email delivery, bounce, complaint, and suppression counts.

## Initial Traces

Trace:

- browser-to-API requests through approved W3C trace propagation;
- incoming API requests;
- database calls where instrumentation is compatible with the Bun runtime;
- email delivery jobs and synchronous export requests;
- collection-policy resolution on hot read paths;
- publication and share-link acceptance flows.

## Local Development

Local development uses a readable console sink without requiring a Sentry
DSN or shared collector. Production uses structured JSON Lines. Both follow
the same redaction rules; convenience never permits printing secrets or user
content. Optional telemetry validation uses a dedicated non-production project.

## Implementation And Release Acceptance

Verify LogTape, the Bun Sentry SDK, browser integration, request/job context,
and exception-to-trace correlation against pinned versions before relying on
them. Record limitations rather than adding a second SDK or exporter. The implemented API pins and local proof are recorded above; browser and
worker compatibility remain future acceptance.

Use runtime-specific typed configuration and the `_FILE` contract. Maintain the
structured-log boundary check (`bun run check:telemetry`), covering
message interpolation and unsafe object fields. Metric labels stay bounded;
request IDs and pseudonymous actor/entity references are never labels.

`/api/v1/health` and `/api/v1/status` are monitoring APIs. The web explains
failures in the affected task and has no standalone status page. Review public status details versus internal probes before deployment;
changing that API requires updated contracts and consumers.

Before release, prove a synthetic sanitized failure can be followed from the
application request ID to its Sentry issue/trace and shipped log. Verify
collector delivery, dependency degradation, telemetry outage behavior, and
operator access/retention separately. Do not report shared infrastructure as
operational until those checks have actually run.
