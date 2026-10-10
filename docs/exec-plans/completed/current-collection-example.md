# Show the current collection reader on the homepage

## Purpose / Big Picture

Visitors can explore a compact, clearly labelled collection example that uses
the same metadata, sections and item details as a real collection. Section
headings toggle their contents and resource titles open external links.

## Progress

- [x] (2026-10-10 09:00Z) Compare the old homepage mockup with the current reader.
- [x] (2026-10-10 09:00Z) Reuse reader components with isolated preview behavior;
  document the change and add browser coverage.
- [x] (2026-10-10 10:05Z) `bun run verify` passed; six focused browser tests
  passed, including real reader regressions with and without JavaScript.
- [x] (2026-10-10 10:06Z) Final layout build and both homepage browser tests
  passed; reviewed 390/768/1280/1440 screenshots. No isolated test servers remain.

## Surprises & Discoveries

- An initially expanded real item scrolls into view and records its selection in
  the URL. A homepage example must suppress both effects, including hydration's
  initial native toggle event.
- The old centered, shared grid rows moved the headline when the example changed
  height. Giving the intro a content-sized row, allowing extra example height only
  in the second row, and anchoring both columns with viewport-based top spacing
  keeps interactions independent without changing mobile reading/tab order.

## Decision Log

- Decision: Use presentation-only fictional data with shared reader components.
  Rationale: Keep the example current without fetching nonexistent records or
  adding product business logic to the client. Omit the full sidebar and sharing
  actions at this scale. Date/Author: 2026-10-10 / Codex.
- Decision: Show two real external destinations in one section.
  Rationale: Every resource title can work as the user requested, while a
  fictional collection reference would lead nowhere. Date/Author: 2026-10-10 / Codex.

## Outcomes & Retrospective

The shared-component preview is implemented and the canonical gate passed.
The final layout preserves mobile DOM/tab order while holding the desktop left
content still. Browser regression tests, final responsive checks and screenshot
review passed. No remaining implementation work; all temporary servers closed.

## Context And Orientation

`apps/web/src/app/page.tsx` formerly contained a separately styled static example.
`components/collection-example.tsx` now composes `CollectionMeta`, `Tags` and
`ResourceSections`. The latter renders `ResourceRow`, `ItemDisclosure` and
`ItemDetails`, also used by the real reader. A default-off preview prop suppresses
fictional identity links, item permalinks, URL updates and initial scrolling.

## Plan Of Work

Replace the static figure, keep its existing sheet styling, and add only preview
presentation behavior to shared components. Preserve actual reader defaults.
Update focused web design docs and the changelog. Verify real-reader regressions
as well as keyboard, no-JavaScript and responsive example behavior.

## Concrete Steps

Run `bun run verify` in a disposable checkout to keep the user's development
build untouched. In a separate disposable checkout run
`TEST_DIRECT_API=1 bun run test:browser -t 'introduces the product|explore the collection example|opens items beyond|creates sections'`.
Both checkouts retain the normal repository test setup and cleanup. Inspect
screenshots at 390, 768, 1280 and 1440 pixels in light and dark themes.

## Validation And Acceptance

- One item starts expanded; arriving does not scroll or change the URL.
- Sections and items toggle with pointer and keyboard, including without JS.
- Resource titles navigate to working external destinations; no fictional record
  is linked or fetched. Original reader selection and navigation still work.
- No horizontal overflow at mobile/tablet/desktop sizes or enlarged text.
- The desktop headline, CTA and discovery stay fixed when the example changes.
- The canonical verification gate passes and test servers stop afterward.

## Idempotence And Recovery

No migrations or external state changes. Builds and isolated tests are repeatable.
Do not run test servers on the user's development ports or stop their processes.

## Artifacts And Notes

Browser screenshots are temporary review evidence in `/tmp/landing-*.png`.
Verification: `/tmp/nslinkhub-example-verify.log` (canonical gate),
`/tmp/nslinkhub-example-browser.log` (six preview/reader tests), and
`/tmp/nslinkhub-example-final-browser.log` (final build and two homepage tests).
Refactoring UI Chapter 2 (hierarchy), Chapter 3 (layout and spacing) and taste
section 5 (interaction states) guided the compact preview. The initial review's
three issues were outdated attribution (medium), static imitation of reader
controls (medium), and disclosure-induced movement of the main action (high).
All were addressed through shared components and independent row sizing.

Visual review uses `/tmp/landing-light-390.png`, `/tmp/landing-dark-768.png`,
`/tmp/landing-dark-1280.png`, `/tmp/landing-light-1440.png`, and
`/tmp/landing-example-collapsed-true.png`. Hierarchy, grouping and readability
remain clear; metadata and tag sizes deliberately retain the existing reader
system. Keyboard, hover, expanded/collapsed and enlarged-text states were
checked. The fixed example has no loading, error, empty or disabled states.

Taste section 11 final heuristic scores (0–4): status 3, real-world match 4,
control 3, consistency 4, prevention 4, recognition 3, efficiency 3, minimalism 4,
error recovery 2, help 2; total **32/40**. These are a design judgment, not measured
usability results. The primary action stays clear, only two resource choices
appear, and detail is progressively disclosed. No further scope-relevant visual
issue was found.

## Interfaces And Dependencies

Reuse the public `Collection` and `Resource` DTOs from `@nslinkhub/types`.
Preview mode changes presentation only; existing API authorization and derived
metadata remain authoritative for real records. No new dependencies.

## Follow-up: simplify and balance the invitation (2026-10-10)

The user subsequently removed the separate discovery section. The hero now says
“Keep the links you love, find your next good read, and make a little corner of
the web your own.” Discover remains in the header. The earlier discovery-row
layout in this historical plan is superseded by the focused web interface design.

Refactoring UI Chapter 3's “Avoid ambiguous spacing” and Chapter 2's “Semantics
are secondary” informed the visual refinement: a 3rem column gap, a stable 38rem
stage centering the desktop message, and a 44px-equivalent primary action with
16px-equivalent text. The established sans-serif and theme tokens preserve a
quiet, welcoming, practical register. Mobile removes the stage height.

The three review findings were a detached discovery message (medium), an action
visually underweighted beside the preview (medium), and mismatched vertical
weight after removing discovery (medium). The final copy, action sizing and
stable desktop alignment resolve them. The preview intentionally remains
top-anchored when collapsed, honoring the requirement that interactions never
move the headline or CTA.

Final subjective heuristic scores (0–4, in the order recorded above):
3, 4, 4, 4, 4, 3, 3, 4, 2, 2 — **33/40**. The message/action grouping, progressive
disclosure and responsive reading order work well. No further issue within this
scope was found. Fixed example content needs no loading, empty or error states.

Reviewed screenshots: [phone](/tmp/landing-light-390.png),
[tablet](/tmp/landing-dark-768.png), [desktop](/tmp/landing-dark-1280.png),
[wide](/tmp/landing-light-1440.png), and
[collapsed example](/tmp/landing-example-collapsed-true.png). These images are
disposable local review artifacts. The focused browser run passed both homepage
tests; its log is `/tmp/nslinkhub-hero-balance-browser.log`.

## Follow-up: eliminate preview dead ends (2026-10-10)

The running development app exposed fictional person and item links even though
the production preview tests passed. Inspecting its compiled page revealed an
updated RSC item-details module alongside an older SSR copy without preview
handling. The live HTML reproduced both `/ada` and a synthetic `/c/:id` permalink.

`ItemDetails` now has an explicit client boundary. Preview rows never construct
or pass a durable item URL, and item details require a supplied URL before
rendering the permalink action. This preserves real-reader item links while
removing fictional navigation. Live-app Chromium checks with JavaScript enabled
and disabled both found exactly two external links and no item permalink.

The production preview and real-item regression tests passed (three tests),
as did `bun run test:dev`, which now asserts the development example has no
relative record links or item-permalink action. Temporary logs:
`/tmp/nslinkhub-preview-links-browser.log` and
`/tmp/nslinkhub-preview-links-dev.log`.


## Follow-up: relevant resources and direct demo links (2026-10-10)

The user asked to retain the expanded-item link and clarified that, in the demo,
it should open the resource itself. This supersedes the preceding preview-link
removal: both the title and “Link to this item” now open the same external URL.
Fictional people and collections still have no record links. Real collections
retain their existing item-within-collection permalink behavior.

The example is now “A web worth keeping”, with Forte Labs' PARA bookmarks article
and Maggie Appleton's digital-garden essay. Supporting copy invites people to
turn good finds into useful guides, share knowledge and discover others' work.
PRODUCT.md records the distinction between fast saving as an entry action and
curation, context and maintained collections as the product's value.

Regression checks cover both external entry points with JavaScript enabled and
disabled, independent expansion, responsive layout, and existing real-collection
item permalinks. The development lifecycle check asserts four external example
anchors, paired by resource, and closes all servers it starts.

Final verification passed: `bun run verify`, four focused browser tests (86
assertions), `bun run test:dev`, local documentation links and whitespace checks.
The running user development page also serves four correctly paired external
anchors. Reviewed the updated example at 390, 768, 1280 and 1440px in the existing
screenshot artifacts: titles wrap cleanly, the primary action remains prominent,
and the example expands independently. The earlier 33/40 visual review judgment
still applies. All temporary verification servers exited.


## Follow-up: copy the exact collection item (2026-10-10)

The user clarified the purpose of the real collection permalink: point another
reader to the exact resource within a guide. Expanded real items now offer
“Copy link to this item”, copying the absolute existing item address without
navigation. The destination retains item selection and supplied access context.
The demo's explicitly requested external link remains unchanged.

The native permalink remains usable without JavaScript. Clipboard success is
announced beside the control; failure reveals a labeled, selectable read-only
URL, and retry works. Labels are excluded from disclosure body-click toggling so
focusing the fallback input does not collapse its item. Clipboard handling is a
browser interaction; backend access policy remains authoritative.

Refactoring UI Chapter 2, “Semantics are secondary”, keeps this tertiary action
in the established text-button style. Taste sections on status, error recovery
and clear copy informed the feedback. The review addressed three issues: an
ambiguous link label (medium), self-navigation instead of sharing (medium), and
no clipboard-failure recovery (medium). No additional visual issue was found in
the normal control or copied state at 390, 768, 1280 and 1440px. Review images:
`/tmp/item-details-true-{390,768,1280,1440}.png`,
`/tmp/item-copy-success-390.png` and `/tmp/item-copy-fallback-390.png`.

Subjective heuristic scores, in the order above: 4, 4, 4, 4, 3, 3, 4, 4, 3, 2 —
**35/40**. This is a review judgment of the small interaction, not user research.
Focused browser coverage passed for the demo and real collections, including
keyboard copying, clipboard refusal/retry, unchanged current URL, copied-address
navigation, both collection routes, access tokens, pagination and no-JavaScript
fallback. Full repository verification passed.


## Follow-up: persistent expanded-item hierarchy (2026-10-10)

The user's screenshots showed that expanded details blended into adjacent rows
once hover ended. Refactoring UI Chapter 3, “Avoid ambiguous spacing”, and
Chapter 6, “Even flat designs can have depth”, informed a persistent neutral
surface, fine inset boundary and small outer gap for the native open item. This
groups the title, destination, description, attribution and copy action. It
keeps existing text alignment, theme tokens and keyboard focus rings. The rule
is shared by the real reader and demo and works without JavaScript.

The scope is visual hierarchy; section behavior and copy-link semantics remain
unchanged. Browser screenshots now move the pointer off the content before
capture so the review checks the persistent state rather than hover.

Final visual review confirmed persistent grouping with the pointer outside the
content in light and dark themes, including the manual-copy field on a phone.
The final small-interaction score remains **35/40**; the previously invisible
expanded state is resolved without changing typography or focus behavior.
Reviewed [phone](/tmp/item-details-true-390.png),
[tablet](/tmp/item-details-true-768.png),
[laptop](/tmp/item-details-true-1280.png),
[wide](/tmp/item-details-true-1440.png) and
[clipboard fallback](/tmp/item-copy-fallback-390.png).

`bun run verify` passed. Four focused browser tests passed (100 assertions),
covering the responsive homepage, demo links, real-item copy/fallback and reader
navigation with JavaScript enabled and disabled. Documentation links, formatting
and whitespace checks passed. All temporary verification servers exited.
