# Engineering Decisions

Settled engineering decisions and their rationale (often called Architecture
Decision Records), covering architecture, security, workflow, UX and tooling
choices. They are stronger than design notes: **do not reverse one without
recording the new evidence, the tradeoff and the reason**, in a new record that
supersedes it.

Records are for business-process and architecture decisions that much else
depends on: the tenancy and access model, identity and authentication, how
writes are ordered, where rules live, how the team ships. Feature rules, limits,
copy and visual guidance belong in the design docs; renames and field changes
belong in `CHANGELOG.md`. A record states the decision, why, and what must hold; it
is not a task list and holds no design scope. Journeys, statuses, endpoints,
limits and screens belong in a design document (the *how*), which the record
links to; implementation belongs in an ExecPlan (the *work*).

## Lifecycle

```text
question -> design shaping -> accepted decision -> implemented in an ExecPlan
         -> superseded only by a new record with rationale and a migration path
```

Statuses: `accepted` (binding, with any recorded amendments), `superseded`
(kept for history, linked to its replacement), `rejected` (considered and not
chosen). Partial supersession names the replaced scope and what remains binding.

## Required contents

Status and date; context; options considered; the decision; rationale;
constraints that implementation must preserve; links to design docs and plans.
Number records sequentially (`NNNN-short-slug.md`) and list them below.

Accepted records can define work that has not shipped. Check `PRODUCT.md` §11
and each linked design for implementation status. Apply recorded amendments
alongside their original rationale. The index includes rejected and superseded
records for traceability; their status and replacement links determine what remains binding.
Current implementation guidance lives in the linked design documents.

## Decision index

- [0001-drive-tenancy-model.md](0001-drive-tenancy-model.md) — Google-Drive tenancy: one hub per user, per-collection sharing.
- [0002-immutable-identities.md](0002-immutable-identities.md) — Immutable UUIDv7 identities; mutable names never in contracts.
- [0003-backend-owns-rules-native-forms.md](0003-backend-owns-rules-native-forms.md) — The backend owns the rules; native forms work without JavaScript.
- [0004-passwordless-email-codes.md](0004-passwordless-email-codes.md) — Passwordless sign-in with email codes; better-auth owns credentials.
- [0005-serialized-writes.md](0005-serialized-writes.md) — One global write lock serializes authenticated mutations.
- [0006-pre-deployment-no-compat.md](0006-pre-deployment-no-compat.md) — Pre-deployment: no compatibility code; squash and reset freely.
- [0007-resolved-titles-read-only-items.md](0007-resolved-titles-read-only-items.md) — Link titles are resolved, never typed; what belongs to an item is read-only.
- [0008-references-grant-nothing.md](0008-references-grant-nothing.md) — References grant no access and reveal nothing unreadable.
- [0009-operator-authority.md](0009-operator-authority.md) — Separate operator authority; step-up for sensitive actions.
- [0010-one-verification-flow.md](0010-one-verification-flow.md) — One email-verification flow with purposes; actions resume for their owner.
- [0011-toolchain.md](0011-toolchain.md) — Toolchain: Bun, Biome, reviewed Prisma migrations.
- [0012-bulk-import-through-reviewed-drafts.md](0012-bulk-import-through-reviewed-drafts.md) — Bulk import through reviewed drafts.
- [0013-permission-roles-and-display-labels.md](0013-permission-roles-and-display-labels.md) — Permission roles are stable; display labels are chosen per surface.
- [0014-one-management-workspace.md](0014-one-management-workspace.md) — One Manage workspace with owner and service contexts (amended).
- [0015-attribution-from-activity-records.md](0015-attribution-from-activity-records.md) — Attribution comes from activity records.
- [0016-curator-accounts-are-the-paid-tier.md](0016-curator-accounts-are-the-paid-tier.md) — Partially superseded by ADR-0028: free public curation and paid convenience.
- [0017-hubs-are-entities-with-members.md](0017-hubs-are-entities-with-members.md) — Hubs as entities with members (rejected; GitHub-style organizations later if ever needed).
- [0018-people-and-hubs-are-separate.md](0018-people-and-hubs-are-separate.md) — People and hubs are separate identities (amends 0001).
- [0019-copy-permission-and-source-credit.md](0019-copy-permission-and-source-credit.md) — Add to my collection requires owner permission and source credit.
- [0020-logging-after-core-operations.md](0020-logging-after-core-operations.md) — Audit strategy and wide event logging get separate milestones after core operations; existing recording remains.
- [0021-bounded-audit-effects.md](0021-bounded-audit-effects.md) — Interim core audit captures bounded state changes and no-op results; full strategy remains deferred.

- [0022-operator-account-profile-evidence.md](0022-operator-account-profile-evidence.md) — Operator account profiles expose recorded identity, status and session dates; no credentials, IP or user agent.

- [ADR-0023: Account lifecycle and unified collection actions](0023-account-lifecycle-and-unified-collection-actions.md)

- [ADR-0024: One audit log for every domain](0024-one-audit-log.md)

- [ADR-0025: One contextual Share page](0025-contextual-sharing.md)

- [0026-username-availability.md](0026-username-availability.md) — Lowercase usernames; hyphens affect spelling but not availability.

- [0027-section-context-and-inline-details.md](0027-section-context-and-inline-details.md) — Bounded section descriptions, nonempty sections and native inline disclosures.

- [0028-free-public-curation-paid-private-sharing.md](0028-free-public-curation-paid-private-sharing.md) — Free public collections and ordinary imports; paid private sharing, AI and DOCX; prospective public creation default.

- [0029-link-health-and-approved-redirects.md](0029-link-health-and-approved-redirects.md) — Paid monitoring, unavailable/recovery updates and explicit owner-approved URL redirects.

- [0030-one-selected-item-in-the-url.md](0030-one-selected-item-in-the-url.md) — One expanded item, synchronized URL and direct-link scrolling; amends ADR-0027 global expansion.

- [0031-direct-disclosures-without-global-controls.md](0031-direct-disclosures-without-global-controls.md) — Remove global Expand/Collapse controls; direct disclosures and reload preserve the reading workflow.
- [0032-relational-item-and-collection-tags.md](0032-relational-item-and-collection-tags.md) — Shared tag identities, item assignments and a transactionally maintained collection-tag relation.

- [0033-permanent-hub-handles-and-self-service-accounts.md](0033-permanent-hub-handles-and-self-service-accounts.md) — Handle permanence superseded by ADR-0042/0043; self-service lifecycle remains accepted with ADR-0040 recovery.

- [0034-public-gravatar-avatars.md](0034-public-gravatar-avatars.md) — Public active-account pictures, server-side proxying and generated fallback.

- [0035-passwordless-account-security.md](0035-passwordless-account-security.md) — UV-required passkeys, optional TOTP and protected recovery; Google onboarding amended by ADR-0038/0039.

- [0036-direct-backend-browser-routing.md](0036-direct-backend-browser-routing.md) — Direct local API requests and backend OAuth callbacks; exact-origin CORS with separate web destinations.

- [0037-inline-google-connection.md](0037-inline-google-connection.md) — Inline first-time proof and automatic Google connection; existing-accounts-only restriction superseded by ADR-0038/0039.

- [0038-email-owned-google-onboarding.md](0038-email-owned-google-onboarding.md) — Email-first passkeys and isolated invitations; entry superseded by ADR-0044, extra registration code by ADR-0039.

- [0039-confirmed-google-account-creation.md](0039-confirmed-google-account-creation.md) — Explicit creation consent accepts verified Google identity without a second inbox code; name initialization and backend Gravatar.

- [0040-contextual-account-recovery.md](0040-contextual-account-recovery.md) — State-specific recovery after verified email sign-in, without public recovery choices.

- [0041-fixed-account-email.md](0041-fixed-account-email.md) — Fixed account email; identity changes require a future dedicated action, never profile PUT/PATCH.

- [0042-editable-hub-handles.md](0042-editable-hub-handles.md) — Removes permanent claiming; reuse and cadence superseded by ADR-0043.

- [0043-deliberate-hub-handle-changes.md](0043-deliberate-hub-handle-changes.md) — No retired-handle reuse, even by its owner; backend/database enforce 30 days between renames.

- [0044-explicit-auth-entry-and-optional-hub.md](0044-explicit-auth-entry-and-optional-hub.md) — Separate sign-in/signup, verified creation consent and optional named hub with matching initial username/handle.

- [0045-account-timezone-preference.md](0045-account-timezone-preference.md) — Private database-backed timezone preference, Automatic device default and consistent server/client date rendering.

- [0046-shared-authentication-completion.md](0046-shared-authentication-completion.md) — One transactional completion operation for session assurance, invitation completion and account-bound sign-in auditing across all methods.

- [0047-owner-scoped-collection-references.md](0047-owner-scoped-collection-references.md) — Same-owner references via Add a link; confirmed, atomic deletion and transfer cleanup.

- [0048-nonblocking-navigation-progress.md](0048-nonblocking-navigation-progress.md) — Preserve the current view during ordinary GET navigation; retain mutation, session and history concealment.

- [0049-invitation-based-communities.md](0049-invitation-based-communities.md) — Future owner-approved membership grants viewer access across community-published collections; no implicit migration of subscriptions.

- [0050-community-entities-and-intake-integration.md](0050-community-entities-and-intake-integration.md) — Distinct communities within a hub; reusable intake with team and client views, NSLinkHub first and portfolio next; implementation deferred.

- [0051-durable-interrupted-actions.md](0051-durable-interrupted-actions.md) — Immutable capture result IDs and encrypted backend overflow storage for account-bound sign-in recovery.

- [0052-mandatory-visitor-attribution.md](0052-mandatory-visitor-attribution.md) — Mandatory source attribution in one server transport, enforced by the web boundary gate.

- [0053-id-only-collection-addresses.md](0053-id-only-collection-addresses.md) — Accepted next milestone: all collection URLs use `/c/<id>`; handles resolve hubs only; remove collection slugs.
