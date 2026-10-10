# ADR-0022: Operator account profiles use recorded account and session facts

- Status: Accepted
- Date: 2026-10-09

## Context

The user requested a useful Accounts API for investigating an actor from Audit
Log. Source review found identity, verification, registration, suspension and
session timestamps, but no durable last-login field. The user explicitly
excluded IP addresses and user agents.

## Decision

Keep the paginated account summary lightweight. Expose username and the existing
identity, verification, role, status, joined date, hub and active-session count.
Exact full-user-ID search supports the Audit Log-to-Accounts workflow.

The existing operator-only account detail endpoint additionally returns public
bio/image, account updated time, persisted suspension reason/date, and the newest
100 unexpired sessions with IDs, creation, expiry, verification time and whether
the session is the requesting operator's current session. One `sessionsAsOf`
instant defines both the count and returned sessions. The total count remains
visible when more than 100 exist.

Do not return credentials, bearer/session tokens, provider tokens, IP addresses,
user agents or private collection content. Reads retain cookie/operator authority,
no-store responses and their existing account.read audit. Session verification
and account update times are not described as last login or user activity.

## Consequences

Operators can review recorded account state and current access without expanding
their content permissions. Durable login history, activity tracking, geographic
inference and behavioural scoring are outside this change. No migration or
backfill is required; missing values remain explicit.

## Amendment: durable last login (2026-10-09)

The user's subsequent request expands the original no-migration scope: persist
nullable `users.last_login_at` when ordinary or invitation sign-in succeeds,
within the same transaction as session creation and verification. Failed or
rolled-back sign-ins, session reads/refreshes and account edits do not advance it.
The operator APIs return `lastLoginAt`; detail displays local time to seconds.
Existing accounts are not backfilled from session dates and show “Not recorded”
until their next successful sign-in. This records the latest login only, not an
activity history, and survives session expiry/revocation.
