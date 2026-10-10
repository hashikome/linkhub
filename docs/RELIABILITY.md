# Reliability

## Idempotency

- Background jobs are idempotent; consumers assume at-least-once delivery.
- URL capture deduplicates by canonical URL hash, so repeated captures of the
  same resource converge instead of duplicating.

## Concurrency

- Collection and resource updates use version checks (optimistic
  concurrency); stale writes fail with `409` rather than overwriting.
- Reorder writes use the two-pass temporary-offset transaction to respect the
  unique `(collection, position)` constraint without transient conflicts.

- Imports isolate each resource insert with a PostgreSQL savepoint inside the
  authority transaction. A database-invalid row rolls back to its savepoint;
  valid preceding and following rows commit together, matching the reported
  counts. A transaction-wide failure still fails the request.
- Sign-in flow issuance and resend eligibility are separate timestamps. A
  refused resend preserves issuance/expiry and stores the server cooldown as
  a retry deadline, including waits longer than the normal resend interval.

## Jobs And Queues

- Email uses an encrypted PostgreSQL transactional outbox relayed to BullMQ,
  with delivery in a separate worker process. PostgreSQL stays authoritative;
  Redis dispatches opaque outbox IDs and is never the source of truth.
- Link-metadata lookups use durable `link_metadata` rows, leases and BullMQ
  dispatch; network fetches stay outside the authority transaction.
- Exports are synchronous (programmatic renderers, file in the response) and
  do not queue. Other notification workflows remain separate product work.
- Queue Redis (when production-shaped) runs with AOF persistence and
  `noeviction`, and is never reused as a cache.
- Email delivery includes leases, bounded retries, crash recovery, terminal
  failure handling, and credential-retention cleanup. Provider success and
  database bookkeeping are separate outcomes; an external send is not an
  exactly-once database transaction. See `docs/design-docs/transactional-email.md`.
- Tests of relays and workers require disposable databases and queue namespaces;
  never let a test relay claim development work or erase a shared queue.

## Data

- PostgreSQL 18 is the single source of truth. `timestamptz` UTC everywhere;
  `created_at` is the authoritative audit timestamp (never inferred from
  UUIDv7 values).
- Schema changes go through reviewed Prisma migrations
  (`docs/runbooks/migrations.md`); database objects that Prisma cannot model
  live in migration SQL and must never be dropped by an auto-generated diff.
- Production databases get off-host backups with tested restores before
  launch (`docs/design-docs/infra-deployment.md`).

## Audit and abuse budgets

- Sensitive collection management commits its audit row atomically; audit
  failure rolls back the action. Transfer history remains in its original hub
  and a receiving event is written to the destination hub in that transaction.
- Request budgets use atomic PostgreSQL upsert/count rollover across replicas.
  Store failure is fail-closed (503); dependency probes bypass the budget.
- Every minute each API replica removes at most 1,000 counters expired for
  more than a day using `SKIP LOCKED`; maintenance failure emits a sanitized
  event and retries on the next interval. No overlapping maintenance per
  process. Monitor backlog before raising limits or public traffic.
- Auth audit records expire after 90 days; delivery metadata expires after
  30 days. Content audit has no automatic expiry. Verified self-service and admin-scheduled
  account deletion use a 14-day grace period, then remove owned content and
  anonymize retained contributions; retained audit identities do not cascade.
  Review the retention policy before public exposure; see
  [service operations](design-docs/service-operations.md#audit-reasons-and-retention).

## Service operations

The [operator contract](design-docs/service-operations.md) is implemented.
Account restrictions, session/proof/grant revocation and audit writes
commit atomically with the auth transaction boundary. Content holds
serialize with publication, resource-reference, sharing and transfer mutations. Actions
use expected versions and scoped operation IDs; stale/conflicting submissions
fail safely. The web never retries uncertain network outcomes automatically;
verification can resume an explicitly submitted action once for its original
account and operation ID ([email verification](design-docs/email-verification.md)). Operator audit
expires after 365 days in bounded cleanup, independently of active restrictions
and the existing auth/hub audit policies.

Authenticated product mutations, auth mutations and service-role invitations and operator commands
acquire the same PostgreSQL transaction advisory lock before domain row locks.
The product request transaction rechecks the live session after acquiring it;
existing nested service transactions join that transaction. This deliberately
serializes writes at the current scale. Read-only product traffic remains
concurrent, including read-only commands sent as POST (`@ReadOnlyCommand()`,
currently exports): they must not write, and run outside the lock so slow
rendering never queues other writes or meets the transaction timeout; operator reads also serialize so access decisions and audit commit
together. Revisit contention with measured traffic before increasing scale.

## Observability and release verification

- LogTape console/Sentry logs and one manual incoming span carry isolated
  server-generated request IDs; unexpected exceptions are sanitized and
  correlated once. Telemetry sink/collector failure does not fail requests.
- API shutdown has a five-second bound including at most two seconds of
  telemetry flushing; the email worker has a ten-second shutdown bound.
  API startup uses the same entrypoint for source and compiled output;
  image checks exercise compiled API/worker startup and secret files.
- The [release runbook](runbooks/release.md) separates disposable local
  migration/backup/restore and outage proof from outstanding live Swarm,
  off-host restore, routing and collector checks.
