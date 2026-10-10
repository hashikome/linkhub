# ADR-0032: Relational item and collection tags

**Status:** accepted  
**Date:** 2026-10-10

## Context

Authored collection tags duplicated item labels, while a separate item-tag count
made the header ambiguous. The product owner chose the unique set of item tags
as the collection's tags, explicitly stored as a relation rather than calculated
at read time, and then requested a shared normalized-name catalogue.

## Decision

Use `tags(id, name)` with UUIDv7 identities and unique normalized names;
`item_tags(item_id, tag_id, position)` for item assignments; and
`collection_tags(collection_id, tag_id, item_count)` for the stored union.
Both association tables enforce unique pairs. `item_count` is internal
synchronization state so a tag survives removing one of several tagged items.
Database triggers adjust it in the item mutation transaction, including deletes
and rollbacks. Collection reads include their stored tags without scanning items.

Collection tags are ordered by `item_count` descending, then name ascending for
ties. The reader's three-tag preview therefore reflects the collection's most-used
tags. Counts stay internal, scoped to this collection, and each item counts once
per tag. Item tag order remains unchanged.

API item tags remain arrays of normalized names. Collection tags are read-only;
create/update requests reject them. Tags on reference items count, but tags inside
reference destinations are never traversed. Existing heading tags are preserved.
The migration normalizes/deduplicates existing item labels, preserves order,
backfills both relations and removes the old arrays. Independently authored
collection labels are retired, not assigned to arbitrary items.

The shared catalogue is internal. It provides no public listing, usage counts or
cross-account suggestions, and grants no access. Unused names may remain reusable;
no new cleanup job or public search feature is introduced.

## Tradeoffs

Extra relational writes and triggers replace simple arrays. In exchange, names
have a single identity and collection reads need no aggregation. Trigger behavior,
concurrent assignments, rollback, cascades and backfill require regression coverage.
This replaces the previous array-storage and independent collection-label design.

## References

- [Collections and resources](../design-docs/collections-and-resources.md#tags)
- [Execution plan](../exec-plans/completed/store-collection-tags.md)
