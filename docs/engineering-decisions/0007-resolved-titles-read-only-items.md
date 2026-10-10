# ADR-0007: Link titles are resolved, never typed; what belongs to an item is read-only

**Status:** accepted; editable context amended by [ADR-0027](0027-section-context-and-inline-details.md)

**Date:** 2026-10-07

[ADR-0029](0029-link-health-and-approved-redirects.md) also amends the immutable
address rule for owner-approved redirect suggestions only (implementation pending).
General PUT/PATCH address editing remains unavailable; the dedicated redirect
approval requires a recorded explanatory note.

## Context

Typed titles drift from the real page and add input friction; editable addresses
and titles make a saved link no longer the thing that was saved.

## Options considered

- Editable title and URL
- Server-resolved title; address, title, target and heading text fixed once saved

## Decision

A link's title comes from its page, resolved by the server; no path that adds
or edits a link accepts a title. What belongs to an item (a link's address and
title, a reference's target, a heading's text) never changes after saving;
people edit only what they add (tags, order, planned notes), and a wrong link is
removed and added again. How titles are found:
[collections-and-resources.md](../design-docs/collections-and-resources.md).

## Rationale

- Inputs are only what people truly have to type.
- Personal context belongs in a note, not a rewritten title.

## Constraints to preserve

- Add/edit DTOs have no title field for links or references; edits accept tags, position and heading-only descriptions (ADR-0027).
- Resolved titles never block a save; lookups run after commit.
- Imports resolve titles like every other save (ADR-0012).

## Links

- [collections-and-resources.md](../design-docs/collections-and-resources.md)
- [PRODUCT.md](../../PRODUCT.md)
