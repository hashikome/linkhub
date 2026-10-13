# ADR-0048: Keep the current view during ordinary navigation

**Status:** accepted
**Date:** 2026-10-11

Partially superseded by [ADR-0064](0064-client-navigation-and-interactive-forms.md):
client navigation and asynchronous forms replace mandatory native-first/JS-free
interaction and full-document reloads. Other decisions remain binding.

## Context

The web client hid the whole document after an ordinary navigation remained
pending for 300ms. Development compilation made this frequent, and the user
reported that the repeated blank loading screen made the app feel unresponsive.
A pending read does not itself invalidate the currently authorized document.

## Decision

Keep the current view visible while a same-origin link or GET form loads the
next document. Use the browser’s native loading feedback, without an app spinner
or delay message. Each destination still renders
through fresh backend authorization; native navigation and no-store policies
remain in place. Do not introduce shared content caching or sensitive prefetching.

Retain concealment for mutation submissions, session-change/long-away
revalidation, and history restoration. Escape cancellation still conceals the
old document and offers fresh-authorized reload recovery. A slow response alone
is not a failure and does not produce an app notice. Actual page failures keep
their existing error and retry views.

This supersedes the blanket concealment rule for ordinary GET navigation in
[the interface system](../design-docs/web-interface-system.md), while retaining
its session and stale-history protections.

## Consequences

Routine navigation preserves visual context. Cold development compilation still
adds latency; this change does not claim to remove it. Manage reuses the existing
request-scoped session read, and independent import summary/row reads run in
parallel. These optimizations do not retain authorization across requests.

The browser regression delays a document response, checks that the current
heading stays visible, then cancels and verifies reload recovery both with and
without revoked access.
