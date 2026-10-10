# Reuse one contextual Share page

## Purpose / Big Picture

Share profiles, hubs, collections and nslinkhub through one page and reusable Share action. Keep Copy link, contextual return navigation, and existing collection-owner access controls.

## Progress

- [x] (2026-10-09) Inspected current sharing, public identities and navigation.
- [x] (2026-10-09) Implemented typed share destinations, generic page, stable profile addresses and entry actions.
- [x] (2026-10-09) Verified stable identities, access boundaries, return context and responsive/no-JavaScript behavior.

## Surprises & Discoveries

Public profiles only have username lookups today. Permanent sharing needs an immutable person-ID route and lookup; reuse the existing public projection, including inactive-account hiding. The Share route must be reserved against username claims.

## Decision Log

- 2026-10-09: Resolve target type and immutable ID server-side; do not accept arbitrary titles or external URLs as share subjects. Copying never grants access. Preserve explicitly supplied private collection tokens only in that collection's link.
- 2026-10-09: Retain existing collection access controls below the common Share layout; old action URLs redirect for compatibility. Social destinations remain deferred.

## Outcomes & Retrospective

All four subjects now use one Share page and reusable entry action. Collection owners retain access controls. Permanent profile links survive username changes. No dependencies, schema migration or social integration were added.

## Context And Orientation

Current sharing lives in apps/web/src/app/c/[id]/actions/page.tsx and components/share-link.tsx. Public profiles use PeopleController and PersonProfile. Public/owned hubs have separate presentation components but share immutable hub identity.

## Plan Of Work

Add a typed share URL helper and ShareAction component, server-resolved /share page and reusable ShareScreen. Extract collection access controls. Add immutable profile lookup/route. Connect collection, profile, hub and site entry actions; preserve local return context. Update focused docs and changelog.

## Concrete Steps

Use Bun/Biome. Run bun run verify in the existing isolated scratch checkout, then browser journeys for the new subjects and existing collection operations. Never build over the live development .next directory.

## Validation And Acceptance

All four subjects use one Share page. Clipboard values are canonical same-origin URLs. Renames preserve shared ID URLs. Inactive profiles and inaccessible collections remain unavailable. A public collection never copies an access token. Contextual links retain source filters. Copy is visible before hydration and usable afterwards; no-JavaScript manual copying works.

## Idempotence And Recovery

No schema migration or data mutation is needed. Existing collection action links remain compatible. Verification uses disposable databases.

## Artifacts And Notes

`bun run verify` passed in the isolated checkout (`/tmp/generic-share-verify.log`). Updated documentation links pass (`/tmp/generic-share-docs.log`). The full browser suite passed 52 existing tests; the new test initially used a heading-based ready helper on an invalid-target 404. After correcting that assertion, both sharing journeys passed (2 pass, 51 filtered, 0 fail; `/tmp/generic-share-browser-focused.log`). Desktop and mobile screenshots for all four subjects were inspected; clipboard, no-JavaScript copying, source returns, token stripping and denied private access passed.

## Interfaces And Dependencies

Backend remains the public-data and access authority. Web only imports shared DTOs and uses existing HTTP boundaries; no new dependency or social integration.
