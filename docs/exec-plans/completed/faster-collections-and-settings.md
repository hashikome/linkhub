# Faster collections and Settings

## Purpose / Big Picture

Make collection links usable without waiting for discussion, and render only
Settings sections the user has opened. Preserve drafts, authorized reads, keyboard
operation and existing layouts. Measure useful content and completed discussion
separately so loading placeholders cannot count as a performance improvement.

## Progress

- [x] (2026-10-13) Owner authorized documentation and implementation after reviewing
  the client-navigation benchmark. Inspected reader and Settings dependencies.
- [x] (2026-10-13) Separate discussion rendering from authorized resources; delayed
  and failed discussion, posting/replies, pagination and sizing checks passed.
- [x] (2026-10-13) Split Settings sections and populate timezone choices on focus.
  Existing failed/newer draft, handle save and timezone persistence checks passed.
- [x] (2026-10-13) Repeat paired production benchmarks with corrected browser-frame
  timing; review 390 px and 1280 px Settings screenshots with no overflow.
- [x] (2026-10-13) `bun run verify:isolated` passed (418 passing tests across the
  gate, lint/format/type/docs/boundary checks and production build). Handbook
  source, strict MkDocs and generated-site checks passed.
- [x] (2026-10-13) Final focused production browser acceptance passed: 17 tests,
  311 assertions, zero failures, including all four critical journeys.

## Surprises & Discoveries

The earlier assertion-polled slow fixture measured about 959 ms for collection
navigation and 937 ms for Settings; the corrected measurement below supersedes
those absolute times. Settings has one API read (median roughly 6 ms in that
fixture); server database time does not explain most of the delay. Collection
metadata is fetched first; reader resources, hub, discussion and session then
run concurrently but one Promise.all blocks the entire reader. Settings renders
all hidden sections and hundreds of timezone options on entry.

The repeated baseline request timing shows route JavaScript discovered after
the server response begins (Settings about 32 KB additional script). The first
isolated installation exceeded the /tmp quota; task-owned builds moved to
ignored `ref/reader-performance/`. No unrelated files or services were removed.
Streaming requires JavaScript to reveal deferred discussion; obsolete JS-free
discussion/picker test variants were removed under the accepted ADR-0064 scope.
Saved timezone rendering is still checked on another device before hydration.

The first implementation split Profile into a dynamic import as well. The paired
benchmark exposed a new dependent script request and local Settings median rising
from about 96 ms to 416 ms. Keep the default Profile code eager; defer only optional
sections. This avoids trading less initial work for a delayed primary form.

The new multi-section history test exposed document replacement when Back
refreshed a section URL written through manual history. Deferring refresh alone
did not resolve it. Settings now uses router-managed section navigation and keeps
its editor in a persistent route-group layout, keyed by authorized user ID.
History still revalidates access; no persistent browser draft cache is added.

The request trace also exposed quantized slow-route timings caused by backed-off
Playwright assertions. The final paired comparison records page-content readiness
on browser animation frames, including fonts and two paint frames. Both existing
production builds are remeasured with the same corrected harness; their absolute
times are not comparable with the earlier assertion-polled report.

## Decision Log

- 2026-10-13: Keep existing backend authorization and no-store contracts. Stream
  discussion behind its own Suspense boundary after authorized primary content.
- 2026-10-13: Mount Settings sections on first use and retain visited sections
  while Settings stays mounted. Shared draft/save state must preserve fields
  absent from the DOM; omitted fields must never become empty updates.
- 2026-10-13: No private-page prefetch or caching changes in this milestone.

## Context And Orientation

`apps/web/src/components/collection-reader.tsx` composes resources and discussion.
`profile-editor.tsx` owns profile/hub drafts, autosave and section navigation;
`app/settings/(editor)/layout.tsx` now supplies the authorized profile and retains
the editor across section query changes, keyed by user identity. Security remains
outside that route group. The optional
`apps/api/test/browser/navigation-performance.ts` runs actual production builds
with synthetic data. Prior baseline evidence lives in the completed
`smooth-client-navigation.md` plan.

## Plan Of Work

Extract async collection discussion without delaying its request start. Keep
resources gated by their own authorization. Split Settings fields into sections,
load inactive code/controls on demand, retain draft values through pending saves
and section navigation, and reduce repeated timezone markup. Add browser
regressions for delayed/failed discussion and cross-section drafts. Extend the
benchmark with explicit useful-content/full-discussion checkpoints and sanitized
request timings, then compare the preserved pre-change snapshot with this work.

## Concrete Steps

From the repository root, run focused production browser tests using
`bun run verify:isolated test:browser --test-name-pattern ...`. Run the opt-in
navigation benchmark on both snapshots with identical fixtures and conditions.
Finish with `bun run verify:isolated`, review screenshots and source diffs.

## Validation And Acceptance

- Collection links appear and work while discussion is still pending; discussion
  failure does not replace the reader. Comments, replies and fragment links work.
- Opening Settings renders its selected section. Switching preserves edits,
  autosave, retries, handle rename and appearance controls without document reload.
- Deep links and Back/Forward select the correct section. Authorization and
  history/session revalidation remain intact.
- Compare ten samples per journey in normal/throttled production builds; include
  regressions and distinguish usable content from background completion.

## Idempotence And Recovery

No data migrations, live writes, deployment or secrets changes. Preserve prior
uncommitted work. Build/test in isolated checkouts; leave local dev services alone.

## Outcomes & Retrospective

The implemented reader makes resources usable while discussion resolves independently.
Settings renders the active section, loads optional sections on demand, keeps visited
sections and drafts mounted, and expands timezone choices only when used. The default
Profile section remains eager. No schema, authorization, API or caching change.

The paired benchmark compares the preserved **pre-milestone working tree** (which
already includes the earlier client-navigation/UI work) against this implementation.
It does not compare with committed `6fb4cd3` or with production on hs. Each cell is
the median of ten samples in milliseconds:

| Journey | Before, local | After, local | Before, throttled | After, throttled |
| --- | ---: | ---: | ---: | ---: |
| Collection resources ready | 137.3 | 104.6 | 540.4 | 523.5 |
| Collection discussion ready | 203.8 | 171.2 | 600.8 | 586.2 |
| Settings Profile ready | 88.9 | 62.9 | 602.5 | 538.2 |
| Home → About | 63.5 | 58.6 | 420.7 | 411.2 |
| Cold homepage | 307.5 | 211.4 | 3981.1 | 3934.1 |
| Theme visible | 37.2 | 31.7 | 54.3 | 51.7 |
| Theme saved | 70.8 | 67.3 | 432.5 | 429.0 |

Collection first content improved about 24% locally and 3% throttled; Settings
about 29% and 11%. Largest observed collection samples were 162.0→118.6 ms locally
and 563.7→534.2 ms throttled; Settings 103.5→85.5 and 640.3→550.6 ms. Ten repetitions
are descriptive, not a tail-latency guarantee. Background journeys and cold-home
variation are controls, not changes attributable solely to this implementation.
Streaming's failure-isolation benefit is established separately by holding and
failing discussion responses while keyboard-operated resources remain usable.

Conditions: Bun 1.3.14, Chromium 153.0.8010.12, Intel i7-1165G7 workstation, production
Next builds, warm loopback HTTP server with identity encoding, fresh browser context
per repetition, synthetic 26-collection / 22-resource fixture. Throttling adds
150 ms network latency, 200,000 B/s download, 93,750 B/s upload and 4× browser CPU.
Navigation checkpoints use synchronous animation-frame DOM checks, fonts and two
paint frames, rather than Playwright assertion backoff. Cold entry/theme retain
their prior checkpoint method. Discussion readiness is sampled after primary
content; it means visible discussion, not every network request completed.
Captured response bytes are bytes completed at that checkpoint, not total payload.
No client navigation or theme sample replaced its document. This does not establish
live production performance or resolve the earlier three-second live observation.

Verification: `bun run verify:isolated` passed with 418 reported passing tests,
format/lint, boundary/docs checks, typechecking and the production web build.
Final production-browser acceptance passed 17 tests / 311 assertions, including
all four critical journeys, history/session authorization, owner/hubless Settings,
failed and newer drafts, independent handle saves, timezone persistence, discussion
posting/replies/pagination/sizing, held/failed discussion, lazy sections and safe
unvisited-field saves. The focused runner reused the measured production build;
its only local wrapper change omitted rebuilding that already-verified snapshot.
Mobile 390 px and desktop 1280 px screenshots were reviewed; no horizontal overflow.
Handbook source, strict MkDocs and generated-site checks passed (49 pages).

The accepted contract is promoted to the web interface/product design documents,
verification runbook, changelog and handbook architecture. Temporary builds and
superseded diagnostic runs were removed after recording these outcomes. Retained
local evidence has the owner and exit condition below. All earlier uncommitted
work and active development services were preserved.

Local implementation only; no commit, push, deployment or live acceptance in this
milestone. The user’s acceptance of the earlier client-navigation experience does
not establish acceptance of this follow-up on the deployed service.

## Artifacts And Notes

Sanitized final samples are in ignored `ref/reader-performance/before-measured/`
and `after-measured/`, with per-file source hashes in `source-manifest.json` and
390/1280 px Settings screenshots in `checks-final/`. Owner: this milestone;
purpose: local review and reproducible comparison provenance; retire when the next
accepted benchmark supersedes it. Durable results are fully recorded here.

The source manifest covers application source, shared config/types/email code,
web package/Next configuration and lockfile. Aggregate before SHA-256:
`ccdf89127ec77c4929868dfcf127f555cdb627ee8ea0a2b3d953a9f79570d85c`;
after and working application source match:
`7ca434760db001c6271002b800f54cd59fbd48b540f04a2e6116f985ddf57077`.
Intermediate polling/invalid measurements and temporary build snapshots were removed;
only the corrected paired measurements above are acceptance evidence.

## Interfaces And Dependencies

Next.js App Router and React Suspense, existing Profile and CommentThreads wire
types, existing form endpoints. No added dependencies or persistent client cache.
