# Refine the wordmark, footer and appearance settings

## Purpose / Big Picture

Make ntumie. recognizable as the logo, simplify mobile navigation, and put account
appearance choices in Settings. Email branding must outweigh its copyright/year.

## Progress

- [x] (2026-10-13) Implemented shell, device settings and shared email typography.
- [x] (2026-10-13) Updated contracts and recorded ADR-0063.
- [x] (2026-10-13) Isolated verification passed; five focused browser journeys passed (307 assertions), and rendered pages were inspected.
- [x] (2026-10-13) Recorded local acceptance and updated handoff; ready for owner review.

## Surprises & Discoveries

- Existing appearance controls supported temporary reader overrides. The new
  contract deliberately ignores those cookies while retaining account preferences.

## Decision Log

- 2026-10-13: Follow the owner's right-aligned footer correction and remove its
  tagline. Preserve existing copy on homepage, Support and in emails.
- 2026-10-13: Keep the quiet visual register, existing font and semantic palette.
  Apply Refactoring UI's hierarchy and type-scale principles through size, weight
  and contrast. Native appearance submission avoids a new client dependency.

- 2026-10-13: Give About the headline “Good links belong together.” while keeping
  the homepage headline, following the owner’s local screenshot review.

## Outcomes & Retrospective

Implementation and local verification are complete. Nothing published or deployed.
`bun run verify:isolated` passed the complete repository gate. After the owner's
About-headline correction and final selector spacing polish, the focused isolated
browser run rebuilt the final web app and passed all five journeys (307 assertions,
35.74 seconds of tests). Final changed files also passed Biome and docs checks.
Handbook source/strict build/site passed (49 pages, 2753 local links/assets).

Visual review at all four required widths corrected selector stretch, cramped
feedback spacing and the repeated device heading. Final focused Nielsen score:
32/40. Browser email previews passed visual review; actual mail-client rendering
and production acceptance remain unverified. The detailed local review records
which states were reached and which were not.

## Context And Orientation

`apps/web/src/components/` owns the shell and profile settings; `app/layout.tsx`
resolves session-aware theme, and `/forms/theme` persists it. `packages/email`
owns shared code and invitation markup. ADR-0063 supersedes footer parts of 0056.
Existing uncommitted release-acceptance plan updates predate this task and remain.

## Plan Of Work

Update the shell and settings together, then update email hierarchy. Align source
design contracts and browser assertions. Verify in isolated checkouts to preserve
active development services and generated artifacts. Inspect desktop/mobile and
both themes before recording completion.

## Concrete Steps

```bash
bun run verify:isolated
bun run verify:isolated test:browser --test-name-pattern 'fits home and About|keeps footer roles|connects About|edits the own profile|follows the device'
```

Set `FOOTER_REVIEW_DIR` to the original checkout's ignored `ref/shell-review` for
screenshots that survive isolated-checkout removal. Use a workspace-owned TMPDIR.

## Validation And Acceptance

- About/Join stays right-aligned at 320, 390, 768, 1280 and 1440 px; no web tagline.
- Signed-in About has no footer navigation. Other pages link to About.
- Header has no theme control; signed-out pages follow OS changes even with old cookies.
- Signed-in settings can save all three themes with and without JavaScript;
  anonymous, cross-origin and invalid submissions cannot change the preference.
- Inspect actual screenshots at 390, 768, 1280 and 1440 px in both themes and
  shared email templates. The wordmark outweighs copyright/year.
- `bun run verify` passes in isolation; no production write or email send.

## Idempotence And Recovery

Verification creates disposable databases and checkouts. Only owned test resources
are cleaned up. No schema migration, credential change or service restart is needed.

## Artifacts And Notes

Durable contracts are in DESIGN.md, PRODUCT.md, the focused web/email designs and
ADR-0063. Handbook reader guidance is updated locally in `docs/ntumie/product.md`
there; source and handbook publication remain pending. Temporary edit scripts
were removed; no previous acceptance record was retired.

`ref/shell-review` contains synthetic visual evidence. Owner: this implementation;
purpose: local review; remove after owner acceptance. Durable results live here.

## Interfaces And Dependencies

The existing HttpOnly appearance cookie remains the browser preference. Theme POST
requires the existing session and origin checks. No SDK or new dependency is added.

## About collection follow-up — 13 October

The owner clarified that About must follow the homepage's Ada implementation:
a static visual simulation with complete collection/resource metadata. It must
never depend on the owner's account or hub. `lib/about-collection-snapshot.ts`
therefore exports typed Collection/Resource fixture data, with simulated UUIDs,
a ntumie. hub, namestarlit contributor attribution and fixed timestamps.
`AboutCollection` feeds these into the same CollectionPreview, CollectionMeta,
ResourceSections and ItemDetails used by the homepage. The section has its normal
description. No backend records are created or fetched. Support is adapted to a
local site link so development never redirects to production; portfolio links
keep normal external-resource behavior. Item links reopen the selected fixture.

Earlier full isolated verification passed before this metadata correction. The
corrected snapshot passed a production web build and three focused browser
journeys (228 assertions, 15.55 seconds), including no-JavaScript reading,
attribution, timestamps, item selection and clipboard recovery. Biome, source
links and handbook source/strict/site checks passed. Final screenshots were
inspected at 390/768/1280/1440 in both themes; visual review remains 32/40. The handbook and source contracts now describe a simulated
collection. This supersedes the earlier stripped-metadata approach and its review
screenshots. The new evidence is owned by this follow-up in
`ref/about-snapshot-review`; remove after owner acceptance. Nothing published.

Owner accepted the simulated About shape and requested removal of the homepage
Example badge. Removed its markup and unused CSS; retained the figure
semantics and accessible Example collection label.
