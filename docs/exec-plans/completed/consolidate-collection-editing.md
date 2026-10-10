# Consolidate collection editing

## Purpose / Big Picture

Keep collection reading focused: Share and Edit in the header, Expand and
Collapse above items. Put authoring entry points on the existing Edit page.
Make shared primary and secondary buttons visually smaller while retaining touch targets.

## Progress

- [x] (2026-10-10) Inspected reader, authoring routes and backend capabilities.
- [x] (2026-10-10) Consolidated controls, shared button sizing and design documentation.
- [x] (2026-10-10) Full verification, ten production browser journeys, and live desktop/touch checks passed.

## Surprises & Discoveries

The former Edit route required canManage; it now admits canEdit for the content
area while retaining canManage for owner metadata. The capture flow currently targets owned collections only;
this change preserves that restriction instead of widening capture authority.

## Decision Log

- 2026-10-10: Keep Edit as the single authoring entry point. Reuse existing
  section/reorder/capture forms and backend rules; History remains a secondary
  link. Owner metadata stays separate from contributor content tools.
- 2026-10-10: Per the follow-up request, shared primary/secondary buttons use 32px
  fine-pointer and 44px coarse-pointer targets across the app; input fields retain
  their size. Preserve contrasting borders rather than dimming them.

## Outcomes & Retrospective

Reader controls are consolidated; the Edit workspace keeps owner metadata and
contributor content capabilities separate. Shared buttons now use the smaller
fine-pointer size. Verification and live checks passed; no backend permissions
or data changed.

## Context And Orientation

CollectionReader renders the reader; ResourceSections renders paginated items
and authoring links. The edit route mounts CollectionEditForm for owners.
Collection capabilities come from the backend collection policy service.

## Plan Of Work

Remove authoring controls from the reader. Extend the edit route with a paginated
Items area using existing section controls, with metadata for owners only.
Remove obsolete mobile overflow controls. Update browser journeys and docs.

## Concrete Steps

From the repository root run `bun run verify` and focused `bun run test:browser`
journeys for first capture, activity, section authoring and reordering.

## Validation And Acceptance

Readers see Share and reading controls. Owners/contributors also see Edit on all
screen sizes. Edit exposes existing authorized actions, keeps metadata owner-only,
and works without JavaScript. Sections remain reachable through pagination.
Buttons fit at mobile widths and retain 44px touch targets. Existing mutation
validation, concurrency handling and sign-in continuation remain intact.

## Idempotence And Recovery

No migrations or development-data changes. Preserve all preexisting uncommitted
work. Tests use disposable fixtures; changes are ordinary reversible file edits.

## Artifacts And Notes

`bun run verify` passed (`/tmp/collection-edit-verify.log`). The first focused
browser run passed six journeys with 79 assertions, including native forms
(`/tmp/collection-edit-browser.log`). A final run covers the toolbar refinement
and additional landing/discovery/account surfaces passed ten journeys with 181
assertions (`/tmp/collection-edit-final-browser.log`). Desktop/mobile screenshots
were inspected. Live collection and sign-in checks measured 32px buttons on fine
pointers and 44px on coarse pointers, unchanged field heights and no horizontal
overflow. The existing development server briefly retained an import of the
removed menu component; it had already restarted before recovery was needed and
now serves HTTP 200. No running process was stopped by this work.

## Interfaces And Dependencies

Next.js server pages consume Collection capabilities and Resource lists through
the existing HTTP boundary. No new API contracts or permission rules.
