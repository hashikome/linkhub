# Save and clean up same-owner collection references

This ExecPlan follows `PLANS.md`.

## Purpose / Big Picture

Owners and contributors use Add a link; the backend converts readable same-hub
collection addresses to immutable references, keeping other addresses ordinary.
Deleting or transferring a collection previews the reference rows and section
headings that will be removed, then atomically applies exactly that impact.
Ordinary URL resources remain ordinary links and are never followed for cleanup.

## Progress

- [x] (2026-10-10) Read current policy, lifecycle, authority transaction and web confirmation paths.
- [x] (2026-10-10) Implement same-hub checks, automatic capture, impact previews and transactional cleanup.
- [x] (2026-10-10) Update web capture, confirmation and interrupted-action handling.
- [x] (2026-10-10) Update contracts, ADR-0047, settled docs and regression fixtures.
- [x] (2026-10-11) Focused API/browser checks and full isolated verification pass.

## Surprises & Discoveries

- Product mutations already serialize under the authority transaction.
- References currently allow cross-owner targets and deletion leaves null targets.
- The user chose ordinary link capture instead of a separate creation picker.
  The 2026-10-11 import refinement uses the same reference policy between
  meaningful branch collections, collapsing single-reference intermediaries.

## Decision Log

- 2026-10-10, latest product direction: no Add collection button. Add a link detects
  references on the backend. Source contributors can add same-hub references when
  they can independently read the target. Other collection addresses stay URLs.

- 2026-10-10, product owner: structured references organize only owned collections.
  Deletion removes incoming references after a warning. Transfer removes incoming
  and outgoing owner references to avoid leaving cross-owner relations.
- The preview carries an opaque fingerprint of its current impact. Changed impact
  returns a conflict and requires a new preview. Unreferenced API deletes/transfers
  may omit the fingerprint for compatibility; web confirmations always carry it.
- Existing cross-owner references cannot be newly created and remain unavailable
  under the new read policy; never delete another owner's resource silently.

## Outcomes & Retrospective

Implementation, focused API/browser verification and full isolated verification
are complete. The final serial run passed all gates, including production web
build and typechecking; the earlier concurrent notification timeout did not recur.

## Context And Orientation

`ResourcesService` creates references. `CollectionsService` handles delete and
transfer inside the shared authority transaction. Resources use ordered heading
rows; a section cannot be empty. `collection-operation.ts` and the collection
actions page provide enhanced and native server-action confirmation.

## Plan Of Work

Add a backend impact helper and typed preview/confirmation contracts. Hash the
target and affected resource state, authorize ownership, then remove reference
rows and newly empty headings with audit records in the lifecycle transaction.
Render the affected collections and heading titles before confirmation. Preserve
the token through sign-in; conflicts return to a fresh review. Amend settled docs.

## Concrete Steps

Use Bun and Biome. Run focused disposable API tests, focused browser scenarios
with JavaScript enabled and disabled, then `bun run verify:isolated`. Never build
into the active development server's `.next` directory.

## Validation And Acceptance

- Owners and contributors save readable same-hub collection URLs as references.
- Foreign, unreadable, missing and self URLs stay ordinary with a generic hint.
- Explicit cross-owner reference API calls fail, even for public/shared targets.
- Deletion removes owned incoming references and newly empty headings, preserving other resources and collections.
- Transfer removes incoming/outgoing owner references and preserves ordinary URLs.
- Added, removed, reordered or renamed affected content invalidates confirmation.
- Cleanup and audit failures roll back the complete mutation.
- Native/enhanced confirmation shows affected collections, keep/delete choices and stale feedback.

## Idempotence And Recovery

No reset or user-data migration. Database IDs and ordinary links remain intact.
Old cross-owner references are not silently rewritten. Tests use disposable data.

## Artifacts And Notes

- `/tmp/nslinkhub-reference-import-final-browser.log`: 7 focused scenarios pass,
  including owner/contributor URL saving, native forms, deletion/transfer impact,
  stale preview recovery and resumed account-bound actions.
- `/tmp/import-wire-check.log`: 5 serialized-contract tests pass (399 assertions).
  Collection hints are optional on resources, including structured references.
- `/tmp/collection-impact-{delete|transfer}-{true|false}-{390,768,1280,1440}.png`
  capture responsive lifecycle confirmation. Inspection corrected cramped heading
  spacing. Source/target privacy and atomic rollback have dedicated API coverage.
- Final full gate: `/tmp/inline-verify-final.log` passed. The focused browser
  run `/tmp/inline-browser-verified.log` also passes same-hub Add a link with
  JavaScript enabled and disabled.

## Interfaces And Dependencies

Shared wire contracts stay in `packages/types`; Prisma types remain API-only.
Existing NestJS, Prisma, Next.js forms and authority locking are reused.
