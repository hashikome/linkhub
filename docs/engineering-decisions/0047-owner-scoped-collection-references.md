# ADR-0047: Same-owner collection references through ordinary link capture

**Status:** accepted

**Date:** 2026-10-10

## Context

Collections organize an owner's library. Cross-owner structural references add
lifecycle obligations without enough benefit over bookmarks and ordinary URLs.
Adding another creation control would make people choose storage mechanics.

## Decision

Use **Add a link** for every address. The backend recognizes exact configured
web-origin collection routes (`/c/:id` and `/@handle/:slug`), resolves a current
collection and stores its immutable ID when source and target share a hub, the
actor can write the source (owner or contributor), and can independently read
the target. The target must differ from the source. Share tokens in the pasted
URL are never used as reference authority. Same-owner cycles remain allowed.

Foreign, unreadable, missing and self destinations remain ordinary URL items.
They get a generic **Collection** hint based on the address pattern, without
implying availability or revealing private metadata. No reference tracking,
cleanup or notification obligations attach to those ordinary URLs. Local
application collection routes are accepted in development but never fetched by
the metadata worker. All other addresses retain public-host validation.

The explicit reference API obeys the same ownership, write and read checks.
References never inherit access. Legacy cross-owner reference rows are rendered
unavailable; an owner cannot silently delete another owner's source resources.

Before deleting a collection, show the owner's incoming references that will be
removed and any section headings that would become empty. Before transferring,
include incoming and outgoing references that would cross the ownership boundary.
Keep other collections, ordinary URLs and other items. The owner can keep the
collection or explicitly confirm. An opaque impact fingerprint binds confirmation
to the displayed target and affected content; changed impact returns a conflict
and a fresh preview. Web confirmations always include it; API calls may omit it
only when there are no affected references. Cleanup, audit and lifecycle changes
commit atomically. Interrupted confirmations remain bound to the original account.

## Supersession and rationale

This supersedes the earlier cross-owner creation, pasted-URL-always-external and
deleted-target-placeholder behavior in the collections design and product
contract. ADR-0008's no-inherited-access and no-private-metadata rules remain
binding. ADR-0007's immutable target and server-resolved title rules remain binding.
ADR-0027's nonempty sections are preserved by previewed heading cleanup.

The 2026-10-11 ADR-0012 amendment supersedes the previous top-level-only
bookmark mapping: automatic imports also create same-owner references between
branch collections. These use the same independent access and lifecycle rules.

## Validation

API tests cover source/target authorization, aliases, replay, ordinary-URL fallback,
metadata privacy, stale previews, transfer and atomic rollback. Browser tests
exercise the single link-saving flow and lifecycle confirmation with and without
JavaScript. No schema migration or user-data reset is needed for this decision.

## Links

- [Collections and resources](../design-docs/collections-and-resources.md)
- [References grant no access](0008-references-grant-nothing.md)
- [Section invariants](0027-section-context-and-inline-details.md)
