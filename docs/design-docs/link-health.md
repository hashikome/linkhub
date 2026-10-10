# Link health monitoring

Status: accepted paid feature, not implemented. Decision:
[ADR-0029](../engineering-decisions/0029-link-health-and-approved-redirects.md).

## Owner workflow

An entitled collection owner can monitor saved external links. Checks run in the
background and produce a current observation and last-check time. The owner gets
an update when a link becomes persistently unavailable, recovers or has a redirect
to review. Keep the last known metadata and saved item available throughout.

Distinguish reachable, redirect awaiting review, persistently unavailable and
inconclusive results. A timeout, throttled response or blocked checker must not
be reported as proof that the resource disappeared. Confirm failures according to
a bounded retry policy; cadence and confirmation thresholds remain open. A successful
response is not proof that the page still contains the expected material. Detecting
content replacement or parked domains is separate future work.

Group repeated observations into the same open issue, with bounded reminders rather
than a notification on every poll. A later recovery resolves that issue and can
notify the owner. Link monitoring uses the existing notification preferences where
applicable; delivery channels and digest cadence need specification. It does not
broadcast paid monitoring results to a collection's audience by default.

## Redirect review

Show original URL, redirect chain, proposed final URL, destination domain and last
check time. Label temporary/permanent observations without assuming every redirect
should replace the saved address. Redirect loops, invalid destinations and failed
chains are problems to report, not actionable replacement suggestions.

The owner can approve an update or dismiss it. Approval requires a nonblank
plain-text explanation of why they are changing the saved address. Show a required
reason field alongside the old and proposed URLs. The backend trims and validates
the note and enforces a length limit, to be specified before implementation.
Approval applies to the selected
resource only; it does not rewrite every occurrence of the URL or another person's
collection. Keep its ID, order, tags, creation time and original attribution, bump
its version, and record the approver. Refresh page metadata for the new URL. Link
health cannot turn an external link into a collection reference or alter visibility.

Keep the explanation, approver, approval time and source/destination addresses
together with approval evidence in an access-controlled
review record with a defined retention period. Audit events reference the resource,
review and actor with bounded outcome data; do not put raw URLs, tokens or fetched
content or the free-text explanation into general logs. Dismissal keeps the saved address and suppresses repeated
notices for that same suggestion until policy permits a new one.

## Backend and worker boundaries

Reuse canonical URL validation and guarded metadata-fetching infrastructure, but
keep monitoring observations and scheduling distinct from ordinary metadata cache
freshness. Free title/description fetching and URL validation remain available.
Jobs require the owner's monitoring entitlement and have separate budgets; payment
never grants private-content access or import/hub privileges to contributors.

Every redirect hop must obey the existing public-address and SSRF rules. Use bounded
redirects, timeouts, response sizes, concurrency and per-host request budgets. Do
network work outside authority transactions and never forward user credentials or
private access tokens. Never expose another user's saved URLs or monitoring status
through shared fetch caching.

Approval is a dedicated authenticated POST command on an existing redirect review,
not a resource PUT/PATCH operation. General resource writes reject URL fields;
adding a reason to a generic update does not make a URL change valid. The approval
payload identifies the review and expected resource version and supplies the
required explanation. The replacement URL comes from the validated review, never
an arbitrary client-supplied URL. Only this workflow may change a saved URL.
Recheck owner authority, entitlement, resource ID/version and original URL, plus a
fresh enough suggestion and permitted destination. If a new check is needed, run
it outside the write lock, then compare versions again during commit. Reject a
stale proposal; require review of any changed destination. An existing canonical
URL in the same collection is a conflict; do not silently merge or remove items.

Commit the resource change, explanation, approval outcome and audit evidence atomically, with
retry-safe behavior. Loss of ownership, collection removal, account restriction or
entitlement expiry invalidates an outstanding approval where applicable. Cancelling
monitoring never changes links or deletes collection content.

## Delivery and acceptance

Implement monitoring independently of AI/DOCX once entitlements, worker budgets
and notification delivery are ready. Fixtures must cover transient failure versus
confirmed unavailability, blocked checks, recovery, repeated alerts, stable and
changed redirects, loops, unsafe hops, stale versions, duplicate destinations,
replayed approvals, revoked authority and expiry. Verify that background checks
never rewrite URLs and that approval updates only the intended item. Reject missing,
blank, non-string and over-limit explanations; preserve the accepted note on retries.
Test that ordinary PUT/PATCH requests cannot change URLs, with or without a note,
and that an approval cannot substitute a URL outside its review.

Set cadence, quotas, confirmation thresholds, freshness, retention, reminders and
post-expiry behavior before enabling the feature. The
[backlog](../backlog/curation-and-paid-services.md) and
[delivery plan](../exec-plans/active/evaluate-curation-and-paid-services.md) track it.
