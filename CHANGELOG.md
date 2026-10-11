# Changelog

All notable project changes are recorded here for humans and agents. Follow
the spirit of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and use
Conventional Commit categories when preparing commits.

This file is not a replacement for design docs or ExecPlans. It is the durable
summary of what changed after completed work has been promoted out of `ref/`.

## Unreleased

- Record ID-only collection URLs as the next implementation milestone (ADR-0053):
  handles resolve hubs only, and `/c/<id>` survives ownership transfers. Slug
  removal remains pending. Refresh public-default and attribution documentation.

- Consolidate import repair placement per destination, using two bulk position
  updates instead of repeatedly shifting saved resources for every section.
- Refresh collection lifecycle impact previews only for version conflicts;
  transfer slug conflicts retain normal error handling, including after sign-in.

- Accept valid maximum-length Unicode import edits with a bounded 64 KiB encoded
  form allowance, preserving tags through normal saving and sign-in recovery.
- Renew authenticated visitor attribution at API forwarding so slow uploads and
  rendering retain per-visitor budgets without extending API proof expiry.

- Preserve bookmark collection relationships when discarding unfiled links;
  retain the synthetic export root so later child imports create their ancestor
  references. Cover root and real-parent discard paths with regression tests.

- Require trusted visitor attribution in one shared server-to-API transport,
  including recovery storage during sign-in rendering. Add a boundary gate and
  cross-visitor rate-limit regression; record ADR-0052.
- Preserve imported tag names containing commas, semicolons and quotes when
  editing rows, using one tag per line without silently truncating submitted tags.

- Capture receipts now retain saved resource IDs so retries survive collection
  slug and hub-handle changes, while deleted resources still fail safely.
- Preserve large interrupted import edits in encrypted, expiring backend storage
  with a short reference cookie; sign-in replays all fields for the same account.

- Finish duplicate/already-saved rows only within the completed collection import
  job, releasing the upload slot when no pending rows remain. Exclude discarded
  collections when assigning unfiled links so those links stay visible for review.

- Document distinct communities within a hub and the reusable intake/application
  service boundary. Link the shared backlog and expanded brief covering team and
  client views, NSLinkHub as the first integration, and portfolio intake. Community
  access and the separate service remain planned, not implemented.

- Review imports as individual collection drafts with independent publishing choices,
  published by default. Import queues all ready links for background batches; failed
  links remain reviewable and later jobs reuse the saved collection.
- New collections default to published across creation and capture, with explicit
  opt-out controls. Existing collection visibility and access grants are preserved.
- Record invitation-based community membership as a future direction: viewer access
  across collections explicitly published for community members, without contribution rights.


- Remove the redundant selected-row count from import actions; place Import immediately before Clear selection.

- Keep the current view visible during ordinary navigation and use browser-native loading feedback; show app feedback only for interrupted navigation or failures. Preserve concealment for mutations and session/history revalidation; remove a duplicate Manage session read and parallelize import review reads.

- Move Manage sections into a shared desktop sidebar, with a collapsible menu on narrow screens. Import now has New import and Review subsections; Review lists unfinished imports and supports opening or discarding drafts.

- Add an explicit Upload file button with the selected filename and move file-format guidance to Support.

- Import review actions now appear only after selection, show affected link counts, and leave unselected rows untouched. Refresh stays visible in the same button row; discard moves to the imports list.
- Simplify import review labels to Processing and Save. Rename the Manage tab
  to Import, keeping planned web exports with collections. Selected action
  buttons sit below the table, with inline destructive confirmation.

- Import review now opens on a bounded links table with counted status filters
  and Load more. First-column checkboxes select links for targeted retry or removal;
  Link, Tags, Section, Collection, Status and Edit follow. Inline editing keeps
  corrections in the table and preserves loaded rows. Placement comes from the file. Browser wrappers are ignored; meaningful roots and
  branching folders become named collections connected by same-owner references,
  with leaf folders as flat sections. Collapse folders that would contain only one
  collection reference. Unfiled links require a collection name.
  Remove single/split and per-folder mapping, preserving saved receipts and manual
  edits when migrating drafts. Actions follow the status tab and preserve it
  through submission and sign-in.
- Add a link now saves readable same-hub collection URLs as immutable references
  for owners and contributors. Other collection URLs remain ordinary links with
  a Collection hint. Deletion and transfer preview affected references and newly
  empty sections, apply confirmed cleanup atomically, and require another review
  when impact changes. Native forms preserve confirmations through sign-in.

- Raised the per-file import limit to 5,000 links and daily metadata-lookup budget
  to 15,000 URLs so larger browser libraries fit. Uploads remain bounded to 10 MB
  and commits to 100 ready links per batch.

- CSV import now uses the application’s creation layout: collection, section,
  URL and tags. Blank sections create flat collections; tags are optional.
  Collection and section descriptions are edited after import; resource notes
  are deferred. It creates new collections (now published by default, with an
  explicit private choice) directly
  from the file, with a downloadable template and no destination-mapping step.
  Enforced nonempty sections across partial commits and retained heading receipts
  when bookmark mappings change. Removed obsolete import-description fields,
  rendering and storage; normal post-import description editing is unchanged.

- Replaced pasted-link imports with TXT file uploads (one URL per line). All
  import formats now require a file; existing drafts are preserved. Reject files
  containing NUL characters before persistence.

- Added reviewed bulk imports for browser bookmarks, quoted CSV and plain-text files:
  private owner drafts, shared background title resolution, folder destinations,
  explicit visibility, row repairs and retries, and atomic batches of 100 links.
  Manage now provides upload and review journeys with and without JavaScript.
  Removed the former one-shot import endpoints; imports never create a hub implicitly.
- Added original-page fallback when oEmbed is unavailable, within the shared
  lookup deadline. Repaired import rows retain source order across folders
  that share one destination collection.
- Fixed review findings: reachable non-HTML links can import with address fallback,
  section/skip folder changes clear unavailable destinations, and isolated verification
  removes staged deletions from its cloned snapshot.
- Added bounded draft expiry, account lookup budgets, revision conflicts and import
  receipts that preserve source order and prevent duplicate retries.
- Refreshed browser acceptance for the current footer and email-first sign-in,
  including explicit account creation; isolated timezone fixtures from expired
  sessions and normalize timestamp fallbacks when comparing pagination rows.
- Added `verify:isolated` to run the full gate and browser/dev checks without
  sharing build artifacts with a running development server. Restored the local
  username column width after confirming all existing values fit; no data reset.

- Fixed authenticator enrollment after an abandoned Google connection: session
  maintenance skips pending Google sign-in completion and preserves session assurance.
- Fixed account recovery while signed in as another account: verified recovery
  takes precedence over session account controls and retains its return destination.
- Added all completed sign-in methods to audit filters, search labels and account
  target presentation; code-verification attempts remain a separate action.

- Unified successful authentication completion across email registration/sign-in,
  Google, passkeys, TOTP and recovery. Session assurance, last login, bound invitation
  completion and one account-bound success event now share the transaction; removed
  duplicate email writers. Credential enrollment no longer counts session rotation
  as a new sign-in. Signup identity/optional-hub policy lives behind app-owned hooks.

- Added an account timezone preference in Profile settings, stored on User in the
  database. Automatic follows the device; explicit choices apply across devices,
  initial rendering, relative dates and audit calendar filters, including DST.
- Fixed the landing demo to use stable fictional sample timestamps, so relative
  ages progress naturally instead of resetting on each page load.

- Show exact timestamps in the reader's local time without timezone suffixes.
  Automatic waits for device formatting instead of flashing UTC; without
  JavaScript, Automatic retains an explicitly labelled UTC fallback.
- Strengthened resource typography in collections and the landing demo: 18px
  semibold titles lead 16px regular descriptions, with smaller attribution metadata.
- Restored the header appearance toggle for signed-out readers, defaulting to System.
  Readers toggle between Light and Dark; signed-in users retain an explicit System
  choice. Temporary reader choices stay separate from saved signed-in preferences.
- Removed the Google completion screen: successful sign-in returns automatically
  to its destination; interrupted writes retain checked POST completion.
- Unified demo and collection item copying, including the initial-render label.
  Demo links reopen the exact example item instead of navigating to fictional collections.

- Added separate, centered Sign in to nslinkhub and Create your account pages with
  shared email-first authentication and Google as the secondary option. Unknown
  ordinary accounts require explicit creation after verification, reusing proof
  without another code. Return destinations and focused capture/invitation flows
  are preserved; obsolete entry controls and copy were removed.
- Added optional Start with a hub during account creation. A chosen hub name creates
  the hub atomically with the account; its initial handle matches the generated
  username and avoids current/retired handles. Hub creation stays off by default.

- Isolated Save handle from ordinary profile autosave, including native forms.
  Invalid handle drafts no longer block other edits; pending renames lock only
  the handle and preserve newer profile drafts. Changing the sign-in email keeps
  the original destination, including collection item links and interrupted actions.

- Fixed public-view navigation silently saving draft hub handles; only explicit
  saves rename a handle. Recovery previews use per-visitor read budgets, and the
  dev-loop check follows the email-first sign-in entry. Added regression coverage.

- Reconciled current documentation with implemented authentication, account lifecycle,
  handle cooldown/retirement, sharing, attribution and management behavior. Updated
  product summaries, onboarding and active plans; corrected ADR amendment chains
  and marked superseded milestone evidence without rewriting its history.

- Handle changes now require 30 days between successful renames. Retired handles
  can never be reused, even by the same owner. Backend and SQL enforce the policy;
  Settings explains it and shows the next eligible date. Existing rename history
  initializes cooldowns; unchanged-handle saves and other profile edits still work.

- Hub handles can change with the hub's purpose. Removed permanent claiming,
  its API/UI fields and database claim metadata; Settings keeps the handle editable
  with Save handle. Shared UUID links stay stable. ADR-0042 supersedes ADR-0033's permanence
  rule; ADR-0043 subsequently tightens reuse and rename cadence.

- Fixed account email as an identity policy: ordinary profile updates reject
  user UUID and email, while names and bios remain editable. Retired the old
  email-change API and native profile-update route. Controlled email change is
  backlog for a dedicated POST action with proof, notifications and audit (ADR-0041).

- Replaced the generic sign-in recovery link with state-specific recovery after
  email proof. Deactivated users see Reactivate account; users within the deletion
  grace period see Cancel deletion. The backend binds and rechecks recovery proof,
  creates no session, preserves restrictions, and retains the saved-link destination.

- Confirmed Google account creation now uses the provider's verified email and
  name without an additional inbox code. The backend atomically creates the user,
  Google connection and session only after Create account consent, with expiry,
  cancellation, replay, collision and rollback protection. Gravatar uses the
  existing backend email-based lookup; Google profile photos are not imported.

- Simplified missing-account Google onboarding to Create account or Already have
  an account? Sign in. Returning clears the pending Google association and preserves
  the original destination. First-link capture now uses email codes directly;
  ordinary sign-in retains email/Google and automatic same-email association.

- Unified sign-in entry around email and Google, with passkeys offered after email
  entry or Google. New Google users explicitly confirm account creation from their
  verified provider identity; the callback alone creates nothing. Invitation and
  confirmation flows discard abandoned Google state and forward cancellation
  cookies. Selected-email passkeys remain bound to the backend challenge. Google email must
  match on every sign-in; mismatches return to email entry. New-user screens
  clearly offer account creation without exposing linking mechanics.


- Clear abandoned Google associations when starting ordinary email or standalone
  passkey sign-in, allowing account switching immediately. Preserve bound Google
  verification and factor continuation, with transactional cancellation and
  regression coverage for the backend and browser flows.

- Verify expanded items credit the actual adding contributor before the date,
  with a profile link. Document unknown historical attribution and restore the
  confirmed contributor on 17 legacy local items without changing added dates.

- Make expanded collection items visibly grouped with a persistent neutral
  background, fine boundary and separation from neighboring rows, including
  when the pointer moves away and when JavaScript is disabled.

- Replace the expanded collection item's self-navigation action with “Copy link
  to this item”, so readers can point someone to an exact resource in a guide.
  Confirm successful copying, offer manual copying when the clipboard fails,
  and retain native item links without JavaScript.

- Keep the landing example's “Link to this item” affordance and point it directly
  to the same external resource as its title. Eliminate fictional collection and
  profile routes; check development and production rendering.
- Use “A web worth keeping” for the example, with verified resources about
  organizing bookmarks and cultivating a digital garden. Lead the supporting
  message with useful guides, shared knowledge and discovery.

- Fold the homepage discovery invitation into the hero's supporting message and
  remove the separate discovery section. Keep the interactive example and one
  primary action, with Discover available in the header. Balance the invitation
  beside the example with closer columns, a stable vertically centered message
  and a larger primary CTA.

- Refresh the homepage example with the current collection reader components:
  collapsible sections, working resource titles, item tags and expandable
  details. Keep fictional identities off real routes and preserve the homepage
  URL and initial scroll position. Expanding the example leaves the desktop
  headline and action in place.

- Move “Share nslinkhub” from the homepage discovery section into the shared
  footer alongside Support.
- Keep “Save your first link” as the sole homepage hero action; retain Sign in
  and Discover in the header.

- Connect Google automatically within sign-in for existing same-email accounts.
  External-email Google users complete a first-time email check inline, followed
  by any enrolled factor; no Settings detour is required. Pending connections
  expire, reject changed accounts and commit atomically with authentication.

- Route browser API requests and Google callbacks directly to the backend,
  following Pigfarm: remove the Next rewrite, add exact-origin credentialed CORS,
  and separate web redirects/passkeys/public links from the backend auth URL.
  Avatar lookup and fallback remain backend-owned; the browser displays API images.

- Bind the development API to loopback to match the workstation port registry;
  document the API/web port exceptions and concurrent Pigfarm configuration.

- Add passwordless account security: user-verified passkeys, existing-account
  Google sign-in, optional authenticator apps and single-use recovery codes.
  Protected email/Google sign-ins require another enrolled proof; email cannot
  bypass protection. Security settings and Support cover setup and recovery.
  Security changes require recent completed authentication and revoke other
  sessions. Google credentials remain optional server-only configuration.

- Display claimed hub handles as immutable label/value facts in Settings, matching
  Hub ID, with a hint that the claimed handle is permanent. Unclaimed handles
  keep the explicit claim form.

- Simplify Profile Settings by replacing the picture preview and provider copy
  with a help link. Support now explains how to update a Gravatar, which email
  to use, public visibility, generated fallback and update timing.

- Fix available Gravatar pictures falling back on slower connections: allow five
  seconds for image retrieval instead of 1.5, with a delayed-response regression.

- Show Gravatar pictures on public person profiles, contributions and account
  navigation, with the existing generated icon for missing or failed images.
  Replace chosen-image priority; keep email hashes server-side and discard
  images if the account or verified email changes during retrieval.
- Add a Settings picture preview and optional Gravatar guidance, explaining
  public visibility, account-email association and generated fallback.

- Stabilize Manage browser pagination checks across date localization during
  hydration, while retaining row-content and timestamp-value comparisons.

- Fix Manage collection pagination skipping rows created within the same
  millisecond; deleted or inaccessible page anchors now request an explicit reload.
- Keep normalized Unicode tags valid when lowercasing expands a value at the
  length limit, preventing a relational-constraint failure during item saves.

- Reconcile product status, security and auth documentation with permanent hub
  handles and implemented self-service account lifecycle. Queue Gravatar profile
  avatars immediately after review and commit; record richer profile display as
  planned paid functionality. Specify Gravatar first with existing generated
  icons as fallback and an optional account-creation recommendation in Settings.

- Keep usernames freely editable; let hub owners explicitly claim one permanent
  handle. Reserve issued handles after deletion to prevent identity reuse.
- Add distinct email-confirmed self-service deactivation, reactivation, scheduled
  deletion and cancellation. Reuse the 14-day cleanup policy; prevent self-service
  recovery from lifting operator restrictions or restoring old sessions/grants.

- Rank collection tags by tagged-item count, with alphabetical ties, so the
  three-tag preview shows the most-used tags in that collection.

- Normalize tags into a shared name catalogue, item assignments and a stored
  collection-tag relation synchronized transactionally. Collection tags now
  reflect all their items, with no independent tag editor; retain compact chips
  and a remaining-tag count. Migrate existing item tags and preserve their order.

- Remove global Expand/Collapse controls from collection readers. Items and
  sections toggle directly; reloading restores open sections and the URL-selected
  item. Viewers keep Share and Add a comment, with Edit for owners/contributors.

- Consolidate temporary session notes into one unfinished-work handoff; remove
  superseded handoffs, completed verification scripts and the installed skill
  archive. Preserve the pending personal-import source and move remaining import,
  performance and audit investigation context into repository docs.

- Consolidate collection authoring behind Edit: owner details, adding links,
  sections and reordering, with History as a secondary link. Contributors can
  enter content tools without owner settings. Reading keeps Share/Edit;
  remove the mobile overflow menu. Reduce shared primary and
  secondary buttons to 32px on fine pointers while retaining 44px touch targets.

- Show a “Show items” cue beneath collapsed section descriptions, making hidden
  contents apparent while keeping native mouse and keyboard expansion.

- Add Reorder for owners and contributors: drag before another item or use native
  Move up/Move down controls, with immediate saves and section moves carrying their
  items. Keep permissions, nonempty sections and optimistic versions in the API;
  fix sparse-position collisions and stale full-order writes. Preserve expired
  moves through account-bound sign-in. Shorten reader controls to Expand/Collapse
  and let non-interactive item content toggle details while preserving links and
  text selection. Keep one item expanded per collection, synchronize its ID in
  the URL, and scroll directly linked items into view. Expand now opens sections;
  Collapse closes sections and clears selection.

- Remove plus/minus indicators and their reserved spacing from section and link
  disclosures; retain hover feedback and native mouse/keyboard expansion.

- Clarify the planned redirect-repair contract: saved URLs change only through a
  dedicated review approval with a required explanatory note. Generic PUT/PATCH
  updates cannot change URLs, including when supplied with a note. Preserve the
  reason with approval evidence and validate it in the backend.

- Accept paid link-health monitoring with unavailable/recovery notifications and
  redirects reviewed by the owner before updating saved URLs. Record ADR-0029’s
  narrow exception to immutable addresses and backend authorization, version,
  destination-validation and retry requirements. Design and backlog only; no
  monitoring runtime or public commercial copy added.

- Adopt ADR-0028: free bookmarks/CSV import, unlimited public collections and public
  collaboration; paid AI curator, DOCX import and owner-funded private sharing for
  both viewers and contributors. Plan public-by-default new collections with an
  explicit private choice and a free owner-only private allowance. Supersede the
  conflicting ADR-0016 guarantee and earlier private-default direction; runtime
  rollout, prices, quota counts and lifecycle details remain pending. Update the
  backlog and plans, including prevention of contributor-based private-access bypasses.

- Capture the founder's bookmarks/document/self-message workflow in the product
  backlog, document-to-draft curation design and staged evaluation plan. Record
  paid imports, private collaboration and private capacity as a candidate model
  with explicit ADR-0016 conflicts; current access, pricing and publication defaults
  remain unchanged. Extend reviewed-import acceptance to nonempty sections.

- Add optional 500-character section descriptions and owner/contributor section
  authoring. Enforce at least one link or collection reference per section in
  backend mutations. Preserve section context across pagination and exports.
  Replace item detail dialogs with native inline disclosures, keep section
  descriptions visible, and add Expand all / Collapse all controls. Durable item
  URLs still open authorized context beyond the first page.

- Preserve authenticated audit-denial evidence when Manage audit composes
  authority transactions. Exclude disabled remembered link grants from Access
  people and counts. Track copies of newly generated and rotated collection
  links with their issued token, resetting copy state after each rotation.

- Keep collection bookmarks and participation independent of hubs. Always expose
  Hub in the account menu, with explicit creation for hubless people. Imports
  require an existing hub and owner authority for every destination; contributors
  cannot import. Initialize Settings from a hub created in another tab without
  losing newer edits. Preserve PostgreSQL microseconds in contribution cursors
  so pagination does not skip collections within the same millisecond.

- Limit person usernames to 20 characters and offer optional, backend-checked
  shortening suggestions for longer drafts. Suggestions keep a readable prefix
  and a four-character letters/digits hash suffix; users explicitly choose them
  before saving. Bound onboarding defaults and migration backfills, preserve
  case/hyphen equivalence, and keep hub handles at their separate 60-character limit.

- Fix sharing review findings: signed visitor budgets include PUT, private Share
  destinations survive sign-in, and expired collection operations resume with
  their inputs for the same account, retaining generated link tokens. Trim hub
  stems before collision suffixes. Enforce lowercase, hyphen-only usernames with
  hyphen-insensitive availability in the backend and database; reserve `share`
  and its variants in onboarding and backfill. Document external naming-policy
  precedents in ADR-0026. Correct the uncommitted people migration without resetting
  development data. Allow focused browser retries through the existing verification
  runner without copying its build and database setup.

- Deliver Collaborators and routes: collection roles are `viewer` and
  `contributor` throughout API contracts, policy, transfers, discussion and web
  access forms. A reviewed migration preserves grants and audit evidence; old
  role inputs are rejected. Add backend-authorized single-item reads and Details
  links at `?item=<id>` on both collection addresses, including later-page items,
  native close links, modal keyboard behavior and independently filtered references.

- Consume shared request contracts in web payloads and backend DTOs. Add exact
  DTO/type parity checks, include the existing commentsEnabled collection input,
  and export comment/transfer requests. Runtime validation and permissions remain
  backend-owned; untrusted share-open metadata retains forgiving API parsing.

- Consolidate preproduction management and sharing: remove scoped audit API views
  and duplicate wire projections, the held-only collection list/link resolver,
  redirect-only collection actions, and experimental `share_id` URL support.
  Dialog links now navigate directly; remove unused account-action/disclosure UI,
  global toast dispatch, social templates, redundant session reads and temporary
  migration/test scripts. Keep native fallbacks, access checks and event retries.

- Open collection actions by clicking the row or its keyboard-accessible name,
  removing the Action column and fixing the first-click hydration race. The popup uses
  the site's typography, colors and separators, keeps keyboard focus inside,
  closes immediately on action selection, and returns focus on Close/Escape;
  native links remain available without JavaScript.

- Move Audit Log actions below Include read events, with a secondary Apply
  filters button and adjacent Clear filters link shown only for applied filters.

- Sharing now stores creation intent in context and recognized UTM attribution,
  optional context and client occurrence timestamps on individual opens. Optional
  opening metadata is forgiving and returns structured warnings; new opens return
  201 and idempotent retries 200. Payload hashes support content comparison without
  affecting counting. Shared client helpers and the web use `via` links, preserve
  attribution through sign-in, and keep maintained open counters and destination
  analytics. No referral rewards or social integrations are introduced.


- Document why sharing uses separate entry/event tables: maintained open counters keep reads inexpensive, event details evolve independently, and transactional insert/increment preserves consistency on retries.

- Add Analytics immediately before Audit Log in Manage for operators and admins, with all-time share requests, reported opens, resource/destination breakdowns and manual Refresh. Permit audited operator aggregate reads while keeping individual service share records admin-only.

- Reserve web message templates per share kind for future social actions. Copy link omits message text and uses the API's generic default in its entry.

- Default API share messages to “Share {kind}”; custom messages remain supported.

- Add reusable sharing APIs: read-only previews, authenticated POST returning a complete share entry, optional JSON message/destination, filtered creator history, resource-owner aggregates and audited admin metadata. Tracked URLs carry `share_id`; authenticated web Copy link records one entry and loaded destinations report retry-safe opens. Messages and private tokens stay out of tracked URL metadata/storage respectively; recording never grants access. Add reviewed ShareEntry/ShareOpen persistence; counts describe requests and reported opens, not delivery or unique visitors.

- Reuse one contextual Share page for profiles, hubs, collections and nslinkhub, with Share actions on their viewing pages. Profile share links use immutable user IDs and survive username changes; return links preserve the source page, and collection access rules remain enforced.

- Collection action screens return to their originating page through a contextual link, retaining management filters. Share keeps Copy link visible during loading, enabled when JavaScript is ready; there is no separate Cancel control and social destinations remain deferred.
- Consolidated content, operations and authentication evidence into one `AuditLog` model with a data-preserving migration. Audit Log now has one permission-scoped timeline and shared search/pagination without context tabs; existing retention and replay guarantees remain intact.
- Compacted account details spacing and replaced hub handle/ID metadata with a linked hub name.


- Improve account-detail spacing: distinct name/username heading, aligned metadata,
  consistent session/action sections and stacked fields on mobile.

- Accounts shows Account (name and username), Email, Role, Status, Member since
  Last login and Sessions. Names have no anchor or link styling; clicking a row opens its detail page, with permitted action
  buttons at the bottom. Profile usernames link to the public profile beneath the
  name; detail rows start with User ID, Email and Hub. Collections uses a secondary Action button with direct
  links in a dialog. The API supplies permitted actions; no IP or user agent is exposed.
- Persist Last login on successful ordinary or invitation sign-in and show it in
  account details in local time to seconds. Failed/rolled-back sign-ins and session
  refreshes leave it unchanged; existing accounts remain unknown until they log in.
- Add reversible account deactivation and admin-only deletion with a 14-day grace
  period, cancellation, protected admin/self rules and audited transactional cleanup.
- Unify Collections into one ID/link-searchable table with permission-based actions.
  Connect owner publication, sharing, transfer and deletion to existing APIs;
  preserve the service moderation/private-content boundary. Add reader-toolbar Share.
- Rename Audit to Audit Log with Timestamp, Actor, Action, Target, Outcome and
  Change columns. Accounts accepts an exact copied user ID. Keep desktop timestamps
  on one line and use blue-underlined audit context tabs.

- Capture bounded before/after state and success/no-change outcomes for publication,
  share-link changes, direct access and transfers in the mutation transaction.
  Audit now shows actual targets, recorded effects and service reasons/results,
  with explicit gaps for older entries. Actions/decisions is the default web view;
  reads remain recorded and accessible. Dates use the viewer's local
  `YYYY-MM-DD HH:mm:ss`, including seconds and date rollover. One Search field
  replaces Actor/Target/Hub boxes and searches displayed actors, actions, targets,
  outcomes and changes, including partial IDs; Action and local date ranges narrow results.
  Full audit design
  and wide event logging remain separate deferred milestones.

- Deferred audit strategy/redesign and wide event logging to separate milestones
  after fundamental system operations. Recorded ADR-0020, qualified the current
  activity/audit relationship, and retained existing recording and telemetry
  contracts while the core workflows are completed.

- Display immutable actor ID segments in Audit using the same full-ID hover and
  copy interaction as Target. Username renames no longer change the visible
  actor reference; username search still resolves to the stable user ID.

- Show the final segment of target UUIDs directly in Audit, without type prefixes
  or expansion. Hover reveals the full UUID; clicking copies the full ID and
  displays “Copied” instead of a tick, clearing the feedback after two seconds.

- Compact ID disclosures across Audit and Accounts: display the final UUID
  segment without ellipses or collision extensions; click the expanded full ID
  to copy it, with its label retained and the full value available on hover.
  Expand by clicking the label without an arrow. Audit Target shows only the
  entity acted on, without related collection IDs.

- Show the stable user ID beneath each Accounts row, with an expandable suffix
  and a full-ID copy action matching Audit. Keep account details grouped on
  narrow screens and wrap long table values without horizontal overflow.

- Normalize hub/service audit: current usernames resolve from immutable IDs;
  separate Actor, Target and Hub filters keep full IDs through pagination.
  UUID suffixes expand to selectable/copyable full IDs and extend on visible
  collisions. New service collection events retain their event-time hub ID;
  historical events without that context remain unknown. Email search stays in Accounts.


- Unified Manage table continuation: Load more appends rows, preserves existing
  results on retry, and disappears at the end. Added cursor pagination to held
  collections instead of truncating at 100. Renamed the People tab/page to Access.

- Framed the active Settings section in a rounded panel, with unboxed navigation
  beside it, replacing the dividing line while retaining spacious, borderless field rows.

- Matched contributor username hover styling to other person and hub links:
  blue text without an underline.

- Made discussion height follow its own content, capped by available page space
  above the footer. Empty discussions stay compact; busy discussions can extend
  beyond a short collection. Removed collection-height observation from the sidebar.

- Matched verification-code email subjects, previews and bodies to sign-in,
  first-link saves, continuation, session recovery, sensitive-action confirmation
  and invitation acceptance. Resends retain the purpose; email-change messages
  remain distinct.

- Placed public-view shortcuts beneath Username and Handle in Settings. The
  profile shortcut waits for pending edits and opens the newly saved username.

- Added an optional personal bio in Profile settings and public profiles.
  Bios support up to 500 characters, preserve line breaks, and work without a hub;
  they are independent of hub descriptions and ownership visibility.
- Removed Copy hub link from Settings and moved View your public hub beneath
  the Hub ID. Removed the unused clipboard component and styles.

- Moved ownership visibility to `Hub.showOwner`, edited as **Show owner** in
  Settings → Hub. Removed the user-level visibility preference.
  Public relationship labels use “username of Hub Name” on profiles and
  “@handle by Owner Name” on hubs. Opting out removes owner identity from public
  hub responses and the hub from public person responses, while the private Hub
  menu entry remains. The migration preserves existing opt-out choices.

- Kept Profile as a viewing page showing the person’s name and username,
  with a separate Hub menu entry or an owner-only Create hub
  action. Profile edits are reached through Settings. The public hub-connection preference hides or shows the relationship in both directions while profile names stay visible. Added Settings ›
  Notifications for the existing always-on invitation behavior and moved all
  planned notification preferences there; Notifications remains the inbox.

- Aligned the hub Description field with Hub name and Handle in Settings;
  narrow screens retain the stacked layout. The description has a readable
  four-line minimum and grows with its content. Email address comes first in Profile; Hub ID
  comes first in Hub, followed by Hub name, Handle, Show owner and Description.
  Settings uses Profile, Hub and Notifications navigation with one section
  visible at a time, preserving drafts on section changes and using whitespace
  between fields.
- Unified management at `/manage`: context-aware owner/operator/admin navigation,
  owner collection and audit views, and a paginated People list of current
  collection collaborators. Accounts and Team remain service-authorized; owner
  and service data are never merged. Old `/ops` routes are removed. Owner email
  invitations and People extensions remain planned.
- Split service invitations into `/manage/invitations`; Team lists current admins
  and operators. Collection-access invitations will use the same presentation
  pattern with their own authorization.

- The footer sits at the viewport bottom on short pages and follows long content
  at the end of document scrolling. Desktop collection panels retain internal
  scrolling; narrower layouts use document flow. Audit pagination now has the
  standard spacing below its table. Audit Load more appends older events and
  disappears at the end. Accounts, Collections, Team and Audit use desktop table
  scroll regions while tabs, filters and column headings stay visible. Filters and loaded rows survive pagination retries.

- Clarified the planned hub metrics: subscribers and collection saves take
  priority; individual resource copies are a separate action.

- Removed sharing widgets from hubs, collections and the footer, including their
  unused styles and icons. The footer keeps Support, vertically centered and
  matching the header navigation font size.
  Redesign is recorded in the sharing/hub-engagement
  backlog alongside subscriptions and collection bookmarks/saves.

- Added a collection Contributors section above Discussion with linked avatars
  and usernames for small groups (avatars only above three contributors)
  and the real contributor count. The collection header shows **+N tags** beside
  its tag chips, counting distinct tags across every resource. Discussion stays
  below Contributors independently of the
  collection header and starts at half the collection height, growing with comments until it
  reaches the collection bottom, then scrolling internally.

- First-link capture resolves page titles and validates public URLs before sign-in,
  using the same lightweight lookup as the signed-in form. Rich previews belong
  on saved collection items. Failed lookups show a saveable fallback;
  URL validation, outbound-fetch protections and the 30/minute source budget
  remain enforced. Saving still requires verification.

- Implemented separate people and hub identities: sign-in creates a person with
  a unique username; first save, collection creation or incoming transfer creates
  their optional hub atomically. Public `/username` profiles show only available
  published contributions, with hub-owned control over the public owner connection. Attribution uses person
  usernames; hubs keep independent handles and immutable links. Settings,
  navigation and native forms support people without hubs. The reviewed migration
  preserves existing identity and visibility choices.
- Settled copying policy for the planned “Add to my collection” feature
  (ADR-0019): source owners can refuse copying, and every permitted copy must
  show source credit in the recipient's collection. Copying implementation remains
  in the preview/Add to my collection slice.

- Removed pre-production compatibility code: ID-only invitation status routes,
  bootstrap re-mail upgrades and the duplicate collection If-Match parser.
  Collection writes use body `version`; readiness uses `redisQueue` throughout.
  Removed unused token/error helpers, title-only metadata wrappers, an obsolete
  auth spike, dead styling and unused Nest adapters. Shared TypeScript checks
  now reject unused locals and parameters. Live email invitation/OTP flows,
  notification messages and conditional GETs remain covered by verification.

- Reconciled living documentation with implemented contracts and accepted
  direction: separate person/hub identity, pending role and route changes,
  owner Manage versus platform operations, attribution, auth/delivery and
  release boundaries. Consolidated web guidance, refreshed onboarding and
  runbooks, and moved foundation adoption history into completed records.
  ADR rationale and completed execution evidence remain available.

- Designed people and hubs as separate identities (ADR-0018): a person has an
  @username and a name; their hub — the face that owns their collections and
  subscribers, with its own name and @handle — is optional and created on the
  first saved link or collection. Sign in creates the account only; "Save your
  first link" is sign in plus add the link. People subscribe to hubs. Hubs live
  at `/@handle` and people at `/username`, with the app's route words reserved.
- Scope settled: nslinkhub stays a personal product. One person has one hub
  (shown as "Hub Name, by @handle"), the hub is never transferred (only
  collections are), people follow people, and collaboration is per collection
  with **contributors** and **viewers** (renamed from editors and readers next).
  An email change is only an email change. Hubs as organizations with members
  were explored and rejected (ADR-0017); GitHub-style organizations remain a
  later option. The credit for shaping a collection is "contributors"; the
  platform console will move to `/platform`; items open by `?item=` links. A hub
  page reads "@handle", or "@handle by Owner Name" when the owner shows it.
- People appear everywhere by their @handle; a name shows only on the person's
  own hub page (if they choose), and the API no longer sends names anywhere
  else. Comments read TikTok-style: "@handle · Contributor", then the age
  leading the actions ("53m  Reply"). The collection header keeps the owner,
  contributors and update time on one line, with Add a link moved up into the
  top bar; on narrow screens History and Edit fold behind a button that expands
  them in place, and the phone share panel stays on screen.
- Activity and attribution: every content change — a collection created or
  its details changed; links, references and sections added; items edited,
  removed, reordered or imported; comments hidden, shown or answered — is an
  activity entry written with the change. Collections show their contributors
  ("Paul John and 2 contributors"), items record who added them, and
  contributors get a History page of who did what. The hub audit includes the
  same entries; existing collections got a backfilled creation entry.
- Link metadata foundation: every link's page title, description and site name
  (text only) is stored once per address in `link_metadata` and shared across
  collections. Saving writes a pending lookup in the same transaction; the
  worker resolves it within seconds, retrying at 1 minute, 10 minutes, 1 hour
  and 6 hours (a failed address is retried when saved again, or when read a
  day later), and refreshes metadata older than 30 days when read. Lookups no
  longer run in the API process or change an item's version, and Save a link's
  preview reuses stored metadata. The resource field `titleOverride` is now
  `title`, with `description` and `siteName`; imports ignore source titles and
  cap addresses at 2,048 characters.
- `PRODUCT.md` reorganized as a PRD in pigfarm's flow: design context,
  overview, goals (guides north star; free library, paid Curator accounts),
  target users with their needs, proposed success measures, the hub and access
  model with roles, thirteen functional modules (purpose, status, behavior),
  technical requirements, acceptance, scope, open decisions, delivery and
  references. Journeys and requirements no longer repeat each other.
- Curator account direction gains **AI curation**: send everything in one
  bucket and get back a reviewable draft with proposed collections, sections,
  tags and notes, and duplicates, dead links and unsafe sites flagged; nothing
  lands without the person's review, and titles still come from the pages.
- Product direction: everyone's library stays free, and professional curators
  (educators, researchers, community and learning-program leaders) opt into a
  paid **Curator account** with analytics, members-only collections, bigger
  bulk work, link health and API access — also for people collecting resources
  from the open web at scale who use it as a curation layer, with rate limits
  sized to their plan (ADR-0016; details after the everyday build).
  Per collection, owners and editors are now **Contributors**: the discussion
  badge, hidden-comment notes and "Paul John and 2 contributors" attribution.
  The link annotation is simply the **note**.
- Closed open product decisions: sections are added and assigned in a
  collection's edit view; preview cards show the page description (the
  curator's note, up to 280 characters, in full in the details); notifications
  are in-app apart from codes, invitations, targeted shares and security; Word,
  Markdown and PDF downloads; account deletion with a 14-day grace period; bulk
  import limits confirmed; popular tags from published collections only. Manage
  gains Access (requests to view or edit, shares, link-shared collections);
  blocking happens where a person appears, with People listing followers and
  blocked accounts; follows belong to the hub and survive a handover.
- Designed three directions and added them to the build order: **Manage**, one
  workspace scoped by role, where every hub owner manages their hub
  (collections, comments, people and blocking, import, activity) and operators
  and admins keep the service sections (ADR-0014); **activity and
  attribution**, GitHub-style, where every change is recorded and drives the
  creator, curators, "added by" and the hub audit (ADR-0015); and **your
  home and following**: My collections, Shared with me, Saved and Following,
  with Follow on public hub pages. Everyone who shapes a collection is shown as a
  curator; Manage's Import & export section holds bulk import and multi-
  collection export, while a collection page offers Download; following
  notifies with a per-hub toggle; blocking stops participation only.
  Notifications are designed as one inbox for every kind (following,
  comments, saves and follows, sharing, invitations, imports, service), scoped
  by role, with settings on the Notifications page; they move up the build
  order ahead of following.
- Backlog brought up to date: seven finished plans closed; `PRODUCT.md` §9 now
  lists everything still to build, in order (link metadata, bulk import,
  preview cards with curator's notes and Add to my collection, collection
  management in the web, discussion follow-ups, Discover search, the rest of
  the internals pass, account work, the extension, direct shares to people
  without an account, ns-series single sign-on, release). Item-level saves are
  replaced by Add to my collection (a quick save); following hubs is planned.
  Preview cards are metadata only (no images or icons, so viewing never
  contacts linked sites) with just View and Edit; targeted sharing is by
  invitation, which needs an account. Monetization is chosen after the build.
- Discussion replies from a collection's owner or editors are all badged
  Curator. Permission roles stay `reader`/`editor`; labels are chosen per
  surface (ADR-0013). Bulk import is designed as Save a link at scale — a
  reviewed draft with resolved titles, in-place fixes and folders mapped to
  sections or separate collections (ADR-0012, `docs/design-docs/bulk-import.md`).
- Documentation reorganized the pigfarm way: `PRODUCT.md` is the PRD (now with
  a product design context), `ARCHITECTURE.md` the system-architecture
  authority (domain model, client surfaces and invariants absorbed), and the
  new root `DESIGN.md` the visual system with every theme token (replacing
  `docs/design-docs/web-design-tokens.md`). `docs/SYSTEM_DESIGN.md` was split
  into focused designs — tenancy and access, identity and handles, collections
  and resources, discussion, email verification, exports — with its delivery
  status moved to `PRODUCT.md` §9. New `docs/README.md` map; the design-docs
  index is now `README.md`.
- Product and system docs brought up to date: `PRODUCT.md` is now a shareable
  product definition (problem and goals, users, journeys, requirements,
  acceptance, current state by surface, open decisions such as the editor role
  name and titles on import). `docs/SYSTEM_DESIGN.md` describes the
  verification flow, link titles and public addresses, the operations console,
  the squashed migration and the current delivery status. `PLANS.md` maps the
  repository's plans to the shared namestarlit workspace, which now lists
  nslinkhub as its active product.
- Engineering decision records (`docs/engineering-decisions/`) for the
  foundations much else depends on — tenancy, identities, backend-owned rules,
  passwordless codes, serialized writes, pre-deployment changes, resolved
  titles, references, operator authority, the verification flow, toolchain —
  each with its rationale and constraints. A change that contradicts one must
  supersede it explicitly.
- One email-verification flow for every situation (sign in, first link,
  signing in to do something, a session that ended mid-action, confirming a
  sensitive action, invitations): the same two screens, worded for the
  purpose ("Sign in to join the discussion.", "Your session ended before we
  could post your comment."). Actions interrupted by an ended session now
  continue after signing in instead of being lost, and only for the person
  they belong to. Toasts use the page's own
  surface and border instead of an inverted pill; a resent code says so, a
  first send doesn't repeat what the page already says.
- Sensitive operator actions that need a fresh code now ask "Confirm it's you"
  (names the action and the signed-in email; Send code or Cancel, nothing is
  emailed until chosen), then finish the action by itself once the code is
  accepted. Code screens say "Didn't receive the code? Send a new code" and
  accept codes pasted with spaces or dashes. Ops tabs no longer scroll.
- Service operations redesigned around four accessible tabs (Accounts,
  Collections, Team, Audit). Accounts: search by email or hub handle, a table
  with suspend/reactivate and sign-out quick actions. Collections: review from a
  pasted collection link; held collections listed and released from their row.
  Team: invite field plus operator and invitation tables with Resend and Revoke.
  Audit: one filter row (search, action, dates, Clear filters) over a table with
  hub handles. Confirmation checkboxes removed; search text never appears in
  page URLs. API: `accounts?q=`, `collections` (held), `collections/resolve`,
  audit `q`; `POST accounts/lookup` and audit `actor`/`target` removed.
- "Add a link" sits in a collection's fixed header, under its metadata, so it is
  always in reach without scrolling.
- Links must be public web addresses: localhost, loopback, IP, local/internal
  and example/test names (`example.com`, `.test`, …) are refused by the API
  (`link_not_public`, imports report `not_public_url`) and flagged in red in
  Save a link.
- Pre-deployment reset: all migrations squashed into one `0_init` (schema
  unchanged, verified with `migrate diff`); the unused `users.bio`,
  `capture_receipts.hub_id` and `resource_id` columns are gone. New
  `bun run db:seed` loads six real collections curated from the engineering
  toolkit, with sections and titles read from the pages.
- Cleanup: removed the dead inline-rename path, the `/profile` and
  `/invitations` redirect pages, unused props, notices and styles; shared
  limits (2 links per save, 30 tags of 80 characters) and input checks now live
  in one place for the API and the web.
- Save a link takes one or two links per save, each with optional tags
  (added as chips behind "Add tags"; the collection edit page uses the same
  shared tag field), into one chosen collection. The link
  field turns blue when the page's title is found and red, blocking the save,
  for a repeat, a non-address or a domain that doesn't exist; a "Bulk import
  links" button tells people who press it that import is coming.
  Titles are never typed: they are resolved from the page (shown as you
  paste; YouTube via oEmbed), and links still missing a title are resolved
  when their collection is opened.
  New collections are named on creation (suggested "Saved links, Oct 7", never
  repeating), and the destination list shows when each was last updated.
  `POST /api/v1/capture` now takes `links[]` and returns `resourceIds`; new
  `GET /api/v1/link-preview`. Titles are no longer accepted when adding links
  or references, and item edits change only tags and position: what belongs to
  a link (address, title) or a heading stays as saved.
- Focus rings show only for keyboard navigation: after a mouse or touch press
  no outline appears (including when returning from another window); Tab or
  arrow keys bring it back.
- Review fixes: a reference to a collection the reader cannot open no longer
  reveals its id or stored title; exports render outside the global write lock;
  default hub names keep every word of a name (only generated handles drop
  their random suffix, and retry suffixes never reach the name).
- Hub and collection sharing use the same unboxed section and text actions.
  Hubs show it inline below the description; collections keep it above Discussion.
  Copy confirmations reserve space so nearby content stays still.

- Discussion disclosures retain pointer focus without gaining a blue outline
  after window switching; keyboard navigation still shows the focus indicator.

- The desktop collection share panel and Discussion header stay visible while
  comments scroll independently. Add a comment opens the composer, whose hint
  invites questions or notes. Closing preserves drafts; sign-in returns readers
  to the open composer. Native disclosures work without JavaScript.

- Sharing is one row of text links (LinkedIn, X, WhatsApp, Share link) with a
  “Link copied to clipboard.” confirmation beneath; Reply/Edit in comments put
  the cursor in the text box.
- Collection reading smoothly folds the description before links begin scrolling,
  retaining the title, tags and author/update metadata. Continued scroll input
  carries through the transition; returning to the top restores the description.
  Reduced-motion preferences skip animation.

- Review repairs: partial imports isolate database row failures with savepoints;
  bounded multipart parsing finishes before the authority lock and session
  recheck. Sign-in resend cooldowns no longer invalidate flow cookies. Replies
  paginate per thread with accepted answers first and native continuation links.
  Page-title lookups use one aborting deadline across DNS, redirects and streaming
  bodies. Signed web DELETE forms retain each visitor's source budget.

- Emails end with the web footer (support prompt, “© year nslinkhub”, “an ns
  series product”); code emails keep a single “Do not share this code with
  anyone.” warning. The footer always links the new web `/support` page, which
  shows the support address from `SUPPORT_EMAIL`; the site footer links Discover
  and Support.
- People appear the same way everywhere: name (only if they show it) plus
  `@handle`, linking to their hub. Collection pages show “Created by” when the
  creator differs from the owner. The discovery API is now `GET /api/v1/discover`.
- Collections have a discussion: signed-in readers with access comment and
  reply (one level), curator replies are labelled, owners/editors mark the answer
  and hide comments, authors edit or delete their own, and owners can switch
  comments off on the edit page (new `collection_comments` table and
  `collections.comments_enabled`). Notifications and operator moderation for
  comments are the next milestone.
- The web app has one cohesive visual system: self-hosted Schibsted Grotesk on
  every OS, one left content edge, ink titles with accent reserved for actions,
  one control size (38 px, 44 px on touch), and a refreshed light/dark palette
  with recalculated contrast. The wordmark stays the plain `nslinkhub` text.
- Discover (`/discover`, formerly Explore) leads with “Someone already found your
  next good read.” over calm, fully clickable collection cards. Collections read
  as one sheet matching the landing example; resource rows open on a click
  anywhere. Owners get one Edit button and a dedicated `/c/:id/edit` page in place
  of per-field inline editing, plus an “Add a link” row; signed-in users get Save
  a link in the top bar.
- Share menus (Copy link, device share sheet, Email, X, LinkedIn, WhatsApp)
  replace Copy link on collections and hubs. Transient confirmations appear as
  top toasts; inline notices are info, warning or error toned. Landing questions
  loop with no control. Settings fits one view and drops the duplicate Sign out.
- The collection header stays fixed on desktop while sections and links scroll,
  with GitHub-style “Updated 3 hours ago” metadata; from 1024 px sharing sits in
  a permanent panel beside the collection.
- Pages feel faster: the layout reads session, profile and theme in parallel,
  navigations only show the loading state after ~300 ms, and returning to a tab
  re-checks the session instead of reloading the page.
- Sign-in codes can be resent once every 30 seconds per address (server enforced,
  with a live countdown on the code page).
- Saved links without a title get the page's title automatically after saving,
  through an SSRF-guarded fetch (public addresses only, pinned connection).
- Notifications are expandable items with unread markers; opening Notifications
  resets the badge and “Clear all” empties the list (new `notifications_seen_at`
  and `notifications_cleared_at` user columns; `/api/v1/notifications`).

- Unavailable collections explain that they may be private or no longer exist.
  Signed-out readers can sign in and return to the same collection; API reads
  keep private and missing targets indistinguishable.

- **Breaking:** collections are independent. Removed parent fields, nesting/children
  endpoints, inherited grants/holds and recursive ownership operations. Collection
  references are ordinary ordered resources, including references across hubs;
  each destination keeps its own permissions. Deleting a target leaves an
  unavailable reference, while source deletion/transfer never affects targets.
- Guides support ordered heading resources. Markdown, PDF and Word exports keep
  references as links by default; explicit expansion includes one readable level,
  preserves headings and marks unavailable references without leaking content.
  Web reference navigation uses immutable URLs without forwarding share tokens.

- Your hub now shows its name, handle, optional owner name and description
  above Your collections, with Copy hub link beneath the description.
  Save a link remains the main creation action. Public preview stays in Settings.
- Collection owners edit the title, description and tags in place, saving on
  blur/Enter with cancellation, retained failed drafts and version-conflict recovery.
  Native forms remain available without JavaScript.
- Stable `/h/:hubId` and readable `/@handle` routes show owners their own hub
  and visitors published content. `/hub` redirects to the stable address; Settings
  explicitly opens the public preview with `?view=public`.

- Settings renders Profile and Hub directly, without Account/Appearance tabs.
  Appearance stays in the header. Profile includes
  email and member-since; Sign out sits at the bottom. Copy hub link shares the
  permanent address with an outlined button before View your public hub.
  Full name belongs to the user; the hub has an independent Hub name, public
  Description, immutable ID and editable handle. The user bio editor is removed. Changes autosave with draft recovery and a retained public-hub link.
- Public hubs resolve by stable `/h/:hubId` or readable `/@handle`, and show
  “@handle by <owner name>” when named, otherwise only the handle. Their grouped
  header places the Copy hub link text action below the description. The collection
  count sits with its heading, and empty feedback stays beneath it. Hub creation and update
  dates are omitted; collection update dates remain. Counts exclude private and held content across all pages. Collection
  previews show description, tags, hub handle, owner attribution and updated date.
- Account avatars prefer a chosen image, then Gravatar for the verified email,
  then the generated fallback. Gravatar is proxied; email hashes stay server-side.
- Header Explore and Sign in links match the weight of text actions.
- The header uses one icon button cycling System → Light → Dark → System, with
  System as the default and the current mode shown by its icon.
- Hid unnecessary single-page collection pagination and exposed collection name,
  description and tags in one edit form, including native form error recovery.

- New accounts without a usable name receive readable generated hub handles
  instead of `hub`/`hub-2`. Defaults do not expose email addresses; supplied names
  still seed handles, and existing handles remain unchanged.

- Added first-link capture through verified email, atomic private collection/link
  creation, concurrent-first-save handling and scoped replay receipts. Added
  owned-collection hub navigation, add-another and optional rename with retry drafts.
- Refined collection browsing with description previews, hub/date metadata,
  whitespace grouping and desktop pages sized to the available frame; mobile
  retains scrolling. Kept Sign in navigation and purposeful structural dividers.

### Public landing and neutral theme

- Kept button-styled links free of text underlines on hover, consistent with
  native buttons.

- Paired saving and discovery in one desktop composition beside a compact
  collection example. Kept the discovery CTA directly beneath its heading,
  moved browsing guidance to Explore, and preserved mobile stacking.

- Introduced a non-looping typed question sequence on the landing page, with
  four-second reading pauses, Pause/Resume/Replay controls, stable layout and
  static reduced-motion/no-JavaScript alternatives.

- Kept header/footer visible around a scrollable content area, with an accessible
  document-scroll fallback for very short viewports. Explore and public hubs use
  compact responsive collection lists. Removed decorative arrows from links.

- Added a product landing page at `/` and moved public collection browsing to
  `/explore`, preserving pagination and reader recovery links.
- Grouped Explore with the account controls on the right of the header, leaving
  the wordmark on the left. Signed-in wordmarks still open the user's own hub.
- Refined light/dark surfaces with neutral grays and charcoal, preserving the
  blue accent, accessible feedback colors and system appearance default.


### Generated avatars

- Added deterministic SVG avatars from immutable user UUIDs to the account menu
  and profile. The API preserves the approved shape/color algorithm, validates
  seeds and dimensions, and supports immutable caching and conditional ETags.
- Added a UUID avatar redirect without account lookup; no external image
  provider, persistence or uploaded-photo support is introduced.

### Profile feedback and navigation loading

- Kept one explicit Save profile action, enhanced to save in place with green
  inline “Saved” feedback beside the button, retained drafts on failure and protection for newer edits.
- Added authenticated live hub-handle validation; final writes still enforce
  uniqueness, including competing claims. The hint previews the public address
  and shows validation guidance only when the handle changes.
- Replaced full-page navigation skeletons with compact progress and delayed
  reload recovery, preserving private-content revalidation.

- Added page-specific browser titles with the nslinkhub suffix.

### Account navigation and appearance

- Added an avatar-only account menu with Profile, Notifications, Settings, authorized Service
  operations and Sign out. The wordmark keeps its normal color without an
  underline and sends signed-in users to their own hub. Explore is always in
  the header, replacing the duplicate hub/collection breadcrumbs.
- Added Light, Dark and System themes with a browser preference that persists
  without JavaScript. Appearance lives in Settings; signed-out visitors always
  follow their device theme. The footer stacks the current-year product copyright
  above a smaller “an ns series product” line.
- Removed the client Service status page and links; API health and readiness
  endpoints remain available for monitoring.
- Connected profile editing to the existing own-account name, biography and hub
  handle API; credentials remain outside the profile form.
- Added Notifications for service invitations, with a badge for invitations needing
  attention. These are informational messages directing recipients to email,
  without an extra invitation-page chain. Sharing updates follow
  in the next notification milestone.

### Local development

- Routed the root dev launcher through API, worker and web workspace scripts,
  with named startup/failure output and an explicit web ready URL. Extended
  dev-loop acceptance to check the sign-in page and readiness announcement.

### Service operations

- Added startup admin invitations and admin-only operator invitation management.
  Acceptance starts from a private emailed link. Inviting/previewing creates no
  account; new recipients enter their name and accept, then verify an emailed OTP.
  Every recipient verifies a fresh invitation-bound email OTP before the role
  activates, including signed-in users; existing names remain unchanged. Email
  invitations now have a prominent **Review invitation** button.
  Tokens rotate on resend; account invitation lists are status-only. Added expiry, resend/cancel, access revocation,
  invitation audit and zero-admin invitation recovery; removed direct operator CLI
  grants. Replays and restarts never restore revoked access.
- Root workspace commands and development launcher use exact Bun `--filter`
  selectors; Prisma retains its configuration directory.

- Added native email-code sign-in, resend/recovery, sign-out and `/ops` account,
  collection-moderation and audit pages, including operation without JavaScript.
- Added accepted admin/operator grants, account suspension/recovery,
  session revocation and public collection distribution holds. Restrictions cover
  authentication, lists, section/resource reads, exports and redistribution,
  while preserving active-owner correction and private-content boundaries.
- Added atomic operator audit, expected versions and idempotent commands, recent
  verification, serialized authority checks, bounded retention and an invitation/recovery
  runbook. No real operator is automatically seeded.
- Preserved visitor request budgets for native forms using separate signed source
  attribution; browser Origin validation remains mandatory. Document referrers
  disclose only the origin so native POST retains Origin without leaking paths.

### Web reading

- Added `/status` and public navigation with aggregate ready/limited/unavailable
  states, separate unconfirmed failures, deliberate rechecks, Retry-After and
  no-JavaScript recovery. The page omits dependency details and remote error
  messages; status links and API reads never propagate share tokens.
- Added production browser status acceptance for real readiness responses,
  outages, failure recovery, responsive keyboard access and cancelled rechecks.
  Global loading feedback now covers both collection and status navigation.

- Added public hub browsing at `/@handle` and pretty collection reading at
  `/@handle/<slug>`, reusing the permalink reader and copying only immutable
  `/c/<id>` links unless shared access is explicitly requested. Public lists
  stay publication-only for owners and other visitors; readers link back to
  the public owning hub without forwarding share tokens.
- Added hub-aware cursor continuation, current-route recovery, duplicate
  suppression and accurate append announcements. Production browser coverage
  proves no-JavaScript navigation, privacy, rename durability, failure/retry,
  revocation and responsive keyboard reading; encoded `@` route parameters
  have a source regression.

- Added explicit reload recovery when document navigation is cancelled, keeping
  stale reader content hidden until fresh server authorization. Browser coverage
  checks Escape cancellation, keyboard recovery and revocation while waiting.

- Prevented API-local env files from overriding disposable verification
  databases or restoring live delivery/telemetry settings. API, browser and
  dev-loop runners now preserve explicit masks through nested child processes;
  regression fixtures cover conflicting env files and configuration resolution.

- Preserved per-visitor API read budgets through authenticated server source
  attribution, restored saved section title overrides/tags, and made the dev
  orchestrator honor API-local port configuration before checking listeners
  and configuring the web API origin. Added spoofing, budget-isolation, metadata
  and environment-precedence regressions.

- Added the first W3 vertical slice: explore → collection permalink → section
  or external resource, with cursor continuation, no-JavaScript fallback,
  safe errors, explicit shared-link copying and responsive keyboard reading.
- Adopted Pigfarm's separate runtime config, HTTP-client and host dev-loop
  patterns under NSLinkHub's same-origin, uncached-data contracts. Web code
  consumes API wire types; import checks reject persistence/backend access.
- Added browser-origin protection for cookie-authenticated API mutations and
  production browser verification using isolated API/database fixtures. Image
  builds remain separate deployment work.

### Development and release workflow

- Fixed intermittent auth-delivery test failures by extracting the standalone
  email code rather than an eight-digit segment in a generated target address.
  The handover fixture now exercises that numeric-address case deterministically;
  production authentication behavior is unchanged.

- Separated routine application verification from Docker image acceptance.
  Push/PR CI keeps compilation and real-service tests; the manual release
  workflow now gates image publication on the image build and rehearsal.
- Closed the reviewed local auth-delivery milestone and made W3 scaffolding
  next. Fresh image acceptance remains tracked for deployment preparation.

### Auth delivery

- Removed better-auth's additional production-only HTTP throttle so code
  issuance and resends follow the documented shared PostgreSQL budgets. Added
  production-process HTTP coverage proving both identity and source limits
  still apply; per-proof wrong-attempt protection remains enabled.

- Fixed cross-workflow email-change proof collisions by namespacing library
  verification and outbox identifiers with an unambiguous account/session/address
  tuple. Restarting handover invalidates both prior proofs and pending mail;
  legacy unscoped proofs cannot authorize a handover. Added collision, restart,
  attempt-limit and legacy-proof regressions.

- Preserved recipient suppression across auth-secret rotation with an independent
  stable suppression secret. Signed Resend delivery references reconcile lost
  receipts and bounce/complaint suppression even after expired codes are erased.

- Added codes-only sign-in and two-step account-email change through better-auth,
  with keyed proof storage, shared abuse budgets, purpose/session/target binding,
  transactional hub onboarding and all-session revocation after handover.
- Added encrypted PostgreSQL email intent, an isolated BullMQ relay/worker,
  capture and Resend providers, retries/claims, signed idempotent webhooks,
  suppression and credential/metadata cleanup. Production topology uses the
  same immutable image for a separate worker; no live delivery is claimed.
- Removed direct authentication links from email templates and product contracts;
  removed password signup, sign-in, enrollment, change and reset by explicit
  pre-deployment product decision. Optional TOTP/recovery codes are a separate milestone.
- Removed profile credential writes and disabled account deletion pending its
  verified retention workflow. Email handover revokes all sessions, with no password route back in.

### Documentation

- Defined the service-operator milestone: account lookup, suspension/reactivation,
  session revocation, public-content holds and audit. Documented deployment-only
  grants, privacy boundaries, recovery, concurrency and retention; reconciled
  the earlier no-admin wording to preserve the ban on private-content bypass.
  Implemented the reusable web sign-in journey and operator workflows below.

- Recorded the reviewed W3 reading milestone and the next planned vertical
  journey: public hub → pretty collection URL → section/resource. Added API
  evidence, privacy and rename acceptance, and corrected stale web-scaffold
  and Phase E routing status. The subsequent implementation is recorded above.

- Reconciled auth-delivery status across system design, onboarding, reliability
  and adoption guidance. Documented the additive migration chain, current email
  queue and audit retention, and separated local backend completion from
  outstanding browser and live-provider acceptance.

- Recorded a pinned comparison with Pigfarm (`f0bab0a`) and the remaining
  foundation adoption decisions in `docs/design-docs/adoption-decisions.md`.
  The sequence separates W3 design, test isolation and safe wire/error contracts
  before web implementation, auth/email delivery with the code-first account
  journey, and public-release operational gates. Reference-only proposals and
  incomplete deployment work are distinguished from implemented patterns.
- Updated the observability direction to LogTape + Sentry application
  telemetry with shared Alloy collecting stdout and dependency metrics;
  the comparison was documentation-only; implementation follows below.
  Retained NSLinkHub's individual
  hubs, stable URL scheme, and synchronous exports rather than adopting
  Pigfarm-specific product behavior.
- Reconciled the security document's stale membership rules with the built
  Drive model, recorded cookie-mutation/CSRF and auth-origin verification gates,
  expanded delivery failure/retention acceptance, and refreshed the debt tracker
  and onboarding walkthrough. The walkthrough pin must be advanced in its
  guide-only follow-up after the reviewed documentation commit exists.

### Added

- Pinned better-auth delivery spike with synthetic capture, recording OTP
  replay/expiry/resend behavior and native code/link, email-change/session and
  delivery-callback incompatibilities, subsequently addressed by the codes-only
  transaction-scoped integration above.
- Explicit auth composition factory for persistence, configuration and
  delivery plugins. Profile writes no longer accept email/password; password
  authentication is disabled. Account
  deletion is disabled pending verified proof and retention. Test processes
  force capture delivery regardless of local Resend settings.

- W3 design milestone for adoption gate #2: product experience, interface
  system and canonical Tailwind token documents, including verified palette
  contrast, read-only journeys, browser boundary requirements, recency-first
  discovery and dormant-save presentation. Web implementation remains next.

- Completed local adoption gate #1: shared typed error catalog, trusted
  application exceptions, status-safe framework mapping and bounded DTO
  field/rule issues. Validation details now use `issues` instead of `messages`;
  actionable domain conflicts have stable codes rather than generic messages.
- Explicit ISO-string mappers checked against shared wire types, plus real
  HTTP contracts for W3 reads, sharing privacy, dormant saves, audit, readiness,
  malformed input and hidden/missing 404 equivalence.
- Local Markdown-link/anchor enforcement and concurrent disposable-database
  lifecycle checks in the full verification gate. Cleanup now waits for DB
  creation and child shutdown before dropping only its owned database.
  Preservation checks use an owned sentinel so unrelated runs cleaning up
  their databases cannot cause false failures.

- Local release foundations (#4 first): telemetry-first API startup, pinned
  LogTape/Sentry logging, isolated request traces/metrics, SDK privacy hooks,
  sanitized unexpected failures and bounded shutdown. Real local SDK-envelope
  tests cover privacy, concurrency, correlation, aborts and collector failure.
- Transactional publication/share/link/transfer/deletion/handle audit with
  owner-scoped `GET /api/v1/me/audit`, including audit-read records and retained
  source-hub history after transfer. Added shared PostgreSQL request budgets,
  explicit proxy trust, safe fail-closed responses and bounded counter cleanup.
- API Dockerfile, local/production Swarm definitions, verification and manual
  GHCR-image workflows, plus a disposable image/migration/backup-restore/outage
  rehearsal and operator release runbook. Live infrastructure is deferred;
  artifacts do not claim Swarm, Dokploy, off-host restore or Alloy readiness.
- Pulled isolated e2e databases and explicit source test discovery forward from
  #1; tests no longer write to/reset development data or consume its request
  budgets. Added a telemetry import/logging boundary check to verification.

### Fixed

- Release-image rehearsal now mounts synthetic secret files individually,
  preserving the private host directory while allowing a different container
  UID to read them. Fixes the first hosted CI run's migration-step EACCES;
  added a UID-65534 read check to prevent recurrence.

- Production startup now executes the actual compiled `dist/src/entrypoint.js`
  with compiled alias resolution; builds explicitly generate Prisma from schema.
  Link enable reads token state under its transaction lock so a stale request
  cannot restore a rotated token. Fresh TypeScript 6 installs use explicit
  email-package ambient types and NodeNext-compatible shared type exports.

### Added

- Stack-wide local conventions adopted (zanlis.dwh handoff): nslinkhub owns
  the **+4 local port offset** — compose publishes PostgreSQL at
  `127.0.0.1:5436` and Redis at `127.0.0.1:6383` (in-code dev defaults
  updated to match; API stays at its project-specific 4000) per
  `/home/ns/Person/stack/docs/local-port-registry.md`; topology files are
  named `docker-stack.<env>.yml` (hyphen — docs updated ahead of the first
  stack file). Along the way: `prisma.config.ts` now resolves
  `DATABASE_URL` through `readSecret` with the local default, so
  `bunx prisma migrate deploy` is zero-config on a fresh clone (a stale
  local `.env` had been masking that it previously required the variable),
  and README's remaining pre-reshape claims (username plugin/routes, queued
  PDF note) are gone.

- Verified pushes, enforced locally (pigfarm pre-push handoff): a versioned
  `tooling/git-hooks/pre-push` hook runs `bun run verify` before every push;
  `bun install` wires it via the root `prepare` script
  (`tooling/setup-git-hooks.ts` sets `core.hooksPath`, no-op without
  `.git`). Deletion-only pushes skip; emergencies bypass with
  `git push --no-verify` or `SKIP_VERIFY=1` (generic name — branding stays
  out of env vars). The fast-hook/CI-authoritative escalation path is
  documented in the verification runbook ahead of its trigger.

- Developer onboarding walkthrough (`docs/guides/`, the first guide-track
  doc): six follow-along sessions — make it run, product model, curl
  walkthrough, failure drills + policy trace, config/verification, W3
  direction + readiness gate — replacing the read-everything-then-act ref/
  guide (pigfarm walkthrough-format handoff). The guide pins the commit it
  was last verified against, and `check:guide-pin` (in `bun run verify`)
  fails when any file the guide links changes after the pin; clearing it is
  a sweep + pin bump in a guide-only commit. `docs/exec-plans/` and
  `CHANGELOG.md` are exempt (the guide points at them by design). README's
  stale "Implemented So Far" (pre-reshape vocabulary) rewritten while adding
  the front-door links.

- `docs/SECURITY.md` § "Origins, CORS, and CSRF": records that the absence of
  CORS configuration is deliberate and complete (CORS relaxes the browser's
  Same-Origin Policy; configuring nothing grants no relaxation), why CORS can
  never be the access-control boundary, the CSRF nuance (simple-shaped
  requests still send; JSON bodies force failing preflights; better-auth owns
  origin checks on auth routes), and the standing rule: any future
  state-changing endpoint accepting a "simple" browser request shape adds
  explicit CSRF protection at that moment. Written so future security reviews
  don't misread the absence as an oversight. Also de-staled the membership-era
  wording in the auth-boundary and audit sections.

- Root scripts adopt the `<service>:<action>` convention: `infra:up` /
  `infra:down` (docker compose), `api:dev` / `api:start` / `api:prod` /
  `api:build` / `api:test`, `email:test`, `types:typecheck`. Per-service dev
  scripts chain `infra:up` (idempotent), so there is no start-order to
  remember; bare `dev` is the daily orchestrator (infra + API watch; the web
  joins it at W3). The old `start:*`/`test`/`typecheck:*` root names are gone
  (one way per action).

- Account-email change is specified as the double-verified handover flow
  (Substack model): confirm from the current address (which sees the target
  address; ignoring changes nothing) → verify the new address → change
  applies and all sessions are revoked. Sign-in direction decided:
  **code-first from the get-go** (continue with email → code screen; the
  email carries code + direct link; password is the explicit alternative,
  never the headline — no username era to migrate away from). The W3
  Impeccable pass shapes presentation, not flow order. Both documented in
  SYSTEM_DESIGN/PRODUCT; templates for the two change steps
  (`renderEmailChangeConfirmation`, `renderNewEmailVerification`) join
  `packages/email` on a shared code-email base. Wiring lands with the
  auth-delivery slice.
- `packages/email` (`@nslinkhub/email`): backend-owned React Email templates,
  starting with the **sign-in code** email (`renderLoginCode`) — Substack-style
  minimal layout with the lowercase `nslinkhub` wordmark, large spaced code,
  validity line, sign-in button + plain-link fallback, bold do-not-share
  warning, muted support footer. Typed and validated inputs (https-only URLs,
  code format, 1–60 min expiry), HTML + plain-text renders, subject never
  carries the code. Wired into `bun run verify` (typecheck + tests). Delivery
  (Resend adapter, outbox, worker) still lands with the auth-delivery slice
  per `docs/design-docs/transactional-email.md`.

- Nested access inheritance: the collection access policy now resolves up the
  ancestor chain, so a share, active link, or publication on a parent
  collection grants the same access to its descendants (and their resources),
  Drive-folder style. Also fixes published nested guides — a published
  table-of-contents collection now makes its sub-sections readable. A link
  grant records against the collection whose link was actually used (which may
  be an ancestor).

- Collection ownership transfer (`POST /api/v1/collections/:id/transfer`,
  `{ email }`). Drive-style: only the owner may transfer, only to a user who is
  already an `editor`. The collection subtree moves into the recipient's hub,
  the recipient's now-redundant shares are removed, the previous owner is given
  `editor` access across the subtree (landing it in their shared/), and the
  immutable creator is untouched. Guards: self-transfer and recipient-hub slug
  collisions are rejected.

### Changed

- Updated the workspace TypeScript compiler from 5.9.3 to 6.0.3 across the
  API, shared types, and email packages.

### Fixed

- Sign-up no longer auto-issues a reserved hub handle (review finding #2). The
  handle rules moved to a shared `hubs/handle.ts` used by both `HubsService`
  and the framework-free onboarding path; `createPersonalHub` skips reserved
  handles when deriving one (e.g. a user named "Explore" gets `explore-2`, not
  the reserved `explore`).

### Added (W3 readiness)

- `GET /api/v1/hubs/by-handle/:handle` — handle → hub-page resolution, backing
  the web's `/@handle` URLs (the payload carries the immutable `hubId`).
- `GET /api/v1/collections/:id` — the durable permalink read: the immutable id
  survives slug renames (hub+slug stays the pretty URL). Same optional-auth +
  share-token + ETag semantics as the hub+slug lookup.
- `@nslinkhub/types` gained `users.ts` (`Profile`, `UpdateProfileRequest`) and
  `CollectionShareView.email` — present for direct shares (the owner supplied
  the email), `null` for link-source shares (their email was never the
  owner's to see).

- System status/readiness (pigfarm pattern): `GET /api/v1/status` now reports
  per-dependency readiness — postgres (authoritative; down = 503
  `dependencies_unavailable`) and the queue Redis (reserved for future email
  delivery; down = `degraded`, product fully usable). Checks use a fresh,
  non-reconnecting client with a 1.5s timeout; the API holds no standing Redis
  connection until the email worker wires BullMQ. `GET /api/v1/health` stays
  the dependency-free liveness probe. Redis config collapsed to one
  `REDIS_URL` (validated, `_FILE`-capable, local default
  `redis://127.0.0.1:6379`) — `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` are
  gone; the stale "nslinkhub-api-v2" service tag is gone with the old static
  status payload.
- Zero-config dev / required prod: development needs no configuration
  (in-code localhost defaults, no secret files), while anything provided is
  honored — resolution order is exported env var → optional `apps/api/.env`
  → in-code default. `_FILE` inputs are the deployed contract
  (previews/staging/production). With
  `NODE_ENV=production`, startup validation refuses to boot when
  `DATABASE_URL`/`BETTER_AUTH_SECRET` are absent or the auth secret is the
  public dev default (unit-tested).
- Deployment-secret `_FILE` contract implemented
  (`apps/api/src/config/secret.ts` + unit tests): `DATABASE_URL_FILE` and
  `BETTER_AUTH_SECRET_FILE` (docker/swarm secrets) take precedence over the
  plain env vars; file content is trimmed; an unreadable `_FILE` path fails at
  startup; local defaults keep dev zero-config. Redis credentials adopt the
  same `readSecret` when the email worker wires BullMQ.

### Changed (W3 readiness)

- One public origin, no CORS: web and API are served same-origin (Traefik
  path-routes `/api/*` in production; Next.js rewrites proxy in dev). The API
  dev port moved to **4000** — 3000 belongs to the web app — and
  `BETTER_AUTH_URL` defaults to `http://localhost:4000`
  (see `docs/design-docs/infra-deployment.md` § Origins).
- `GET /collections/:id/children` is unpaginated and returns the plain section
  list: access inheritance guarantees every child of a readable parent is
  readable, so the per-child policy loop and the page/limit dialect (the API's
  only one) are gone; `PageMeta` left `@nslinkhub/types`. Section order lives
  in the parent's resources.
- Documented the web URL scheme as a W3 contract (`docs/SYSTEM_DESIGN.md`):
  `/c/<id>` is the durable permalink (survives rename/transfer/re-nest; what
  share buttons emit), `/@handle` + `/@handle/<slug>` are flat pretty browse
  URLs allowed to break; no nested URL forms — structure never encodes into
  an address.
- Docs re-arranged: the authoritative design moved up to **`docs/SYSTEM_DESIGN.md`**
  (was `docs/design-docs/hub-architecture.md` — the name had drifted; the doc
  covers the whole system, and the deep design now sits at a glance beside
  `SECURITY.md`/`RELIABILITY.md`). Root `ARCHITECTURE.md` stays the short
  stable map; `docs/design-docs/` holds only focused satellite designs. All
  references updated repo-wide.
- Docs de-staled after the Drive reshape: `transactional-email.md` no longer
  plans a "hub invitation" email (collection-share notification instead, and
  the outbox note reflects synchronous exports), `identity-sso.md` and
  `observability.md` dropped hub-role/invitation phrasing,
  `infra-deployment.md` worker example is the future email worker, Swagger
  metadata documents cookie + bearer auth (no more "Sprint 1").

### Changed

- Exports are synchronous and complete: `POST /api/v1/exports`
  `{ format, collectionIds[] (1–20), expand? }` replaces the queued-job design
  (`POST /collections/:id/export/markdown`, `/export/pdf`, and job polling are
  gone). All three formats ship — Markdown, PDF (`pdfkit`), and Word (`docx`)
  — via programmatic renderers, so no format needs a queue. Every collection
  id is authorization-checked up front; the response body is the file itself
  (`Content-Disposition: attachment`), zipped when several collections are
  selected (one document per collection). Documents read like a Google Doc:
  root collection = H1 + description, sub-collections expand in order as H2
  sections (never H3, by the two-level cap); `expand: false` collapses them to
  a single line. Removed the `ExportJob` model, `export_jobs` table, BullMQ
  processor, and export artifact/retention concerns; BullMQ/Redis stay in the
  stack solely for future email/notification delivery.
- Imports narrowed to bookmarks-HTML (primary migration path) plus a universal
  CSV column format (fill `url` + optional `title` from any tool); the
  WhatsApp-TXT parser is removed as too source-specific. Per-row error reports
  flag outlier rows to fix or drop. Import dedup now checks the resource's own
  canonical `url` (the `urlHash` lookup died with the links table).
- `@nslinkhub/types` caught up with the Drive model: removed the stale
  `ExportJob`/`ExportStatus`/`MarkdownExport` and membership-era types
  (`HubRole`, `MembershipStatus`, `InvitationStatus`, `HubMember`,
  `HubInvitation`, invitation/role-change/ownership-request shapes);
  `HubSummary` now carries `handle` (not `name`); added `CreateExportRequest`
  with `ExportFormat = "markdown" | "pdf" | "docx"`.
- De-normalized links and tags (the "store once, link many" / "shared tag pool"
  normalization stopped paying off in a single-user tool). An external resource
  now stores its own canonical `url` (dedup is a per-collection unique index);
  the `links` table and its module are removed. Tags are a normalized `text[]`
  on the resource and collection, set on create/update — the `tags`,
  `collection_tags`, `resource_tags` tables, the tags module, the tag
  attach/detach endpoints, and orphan-pruning are all removed. Cross-library
  retrieval is deferred to full-text search (Phase E). `@nslinkhub/types`
  updated (resource `url`/`tags`, collection `tags`, `CollectionShareView`
  uses `displayName`).
- Nesting is now a single action on existing collections. Removed `createChild`
  (`POST /collections/:id/children`, create-and-nest) and reparenting via
  `PATCH` (`parentCollectionId` dropped from the update DTO). The one way to
  nest is `POST /collections/:id/collections { collectionId }` — add an existing
  same-hub collection as a section, creating the structural parent link and the
  section entry atomically. Removing the section entry un-nests the collection.
  This eliminates the two-ways-to-nest ambiguity (and the hidden-section bug
  where reparent created a child without an entry). Collections are always
  created top-level.
- Collection-links are now **sections only**, and transfer is **top-level
  only** (resolves review findings #1, #3, #5, #6, #7). Removed the standalone
  "link an arbitrary collection" endpoint (`POST .../resources/collection-link`,
  its DTO, and the shared type): a collection-link exists only as a child
  collection created via `POST /collections/:id/children`, so every
  collection-link is same-hub, access-inherited, and within the two-level cap
  by construction. `POST /collections/:id/transfer` now rejects transferring a
  section — only a top-level collection transfers, moving with its whole
  subtree, so nothing is stranded cross-hub and no inherited access is dropped.
- Collection structure limits. Collection-links must target a collection in the
  same hub (rejecting cross-hub embeds that could re-expose another owner's
  collection). Collections nest at most two levels (a collection and its
  sections): the hierarchy trigger and the create/reparent paths reject
  sub-sections and reject nesting a collection that already has sections. The
  depth-8 hierarchy rule is replaced by this two-level rule.
- Resources simplified to a link, an editable title, and tags. Removed the
  `description` and `note` fields from the resource model, DTOs, `@nslinkhub/types`
  contract, Markdown export, and CSV import — a resource carries no summary;
  clarify a vague link by renaming its title.
- Collections gained an immutable `creatorUserId` (provenance), set at
  creation, distinct from the mutable owner (`hubId`). Groundwork for
  Drive-style collection ownership transfer: on transfer the owner (hub)
  changes but the creator does not. `ON DELETE SET NULL` so a collection
  outlives its creator's account after a transfer.

- Tenancy reshaped to the Google-Drive individual model (before Track W3).
  A hub is now **one personal space per user** (1:1), identified by a mutable,
  unique **handle** (the "hub name") plus a free-form **display name**. Removed
  hub memberships, invitations, and roles (`HubMembersService`,
  `HubInvitationsService`, their controllers/DTOs, and the `HubMembership` /
  `HubInvitation` tables); removed the better-auth `username` plugin and the
  `username`/`displayUsername` fields; removed the global `User.role` and the
  admin bypass (no admin persona). Collection access is now owner → direct
  reader/editor share → active link → published, with no membership branch.
  Ownership is a transferable FK (`hub.ownerUserId`, `collection.hubId`);
  durable links use the immutable `hubId`, so a handle rename never breaks a
  saved reference. The username-based `/users/:username` routes became a
  self-service profile at `/api/v1/profile` (display name, bio, handle). The
  `0_init` migration was reshaped (squash) with all hand-written SQL objects
  preserved. Full write-up: `docs/exec-plans/active/drive-model-tenancy.md`.

- Tags: orphaned tags are now pruned automatically. Because tags are global
  (unique by name, shared across hubs), a tag is deleted only when nothing
  references it anywhere — after detaching it from a collection/resource, or
  after a resource/collection delete cascades its last reference away. Adds a
  `pruneOrphanTags` helper (tags module) wired into the detach and delete
  paths, hardens tag creation to an upsert against races, and an e2e test.
  Removes the "unused tags never removed" tech-debt item.

- Tooling: replaced ESLint + Prettier with Biome (`biome.json`) for
  workspace-wide formatting and linting, run from the repository root and
  wired into `bun run verify` (`format:check` + `lint`). `useImportType` is
  disabled for `apps/api` only, because NestJS dependency injection and
  `emitDecoratorMetadata` require runtime imports for decorated
  classes/parameters; it stays enabled for `packages/*`, `tooling/`, and the
  future `apps/web`. Added an explicit `apps/api` `tsc --noEmit` typecheck to
  `verify` (also covers test files). Trade-off recorded in the tech-debt
  tracker: Biome has no type-aware lint rules, so `no-floating-promises` and
  `no-unsafe-*` coverage is dropped (type errors still caught by `tsc`).

- Operational-foundations direction: documented transactional email
  (`docs/design-docs/transactional-email.md` — Resend behind an application
  adapter, backend-owned React Email templates, PostgreSQL outbox + BullMQ
  worker, signed webhooks; better-auth mints verification/reset tokens, the
  app only delivers them) and observability
  (`docs/design-docs/observability.md` — Pino JSON logging, Sentry +
  OpenTelemetry/OTLP + Grafana Alloy → Grafana Cloud, PII allowlist). Both are
  direction only; implementation lands at its tracked trigger. Full-text
  search moved from an open product decision to a tracked Phase E item.

- Shared contracts (Track W2): added `packages/types` (`@nslinkhub/types`) —
  a source-only workspace package of hand-curated API request/response wire
  contracts (envelope, collections, resources, hubs, imports, exports;
  timestamps as ISO strings) for the web app and extension to consume, and
  `tooling/check-client-boundaries.ts`, which fails if a client imports
  `apps/api` internals or Prisma. The root `bun run verify` now runs the
  boundary check and the types typecheck alongside the API verify.

- Invitations + membership management (Phase D): hub roles are now enforced
  (owner > admin > member) via `HubsService.requireHubRole`. Hubs gained the
  ways people join and are managed: `POST /hubs/:hubId/invitations`
  (`{email, role}` — inviting a member needs admin+, inviting an admin needs
  owner; random expiring one-time hashed token, email delivery a logged
  no-op), list/revoke invitations, and `POST /invitations/accept` (`{token}`
  in the body; the authenticated acceptor's email must match; creates the
  membership). Membership endpoints: `GET /hubs/:hubId/members`,
  `PATCH /members/:userId` (role change, owner-only), `DELETE /members/:userId`
  (admin removes members, owner removes anyone, self-leave allowed) — all
  under the last-owner rule — and `POST /hubs/:hubId/transfer-ownership`
  (target member → owner, actor → admin, one transaction). This completes the
  backend of the hub architecture; remaining work is the client tracks and
  Phase E hardening.

- Authorization + public surfaces (Phase C): a single
  `CollectionPolicyService` now resolves all collection access (first match:
  published → read, hub membership → full, direct share → reader/editor,
  active link/token → read) and replaces the interim membership checks across
  collections, resources, tags, imports, and exports. Capability tiers land:
  hub members manage (publish, share, delete), direct-share editors write
  content only, readers/link/published read only. New surfaces: `GET /explore`
  (replaces `/collections/public`), public hub pages `GET /hubs/:hubId` and
  `GET /hubs/:hubId/collections`, hub-scoped lookup
  `GET /hubs/:hubId/collections/:slug` (which replaces and deletes the
  mutable-username lookup route), publish/unpublish, `PUT /link-sharing`
  (enable/disable/rotate; disabling clears the token), direct shares CRUD,
  save/unsave, and `GET /me/shared` + `GET /me/saved` (with dormant handling).
  Opening a valid share link records a link-sourced share on the viewer's
  shared/ surface, valid only while link sharing stays enabled. Reads that
  fail access now return 404 (not 403) for resources the caller cannot know
  exist.

- Documented the API/persistence casing convention
  (`docs/design-docs/conventions.md`): camelCase JSON keys, snake-token enum
  values, snake_case DB columns via Prisma `@map`. Fixed the one endpoint
  that broke it — the import response now returns camelCase counts
  (`totalRows`, `importedCount`, `errorCount`, …) instead of snake_case, and
  gained its first e2e coverage.

- Hub tenancy (Phase B): the domain model became **Hub → Collections →
  Resources**. Hubs are the tenant root and own collections through a
  `hub_id` foreign key; users belong to hubs via `hub_memberships`
  (`owner | admin | member`) and every sign-up atomically creates a personal
  hub (owner membership) through an app-owned, auth-path-agnostic onboarding
  hook. The visibility triad was replaced by a `published` boolean plus
  `link_sharing_enabled` (rotatable share token); `collection_shares`,
  `collection_saves`, and `hub_invitations` tables were added (schema now;
  endpoints in Phases C/D). The `0_init` migration was reshaped (nothing is
  deployed) and the `repositories`/`entries` modules, routes, and vocabulary
  were renamed to `collections`/`resources` — API routes move to
  `/api/v1/collections/:id/resources|tags|children|export` and
  `/api/v1/users/:username/collections/:slug`. Interim access is
  hub-membership based; Phase C installs the full policy service. Fixed a
  latent bug found in passing: the browser-friendly `?s=<token>` share-link
  query was rejected by the global `forbidNonWhitelisted` pipe.

- Foundation conventions (Phase A): failures now return the stable error
  envelope `{ error: { code, message, requestId, details } }` with stable
  machine-readable codes; every response carries a server-generated
  `X-Request-Id`; startup fails fast on malformed configuration; and the
  entries and public-repositories listings switched from page/limit to
  opaque cursor pagination (`meta: { limit, nextCursor }`, `total` dropped).

- Restructured the repository into a Bun workspace (Track W1): the backend
  moved to `apps/api` (`@nslinkhub/api`) with history-preserving renames,
  shared TypeScript base config landed in `packages/config`, and root
  scripts delegate (`bun run verify` et al. keep working from the root).
  The move surfaced and fixed two undeclared direct dependencies (`dotenv`,
  `express`) and dropped library-style declaration emit from the app build.

- Retired the v2 feature spec. It described the pre-hub direction (user
  ownership, visibility triad, JWT auth) and is superseded by PRODUCT.md and
  the hub design; only currently-true behavior was carried over
  (canonical-URL rules, import partial-failure reporting) plus two real gaps
  into the tech-debt tracker (unused-tag cleanup, export retention). Its
  spec-era API contracts (ETag/Last-Modified caching, folder-tree bookmark
  mapping) were dropped — the hub-era API design decides those fresh.

- Migrated the stack to Bun (runtime + package manager), Prisma 7 (driver
  adapter, generated client, single `0_init` migration owning triggers and
  CHECK constraints), and self-hosted better-auth (bearer + username plugins,
  argon2id via `Bun.password`), replacing npm/Node, TypeORM, and JWT/Passport.
- Restarted API versioning at `/api/v1` (the Flask-era v1 never shipped).
- Renamed `docker-compose.yml` to `compose.yml` (local development only);
  production topology will live in swarm-dialect `docker.stack.<env>.yml`
  files.
- Adopted the pigfarm workflow wholesale: `AGENTS.md` map + `CLAUDE.md`,
  `PRODUCT.md` as the canonical product definition, ExecPlans under
  `docs/exec-plans/` (`PLANS.md` format, tech-debt tracker), focused
  principles docs (`docs/CORE_BELIEFS.md`, `docs/SECURITY.md`,
  `docs/RELIABILITY.md`), design documents under `docs/design-docs/` with an
  index, runbooks under `docs/runbooks/` (local development, verification,
  migrations, reference context), a root `bun run verify` gate, a rewritten
  concise `ARCHITECTURE.md` map, git-ignored `ref/` scratch area, and this
  changelog. The pre-ExecPlan session workflow (TASKS.md, `.codex/`,
  developer-workflow/dev-session/implementation-status/PROJECT_STATE docs)
  was removed.

### Fixed

- DB-generated ids are returned on insert (entry/tag/export-job creation no
  longer fails on new rows) — fixed wholesale by the Prisma migration.
- `PATCH .../entries/reorder` was unreachable (shadowed by the `:entryId`
  route); reorder is now declared before parameter routes.
- `GET /repositories/:id/entries` and `GET /repositories/:id/children` were
  unreachable (shadowed by the `:owner/:slug` catch-all); the owner/slug
  lookup moved to `GET /users/:username/repositories/:slug` with e2e
  regression tests, including a non-uuid 400 canary.

### Added

- Local dev services via `compose.yml` (PostgreSQL 18, Redis 7).
- E2E regression suite running the production HTTP stack (better-auth mount +
  body-parser ordering) through shared `configureApp`.
- Authoritative forward design: hub architecture plan (hubs → collections →
  resources, Drive-style sharing, explore/saves, workspace + clients) and the
  ns-series identity and deployment directions.
