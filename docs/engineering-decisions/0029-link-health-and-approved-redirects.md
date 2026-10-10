# ADR-0029: Paid link health and approved redirects

**Status:** accepted; implementation pending

**Date:** 2026-10-10

## Context

The product owner added link-health checks to the paid offering: report when a
saved link goes unavailable and present redirects for approval before updating it.
Existing metadata lookups resolve display text but do not provide monitoring or
change saved URLs. ADR-0007 currently requires removing and adding a link to change
its address.

## Decision

Paid link-health monitoring checks saved external links, reports persistent
unavailability and recovery, and creates reviewable redirect suggestions. A check
never silently changes or deletes a resource. Distinguish a confirmed observation
from temporary failure, blocking or an inconclusive check; do not call every fetch
failure a dead link.

The collection owner reviews the original address, proposed destination, redirect
chain and check time, then approves or dismisses the suggestion. Approval requires
a nonblank plain-text note explaining why the saved address is being changed.
Store that note with the approver, time and old/new address in the review record.
Approval updates
only the selected saved resource, retaining its immutable ID, position, tags and
original added-by attribution. Record who approved the change separately. Refresh
resolved metadata for the new address using the normal lookup path.

This **amends ADR-0007's immutable-address rule only for an explicitly approved,
backend-validated redirect suggestion**. General URL editing remains unavailable;
generic resource PUT/PATCH requests cannot change URLs, even with a reason note.
Use a dedicated approval command tied to an existing redirect review; its destination
comes from that review, never an arbitrary replacement URL in the request.
Link titles remain resolved rather than typed. Monitoring, previewing and following
redirects during metadata fetching do not count as approval.

The backend rechecks current owner authority, entitlement, resource version,
original URL, suggestion validity, the required explanation and destination safety before applying an
approval. Handle retries idempotently. Stale or duplicate destinations produce an
actionable conflict, not silent replacement or merging. A redirect can lead to a
different page; approval is not proof of equivalent content or safety.

## Consequences and remaining decisions

This extends ADR-0028's paid features. Existing free metadata retrieval and basic
URL validation remain free. Owners receive monitoring updates; audience-wide
notifications are not implied. Cadence, monitored-link allowances, retry thresholds,
notification channels/grouping, the explanation length limit and expiry/grace
behavior remain to be specified. The note requirement is settled, not optional.

No implementation or commercial detail is added to the portfolio or notebook.
See [link health](../design-docs/link-health.md),
[monetization](../design-docs/monetization.md) and
[delivery plan](../exec-plans/active/evaluate-curation-and-paid-services.md).
