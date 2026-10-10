# ADR-0021: Capture bounded effects for core audit actions

**Status:** accepted  
**Date:** 2026-10-09

## Context

After deferring comprehensive audit design (ADR-0020), the user requested a useful
minimum and explicitly chose capturing core changes now. A filter/label-only pass
was rejected: an action name does not prove its actual effect or distinguish a
repeated command from a change.

## Decision

Capture nullable before/after state and success/no-change outcome for publication,
share-link enable/disable/rotation, direct-access changes and ownership transfers.
Read previous state under the mutation lock; write the evidence in the same
transaction. Sharing state includes the grant source as well as role. Transfer
evidence retains source/destination hub IDs in both hubs. Rotation records the
replacement action and result without token/hash values.

This narrowly amends ADR-0015's IDs/actions-only contract to include bounded state
tokens and outcomes. No names, email, authored content or arbitrary JSON snapshots
are added. The writer validates states against the action. Legacy records remain
unknown, with no inferred backfill. Other content changes retain their existing
action-only evidence until their later design.

The UI reads existing service effects/reasons, distinguishes no change, and selects
the target by action semantics (a transferred collection, an invitation, an item).
An affected share recipient is part of the change context, not a replacement for
the collection being changed. Missing comment IDs are not substituted with their
parent collection or author. Current usernames may label immutable actor IDs;
they are not historical snapshots. UUID copying remains available.

Default the web to actions/decisions; keep recorded reads accessible through All
events or an explicit action filter. Filter in the API before pagination and bind
the effective view to the cursor. Existing API callers without a view continue to
receive all events. Service read denials remain visible in the actions view.

The filter form has one Search field, Action and From/To dates, plus an Include
read events checkbox. Following the user's review, Search matches displayed
actor usernames/IDs, action labels, target IDs, outcomes and recorded changes,
including partial IDs and multiple words. It does not search email, hidden hub
handles or authored content. Shared display labels keep API matches aligned with
the reader. All words must match somewhere in the row, case-insensitively;
punctuation is literal. Date filters handle viewer-local dates separately.
The API applies authorized scope, search and other filters before limiting rows;
the normalized query remains bound to the cursor. Current usernames may change
between reads. Explicit actor/target/hub API filters remain available for stable
identity lookup; row-content search does not rewrite a username into an ID.

Show event times as `YYYY-MM-DD HH:mm:ss` in the viewer's current timezone, with
correct date rollover and no per-row offset arithmetic. UTC remains authoritative
in storage and machine-readable timestamps. Without JavaScript, the server uses
UTC and labels that fallback once.
Date ranges use viewer-local day boundaries, including date-specific daylight
saving offsets; native submissions use the labelled UTC fallback.

## Consequences

This is a limited evidence-capture slice permitted by the user's later instruction,
not a replacement for ADR-0020's deferred milestones. General field diffs, content
snapshots, comprehensive coverage/integrity/retention design and wide events remain
deferred. Existing service session records prove command success, but do not record
session counts; account state is not presented as the session change.

## References

- [ADR-0015](0015-attribution-from-activity-records.md)
- [ADR-0020](0020-logging-after-core-operations.md)
- [Attribution and activity](../design-docs/attribution-and-activity.md)
