# Distinguish resource links and load desktop resources while scrolling

## Purpose / Big Picture

Resource titles turn blue only when hovered or keyboard-focused, without
underlines or repeated chevrons. Scrolling near the bottom of the desktop reader
loads the next resource batch. Mobile/short viewports retain a centered More
resources link so discussion below the list remains reachable.

## Progress

- [x] (2026-10-12) Confirmed direction and inspected disclosure/pagination code.
- [x] (2026-10-12) Implemented title hover/focus, centered continuation and
  desktop scroll loading using existing pagination/failure handling.
- [x] (2026-10-12) Passed 14 distinct production-browser journeys across two
  runs, including the corrected visual test; inspected actual collection at all
  four widths and production loading evidence.
- [x] (2026-10-12) Passed the full isolated standard gate, including all 41
  web tests and the corrected operations fixture; dev-preview acceptance passed.

## Surprises & Discoveries

The first standard gate hit the existing held-collection pagination test's
five-second timeout. The test queried the unified managed-collection list,
walking every earlier suite's records with page size two. Its five fixture rows
now sort ahead of previous records, and the test reads their three pages while
retaining uniqueness, private-content and unrelated-cursor assertions. No backend
implementation changed. The fixture must use the current timestamp, since the
cursor's snapshot cutoff excludes future records. The focused operations suite
now passes all 25 tests (169 assertions); the pagination case takes 362ms.
The full standard gate then passed; the corrected case completed in 412ms
amid the accumulated suite data.

The current title hover rule explicitly removes both color and underline feedback.
The shared PaginatedList also manages Discover/hub paging; automatic continuation
must apply only inside a resource sheet. The desktop scroll layout requires both
1024px width and 600px height. Existing working-tree edits belong to earlier
reviewed work and must be preserved.

## Decision Log

- 2026-10-12 / user: Blue title hover, no underlines or chevrons; avoid repeated
  visual noise while keeping inline expand/collapse and all current actions.
- 2026-10-12 / user: Automatic loading in the desktop panel, centered manual
  loading on mobile. Preserve native links and manual keyboard/retry access.
- 2026-10-12 / implementation: Trigger on downward scrolling near the panel end,
  not initial rendering, resizing, or collapsing groups. Keep a manual fallback
  for short/collapsed lists and keyboard users. Errors require deliberate retry;
  never automatically repeat a cursor. No authorization or API contract change.

## Outcomes & Retrospective

Completed locally and ready for review. Resource titles have local blue
hover/focus feedback, desktop scrolling appends resources, and mobile keeps a
centered manual control. Native anchors, inline details, copy, text selection,
focus/position and authorization boundaries remain intact. The unrelated
verification fixture now has bounded work. No commits or pushes were made.

## Context And Orientation

`apps/web/src/components/paginated-list.tsx` owns cursors, pending/error states,
append/deduplication, native links, announcements and focus restoration.
`item-disclosure.tsx` owns native details plus whitespace-click collapse and text
selection protection. `globals.css` owns reader sizing and resource feedback.
Browser acceptance lives in `apps/api/test/browser/reading.browser.ts`.

## Plan Of Work

Adjust only resource-title feedback and sheet continuation alignment. Subscribe
to the sheet's scroll events with the CSS desktop breakpoint. Reuse existing
pagination and failure behavior. Add focused browser coverage for automatic vs
manual loading, duplicate request prevention, error recovery, position/focus,
hover/focus and unchanged disclosure behavior. Update owning design docs.

## Concrete Steps

Run from the repository root, with the active dev server left intact:

- `TMPDIR="$PWD/test-results/t" bun run verify:isolated test:browser --test-name-pattern 'resource reader|reads collection references|loads more, keeps focus|keeps same-tab resource navigation'`
- `TMPDIR="$PWD/test-results/t" bun run verify:isolated`
- `TMPDIR="$PWD/test-results/t" bun run verify:isolated test:dev`

## Validation And Acceptance

Titles have local blue feedback with no underline/chevron; whitespace still
toggles details and links/copy remain independent. At 1280/1440px downward
scrolling loads one next batch without moving focus or existing items. At 390/
768px and short desktop heights only manual activation loads more. Errors stop
automatic loading and expose existing retry/cooldown. Native pagination works.
Inspect populated, loading, error, focus and long-content screenshots.

## Idempotence And Recovery

No migration, data mutation, new dependency, or public deployment. Isolated
checks own their temporary databases and build output. Preserve existing
next-env.d.ts and unrelated edits; do not rebuild the active root .next.

## Artifacts And Notes

Browser evidence: `test-results/resource-interaction-browser.log` (seven pass,
one new visual assertion sampled mid-transition); the assertion now checks the
settled state using reduced motion. `resource-interaction-final-browser.log`
passes that journey and six additional regression journeys (seven pass, zero
fail, 113 assertions). The unchanged automatic-request/cooldown journey passed
in the first run. Actual local collection screenshots at 390/768/1280/1440px are
in `test-results/resource-interaction-preview/`, with a scoped visual review.
Standard gate and dev-preview logs: `test-results/resource-interaction-final-verify.log` and
`test-results/resource-interaction-dev.log`. Focused backend proof:
`test-results/resource-interaction-operations.log`.

## Interfaces And Dependencies

Existing cursor API, browserRead, native details/anchors and browser scroll/media
APIs. No API authorization or external-resource destination preference changes.
