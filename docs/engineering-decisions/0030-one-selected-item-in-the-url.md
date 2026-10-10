# ADR-0030: One selected item in the collection URL

**Status:** accepted  
**Date:** 2026-10-10  
**Amends:** [ADR-0027](0027-section-context-and-inline-details.md), item expansion and global controls only.

## Context

Inline disclosures allowed several item details to remain open, while the URL
still identified an earlier item. The product owner wants the address to identify
the current selection and a shared item address to open at that item. Multiple
expanded items make that selection ambiguous.

## Decision

Each collection has at most one expanded item. Opening another closes the previous
one. Native exclusive disclosure groups preserve this behavior without JavaScript.
With JavaScript, opening an item replaces the current URL's `item` parameter;
closing it removes the parameter. Preserve the collection address, access token,
sharing attribution and other query parameters. Replace the history entry so
browsing item details does not add a Back step for every toggle.

Direct `?item=<id>` links authorize and render the selected item on the backend,
including when it is beyond the loaded page. The client scrolls the opened item
into view. Without JavaScript, the server still opens the item and generated item
permalinks include an anchor for scrolling.

The original Expand/Collapse toolbar is superseded by
[ADR-0031](0031-direct-disclosures-without-global-controls.md). Collapsing a section
with JavaScript also closes its selected item. Descriptions remain visible beneath
collapsed section headings. Links keep
normal navigation; non-interactive item content toggles details, and text selection
must not collapse the item.

## Tradeoffs

This supersedes ADR-0027's multiple open item details and global expansion of all
item details. Readers lose simultaneous inline comparison in exchange for a clear,
shareable current selection. Section visibility remains independent. URL updates
and query-only automatic scrolling are progressive enhancements; native summaries
and explicit permalink anchors remain usable without scripting.

## References

- [Collections and resources](../design-docs/collections-and-resources.md)
- [Product](../../PRODUCT.md#63-collections-and-guides)
