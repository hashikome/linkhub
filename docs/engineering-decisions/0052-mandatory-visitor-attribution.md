# ADR-0052: Mandatory visitor attribution at the server transport

**Status:** accepted

**Date:** 2026-10-11

## Context

The web server connects to the API on behalf of many visitors. Missing source
attribution makes those visitors share the web server's address-based allowance.
Feature-specific header forwarding has repeatedly missed new paths, most recently
recovery-storage POSTs made while rendering sign-in pages. The atomic counter is
working; the wrong source reaches it. Switching rate-limit libraries or increasing
limits would leave that failure intact.

## Decision

All visitor-triggered server API calls use `apps/web/src/lib/server-transport.ts`.
It obtains the current request headers (including during SSR), or accepts explicit
server request headers from native form adapters. It requires and forwards both
server-stamped identity from both proof domains before making the HTTP request.
It verifies each ingress signature and re-signs with the current time at forwarding,
so body buffering and rendering do not consume the outgoing proof lifetime. Caller-provided
outgoing attribution is overwritten. Missing context fails locally; it never
silently charges a shared web-server bucket.

The entry point continues deriving source identity from the socket and explicitly
trusted proxy hops, overwriting browser-supplied attribution. The API independently
verifies signatures, expiry and purpose and chooses the proof appropriate to its
policy. Read and form proofs grant neither authentication nor authorization.
Recovery service authentication is separate and does not replace visitor identity.

Migrate page reads, invitation previews, native forms, multipart imports and all
recovery put/get/delete calls to this boundary. The web boundary gate prohibits
low-level `postJson` outside the transport and low-level `readJson` outside the
server/browser adapters. Browser requests retain their direct source identity;
the browser adapter may not be imported by server-only modules.

There is no unattributed/background flag. Current web calls are visitor-triggered.
A future scheduled service caller must introduce an explicit service identity and
reviewed budget policy rather than impersonating a visitor or using a shared
visitor fallback.

Retain existing pre-authentication source limits and atomic shared PostgreSQL
counters, including 429/Retry-After and fail-closed storage behavior. Direct API
traffic still uses its socket/trusted proxy source when no valid proof exists.
Users behind a shared client NAT can still share a source allowance; this decision
fixes web-server aggregation, not all source-based fairness limitations. Existing
account/challenge auth limits remain. Per-account product quotas, if needed, belong
after session resolution and do not replace early ingress abuse protection.

## Consequences

Feature authors choose API paths and payloads, not rate-limit attribution headers.
SSR recovery now has the same source isolation as ordinary forms. No dependency,
schema change, new rate allowance, or proxy trust expansion is required. This
strengthens the source-attribution boundary and ADR-0051's recovery implementation;
it does not supersede their authorization or encryption contracts.

## Verification

Unit tests reject missing/forged context and renew both proofs across interleaved
visitors. Database-backed HTTP tests exhaust visitor A's recovery budget and prove
visitor B can still put/get/delete; a read proof cannot override an exhausted form
budget. Browser recovery covers server-rendered reads and native/enhanced submissions.
The [execution plan](../exec-plans/completed/centralize-visitor-attribution.md) records
checks and outcomes.


## Slow-request clarification — 2026-10-11

Ingress headers are private request context, not browser-selectable identity:
`server.ts` overwrites both before Next runs. The transport authenticates their
signature, purpose and IP, and mints fresh proofs immediately before each API call.
It does not apply API expiry to this ingress context: a valid upload can take
longer than 30 seconds. It never renews arbitrary browser fields or forwarding
headers. The API still requires a signature for its domain and a timestamp no
older than 30 seconds; directly replayed expired proofs remain invalid.

A real two-visitor multipart regression holds the request body open past expiry.
One visitor and the shared web socket have exhausted file budgets; only the
other visitor's upload succeeds and consumes that visitor's allowance.
