# Align optional hub lifecycle and contribution pagination

## Purpose / Big Picture

Keep account-owned collection bookmarks and participation independent of hubs.
Importing a new collection requires an existing personal hub and never creates
one implicitly. The account menu's Hub destination lets a hubless person choose
Create hub. Settings must adopt a hub created in another tab without losing newer
profile edits. Public contribution pagination must preserve PostgreSQL microseconds.

## Progress

- [x] (2026-10-09) Inspected review findings and existing contracts; confirmed
  imports take a collection target or createCollection, not a supplied hubId.
- [x] (2026-10-09) Implemented Hub entry, Settings synchronization and exact
  contribution cursors, including strict timestamp validation.
- [x] (2026-10-09) Import prerequisite/owner-only tests and microsecond/tie
  pagination regressions pass; existing hubless bookmark/comment/contribution
  coverage remains green.
- [x] (2026-10-09) Updated product/design docs and ADR-0012/0018 amendments;
  focused browser checks passed (4 tests, 90 assertions), including native Hub
  creation and both unchanged/newer drafts during cross-tab hub creation.
- [x] (2026-10-09) Final `bun run verify` passed; closed this plan.

## Surprises & Discoveries

Import creation already returns hub_unavailable for a hubless caller. Existing
collection imports authorize contributors through the collection policy. Saves
already belong to userId and create no hub. The menu currently hides Hub from
hubless accounts, and /hub redirects them to their profile. New Settings controls
mount after the imperative save synchronization loop and use stale initial props.

## Decision Log

- User / 2026-10-09: Imports must not become an implicit hub-creation shortcut.
  Clients guide creation; backend rules still enforce target existence and access.
- User / 2026-10-09: Saving/bookmarking collections is account-owned; creating
  collections and saving links to one's collections requires a hub.
- Keep existing first-link/collection creation and transfer workflows. No new
  import page in this patch; record its required creation prompt for future work.
- User / 2026-10-09: Imports are owner-only management, never contributor
  actions. Replace existing-target requireWriteContent with requireManage even
  when contributors own a separate hub. Amend ADR-0012/0018 and product criteria.

## Outcomes & Retrospective

Completed. Imports require owner management and never provision a hub; existing
account-owned bookmarks and participation remain hubless. Hub navigation offers
explicit creation with native and enhanced forms. Settings adopts new hub fields
from saved data, retaining newer edits. Contribution keysets preserve exact
microseconds and ID ordering; malformed and cross-person cursors are rejected.

The review's proposed import auto-provisioning was intentionally not applied:
the product clarification established the opposite prerequisite. The follow-up
also narrowed existing import authority from contributor to owner, now documented
in the product, design, ADR amendments and future bulk-import plan. No schema
changes, development database resets, commits or pushes were needed.

## Context And Orientation

ImportsService resolves an existing target through CollectionPolicyService or
looks up the caller's personal hub before creating a collection. CollectionsService
save/unsave records CollectionSave keyed by userId. Existing POST /hubs and
/forms/create-hub already provide explicit idempotent creation. ProfileEditor
uses uncontrolled native inputs plus returned Profile state. Public contributions
use (updated_at, id) keyset pagination but currently serialize Date milliseconds.

## Plan Of Work

Expose Hub consistently and render a hubless entry using the existing native
creation form. Initialize dynamically mounted Settings controls from saved data,
merging newly available hub fields while retaining in-flight profile edits.
Serialize exact SQL timestamps and compare their raw timestamptz values. Add
import prerequisite/permission tests, hubless bookmark/participation checks,
microsecond and ID tie-break pagination tests, and native/JS browser lifecycle tests.
Amend ADR-0018 and relevant product/design docs, then record verification.

## Concrete Steps

Run `bun run verify` with local test services. Run focused `bun run test:browser
--test-name-pattern` journeys covering hubless entry, Settings synchronization and
existing account navigation/profile saves. Tests use disposable databases.

## Validation And Acceptance

Fresh accounts can bookmark, comment and contribute without acquiring a hub.
Contributor/viewer imports into existing targets fail with or without their own
hub and create no resources or import audit records. New-collection imports fail with hub_unavailable until explicit creation, for
both CSV and bookmarks HTML; no new hub or collection survives a failed request.
Hub navigation exposes a Create hub option without mutating on GET. Explicit
creation works natively and with JavaScript. Settings remains saveable when a hub
appears during a profile save, including newer unsaved edits. Contribution cursors
visit every row exactly once across sub-millisecond differences and exact ties,
remain person-scoped, and preserve current visibility/access filtering.

## Idempotence And Recovery

Preserve all uncommitted work. No commits, migration rewrites or development DB
resets. Tests modify only owned disposable fixtures. Move this plan to completed
once verification is recorded; keep the separate bulk-import plan pending.

## Artifacts And Notes

Review item 1 is a requested behavior, not a defect to reverse: no automatic hub
creation through imports. The user's follow-up also removed contributor import
permission, including when the contributor owns another hub.

- `/tmp/optional-hub-verify.log`: API/unit/web tests passed; caught an incorrect
  FormNotice prop in the new page. Corrected `notice` to the component's `code`.
- `/tmp/optional-hub-browser.log`: production build and focused browser checks
  passed, 4 tests / 90 assertions / 0 failures. Covers existing profile retries,
  profile/hub relationship, native/JS hubless navigation and explicit creation,
  plus new controls with and without newer profile edits during a save.
- `/tmp/optional-hub-entry-true.png`: inspected mobile entry screenshot; layout,
  wrapping and Create hub action fit without overflow.
- `/tmp/optional-hub-verify-final.log`: final `bun run verify` passed, including
  API build/typecheck/unit/e2e, web tests/build/typecheck and repository checks.
- Additional API typecheck, documentation links and `git diff --check` passed.

## Interfaces And Dependencies

No new dependencies or client imports of API internals. Backend remains the
source of truth for hubs, permissions and cursor ordering. Shared import contract
continues to use targetCollectionId or createCollection rather than a hub handle.
