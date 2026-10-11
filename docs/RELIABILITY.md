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

- Reviewed import edits carry a draft revision; stale mutations fail with 409.
  Commit takes at most 100 ready rows under the authority transaction, rechecks
  owner access, and atomically writes collections, nonempty sections, resources,
  audit entries and immutable import receipts. Failures/pending rows remain in
  the draft; a database or audit failure rolls back the whole batch. Completed
  replay imports zero rows. Source order within each import group survives later repairs and batches.
  Bookmark collections place direct links before child references and then flat
  sections; sibling references keep source order across partial commits. Separate
  source folders sharing a destination also retain their relative order.
  Import batches plan all section/resource insertions against one snapshot per
  destination collection. Existing resources move through collision-free temporary
  positions with two bulk writes, then receive final positions and one version
  increment. This bounds position-shift queries independently of the number of
  repaired folders and preserves atomic rollback and unique positions.
- Draft expiry runs every minute in the worker, deleting at most 100 expired
  drafts under the authority lock. Draft removal never deletes imported resources.
  Lookup requests share durable metadata jobs; no network fetch holds this lock.
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

## Collection reference cleanup

Delete and transfer confirmations bind to a fingerprint of the target and affected
collection/resource state. Recompute under the authority transaction; conflicts
return to a fresh preview. Remove only the owner's reference rows and section
headings made empty, audit those removals, and commit with the lifecycle change.
A failed cleanup or audit rolls everything back. Ordinary URLs have no reference
lifecycle. See [ADR-0047](engineering-decisions/0047-owner-scoped-collection-references.md).

Collection imports persist queued ready-row IDs before responding. The worker
processes at most 100 links per authority transaction and records continuation
state with receipts. Failed batches roll back to a savepoint before recording
failure under the same lock. Multiple workers and restart retries cannot duplicate
receipts. Queued/running collections are frozen against edits; each batch checks
account status, ownership, expiry and current collection policy. Publication is a
per-draft creation preference and never overwrites an existing destination.


Capture receipts persist the exact immutable resource IDs returned by a save.
Retries check those resources still exist in the destination and recheck access;
target handle/title changes do not change the result. Legacy receipts without IDs
are upgraded on a resolvable retry; aliases already lost before migration cannot
be reconstructed reliably. See
[ADR-0051](engineering-decisions/0051-durable-interrupted-actions.md).
