# ADR-0027: Section context and inline item details

**Status:** accepted  
**Date:** 2026-10-09

## Context

Heading resources appeared as title-only items with a Details dialog that added
little context. Readers need sections to explain and organize a guide, and to
open link metadata without leaving their place. The product owner chose optional
500-character plain-text descriptions and at least one link or reference per
section.

## Decision

Keep the flat ordered-resource model. A heading starts a section containing all
subsequent non-heading items until the next heading. The API creates a section
before an existing item identified by immutable ID and expected version; it shifts
positions atomically. Creation, movement, removal and reordering reject any result
with an empty section. Removing a heading keeps its items. Existing development
content is preserved; no heading or item is silently removed.

Descriptions belong only to headings, are trimmed, and are limited to 500
characters in the backend. Empty text clears the description. Owners and direct
contributors may edit them using optimistic versions. This **amends ADR-0007's
editable-field restriction**: authored section descriptions are editable context;
heading titles, link addresses and reference targets retain their fixed contract.
Link descriptions continue to come from fetched metadata.

Section descriptions stay visible below their heading when items collapse. Native
HTML disclosures expand sections and link/reference details inline, without a
dialog or navigation. JavaScript originally added Expand and Collapse for both levels, including
subsequently loaded items. This multi-item expansion behavior is superseded by
[ADR-0030](0030-one-selected-item-in-the-url.md): one selected item stays aligned
with the URL. [ADR-0031](0031-direct-disclosures-without-global-controls.md)
subsequently removes global expansion controls. Item permalinks retain `?item=<id>` on both
collection addresses and open authorized context inline even beyond page one.
Pagination returns the preceding section as context when a page starts inside it.

The Reorder surface uses compact relative moves, resolved against the current
order in the backend. Moving a section carries its items, including those outside
the visible page. Individual moves may change section membership but cannot leave
a section empty. Full-order and relative moves advance optimistic versions;
compact commands fit the existing account-bound sign-in continuation. Native
Move up/Move down forms remain available alongside drag-to-place-before.

## Alternatives and tradeoffs

Separate section membership tables would add migration and reorder complexity
without changing the ordered-guide model. Positional sections preserve existing
content, but inserting a heading shifts subsequent items and their versions.
Empty draft headings would simplify authoring but contradict the agreed minimum;
users first add an item, then wrap existing items with a section. Native
disclosures provide keyboard and no-JavaScript behavior; global reset controls
are an enhancement. Inline metadata replaces the earlier modal detail design.

## References

- [Collections and resources](../design-docs/collections-and-resources.md)
- [ADR-0007](0007-resolved-titles-read-only-items.md)
- [Product](../../PRODUCT.md)
