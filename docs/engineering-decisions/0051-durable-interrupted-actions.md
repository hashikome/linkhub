# ADR-0051: Durable capture receipts and interrupted actions

**Status:** accepted

**Date:** 2026-10-11

## Context

Reconstructing capture results from mutable aliases breaks retries after a rename.
A valid import edit can also exceed browser cookie limits after encryption, silently
losing submitted fields during sign-in. Both violate existing idempotency and
interrupted-action requirements.

## Decision

Capture receipts store the immutable resource IDs actually returned. Replay checks
current destination access and resource existence, preserving order and rejecting
missing items. Legacy receipts retain a lookup fallback and acquire IDs on their
first resolvable retry; there is no reliable backfill for aliases already lost.

Keep small pending actions in the existing encrypted cookie. Values over 3,800
characters use shared API persistence of the sealed ciphertext, with a random
256-bit reference in the cookie. PostgreSQL stores its hash, the bounded payload
(up to 64 KiB), and a 15-minute expiry. Web replicas share the store through a
service-authenticated endpoint; the web never connects directly to the database.

A domain-separated HMAC with `WEB_SOURCE_SECRET` signs the complete command and a
60-second timestamp. An expired end-user session is expected and supplies no
storage authority. Signed commands confer no collection authority: the existing
matching-account check and authenticated API command enforce replay permissions.
Internal payloads and proofs must not enter logs. Storage reads are non-consuming;
completion deletes the record and periodic bounded pruning removes expired data.
Unavailable storage must surface an error, never pretend an action was preserved.

## Consequences

An additive migration is required before the new API is served. Long edits need
API availability to stage/recover; small actions retain their existing behavior.
No process-local cache, shared filesystem, browser local storage, or lossy field
truncation is introduced. This strengthens existing recovery guarantees without
changing authentication or domain authorization.

## Verification

Cover alias changes, removed resource IDs, legacy receipts, signed storage commands,
expiry and cleanup, Unicode field preservation, and expired-session browser recovery
with and without JavaScript. The [execution plan](../exec-plans/completed/preserve-capture-and-import-recovery.md)
records checks and completion evidence.
