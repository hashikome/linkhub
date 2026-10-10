# ADR-0012: Bulk import through reviewed drafts

**Status:** accepted  
**Date:** 2026-10-08

New destination visibility is amended by [ADR-0028](0028-free-public-curation-paid-private-sharing.md):
public by default with a private choice before commit. Drafts remain private;
bookmarks/CSV import remains free. This default is not yet implemented.

## Context

Imports wrote every parsed row straight into one collection and reported
failures afterwards, keeping whatever title the file carried. That contradicted
resolved titles (ADR-0007), gave people no chance to fix or drop bad rows before
they landed, and forced a whole bookmarks tree into a single collection.

## Options considered

- One-shot import with a per-row report (the previous behaviour).
- Client-side preview that submits only the rows that pass.
- A server-side import draft, reviewed and then committed in steps.

## Decision

Bulk import is Save a link at scale. Imported links are staged in a
server-side draft owned by the account, checked by the same rules as any save,
with titles resolved in the background; the person reviews and fixes the draft,
chooses destinations, and commits ready rows while the rest wait. Nothing is
written straight into a collection from a file. Journey, statuses, folder
mapping and limits: [bulk-import.md](../design-docs/bulk-import.md).

## Rationale

- One rule for every link that enters the product, whether one or a thousand.
- Mistakes are fixed before they reach a collection, not cleaned up after.
- Folder structure carries over as guides (sections) or splits into
  collections, so one browser export serves any arrangement.
- Network-bound title lookups never run inside the write lock or a request.

## Constraints to preserve

- No import path accepts a title; titles always come from the page.
- Nothing reaches a collection before the person chooses to import.
- Drafts are private to their account and expire; they hold only what the rows
  need (addresses, tags, folder paths, statuses), never page content.
- Destination writes go through the normal collection policy and write lock;
  importing is idempotent per row.

## Links

- [bulk-import.md](../design-docs/bulk-import.md)
- [ADR-0007](0007-resolved-titles-read-only-items.md)


## Owner-only import amendment — 2026-10-09

Imports are owner management under the clarified
[optional-hub boundary](0018-people-and-hubs-are-separate.md#import-and-bookmark-boundary-amendment--2026-10-09).
This replaces contributor import access: the destination policy must require
management authority, including when committing reviewed drafts. Imports require
an existing personal hub and never create one implicitly; the future import
page guides explicit creation. Ordinary contributions and account-owned
collection bookmarks remain available without a hub.
