# Unify Manage by authority and context

## Purpose / Big Picture

Use one Manage entry at `/manage` for hub owners, operators and admins. Show
only available capabilities. Accounts and Team concern the service; People
concerns current access to the owner's collections. Collections and Audit offer
explicit My hub / Service context to people who hold both authorities.

## Progress

- [x] (2026-10-08) Record the user's unified-workspace direction.
- [x] (2026-10-08) Move existing service controls and return paths to Manage.
- [x] (2026-10-08) Add owner collections, current People and audit views using owner-scoped API reads.
- [x] (2026-10-08) Update ADR-0014 and current product/design documentation.
- [x] (2026-10-08) Verify permission isolation and browser journeys; repository gate and all 47 browser tests pass. Final Settings helper-text changes pass a focused browser rerun.

- [x] (2026-10-08) Align Settings Description with the existing input column; retain mobile stacking.

- [x] (2026-10-08) Remove Edit profile shortcuts, add explicit idempotent Create hub, and move notification preferences to Settings.

- [x] (2026-10-08) Keep Profile/Hub menu entries separate; profiles show name and username, with the visibility switch scoped only to hub credit.

- [x] (2026-10-08) Replace name-only visibility with public hub connection privacy and the specified relationship bylines.

- [x] (2026-10-08) Move visibility to Hub.showOwner only; keep its control in Settings → Hub and enlarge the aligned Description field.

- [x] (2026-10-08) Add Settings section navigation with one panel at a time, draft-preserving switches, native form fallback and mobile navigation; use whitespace between fields.

## Surprises & Discoveries

A migration-file write used the wrong working directory, and the generated
column drop/add ran locally instead of the reviewed rename. Restored the known
local opt-out from the supplied Settings screenshot, verified the database had
only the two known development accounts, and reconciled the local migration
checksum to the corrected preserving rename. Fresh-chain checks confirmed both
opt-in and opt-out values survive the rename and move to Hub.showOwner;
the local schema parity check reports no difference. Never chain migration application after a write that
can fail without fail-fast handling.


Owner invitations are not implemented; existing collection shares are grants to
registered users. Do not present these as pending invitations. The delivered
People list represents current collection access; email invitations remain in
the sharing backlog.

## Decision Log

- 2026-10-08 / User: replace separate Service operations and owner workspaces
  with Manage at `/manage`. Permissions determine sections and actions.
- Preserve API authority separation: shared navigation never confers access.
- No old-route compatibility: this product has not been deployed.

## Outcomes & Retrospective

Delivered the context-aware Manage workspace, distinct Profile/Hub views and
menu entries, hub-owned public relationship visibility, explicit hub creation,
and sectioned Settings. Profile begins with email; Hub begins with its ID and
permanence hint, followed by name, handle, Show owner and Description. Fields
use whitespace and necessary help beneath controls. Section switches preserve
drafts; native forms retain the selected section after saving.

`bun run verify` passed. The full browser suite passed 47 tests / 604 assertions;
the final Settings rendering and public-relationship flow passed a focused
rerun with JavaScript and native forms (33 assertions). Desktop light and mobile
dark screenshots were reviewed. Schema parity and fresh migrations preserve
both visibility choices. No commit or push was made.

## Context And Orientation

Service endpoints remain `/api/v1/operations/*`. Hub ownership comes from the
session/profile and is rechecked by hub services. Web routes live under
`apps/web/src/app/manage`; the existing table layout is retained.

## Plan Of Work

Move routes and links, add contextual navigation and owner views, then update
contracts, isolation tests and current documentation.

## Concrete Steps

Run `bun run check`, `bun run verify` and `bun run test:browser` in the isolated
scratch checkout so the user's live dev build is not overwritten.

## Validation And Acceptance

Owners never receive Accounts/Team/service audit access. Operators cannot use
Manage to read another hub's private content. Admin owners can navigate both
contexts. Direct unauthorized API requests remain denied. Profiles show names and usernames
regardless of the public hub connection toggle. Opting out removes the hub
relationship from the profile and owner identity from the hub API and byline. The account menu orders Profile, Hub (when
owned), Notifications, Settings, Manage (when authorized). Explicit hub creation
is authenticated and idempotent and never creates a collection. JS and native forms
work under the new routes; audit Load more and table scrolling are preserved.

## Idempotence And Recovery

The migrations preserve existing choices and move visibility from User to
Hub.showOwner. The obsolete user column is removed.
No new dependencies. File moves are reversible; no deployment or
commit is part of this task. Test databases are disposable.

## Artifacts And Notes

Verification logs: `/tmp/nslinkhub-sections-verify.log`,
`/tmp/nslinkhub-sections-browser.log`, and
`/tmp/nslinkhub-final-settings-review.log`. Screenshots:
`/tmp/attribution-settings-desktop.png` and
`/tmp/attribution-settings-mobile.png`.

## Interfaces And Dependencies

Add session hubId and an owner-scoped paginated current-people read. Keep service
invitations separate from collection grants; no membership or admin bypass.
