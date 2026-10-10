# Design Documents

Focused designs for subjects too detailed, or changing too often, for the root
documents. `PRODUCT.md` says what the product must do, `ARCHITECTURE.md` how the
system is shaped, `DESIGN.md` how it looks; settled rationale is in
[../engineering-decisions/](../engineering-decisions/README.md) and
implementation work in [../exec-plans/active/](../exec-plans/active/).

Each document distinguishes implemented contracts from planned behavior.
[PRODUCT.md §11](../../PRODUCT.md#11-delivery) owns delivery status and order.

## Domain and system

- [tenancy-and-access.md](tenancy-and-access.md): the access model (owner →
  direct share → active link → published), service-operation restrictions,
  ownership transfer, publication and discovery.
- [passwordless-security.md](passwordless-security.md): passkeys, Google sign-in and confirmed account creation, TOTP, recovery and authentication assurance.
- [identity-and-handles.md](identity-and-handles.md): person usernames and profiles, hub handles and names, passwordless sign-in, fixed account email and the web
  URL scheme.
- [collections-and-resources.md](collections-and-resources.md): item kinds and
  their API, link titles and public addresses, tags, and the Save a link
  command.
- [discussion.md](discussion.md): comments, replies, answers, moderation and
  pagination.
- [email-verification.md](email-verification.md): the one verification flow and
  interrupted actions.
- [attribution-and-activity.md](attribution-and-activity.md): activity
  entries, creator, contributors, "added by" and the hub audit (API, History and Manage audit built).
- [manage-workspace.md](manage-workspace.md): Manage — shared owner/operator/admin workspace; scoped sections and planned blocking
  and invitation extensions.
- [people-and-hubs.md](people-and-hubs.md): people (username) and their
  optional hub (name, @handle) as separate identities; `/username` and `/@handle`,
  hub created on first ownership (implemented); subscriptions remain planned.
- [notifications.md](notifications.md): one inbox for every kind, scoped by
  role, with per-kind and per-hub settings (designed).
- [hub-home-and-following.md](hub-home-and-following.md): the public hub page,
  your home (My collections, Shared with me, Saved, Subscriptions) and subscriptions
  (designed).
- [bulk-import.md](bulk-import.md): bulk import through reviewed drafts —
  statuses, fixing rows, folders as sections or separate collections, limits
  (designed; implementation pending).
- [exports.md](exports.md): synchronous Markdown/PDF/Word exports and reference
  expansion.
- [service-operations.md](service-operations.md): operator authority, account
  restrictions, public-content holds, invitations, recovery and audit.
- [conventions.md](conventions.md): API and persistence casing and the response
  envelope.

## Web

- [sharing.md](sharing.md): one contextual Share page for profiles, hubs, collections and the site.

- [web-product-experience.md](web-product-experience.md): journeys, copy
  direction, unavailable and dormant states.
- [web-interface-system.md](web-interface-system.md): principles, layouts,
  components, states, accessibility and browser/API boundaries. Theme values
  live in the root [DESIGN.md](../../DESIGN.md).

## Platform and delivery

- [auth-delivery-integration.md](auth-delivery-integration.md): better-auth
  delivery and account recovery, with transaction and acceptance boundaries.
- [transactional-email.md](transactional-email.md): Resend adapter, React Email
  templates, PostgreSQL outbox and BullMQ worker, signed webhooks.
- [observability.md](observability.md): LogTape/Sentry boundary, telemetry and
  PII rules.
- [infra-deployment.md](infra-deployment.md): namestarlit VPS, Dokploy Stack
  mode, GHCR images and topology files.
- [identity-sso.md](identity-sso.md): ns-series IAM direction ("Continue with
  namestarlit").
- [monetization.md](monetization.md): accepted free public curation and paid private sharing, AI/DOCX and
  monitoring; billing, quotas and public creation defaults await implementation.

Foundation comparison and delivery history live in the
[completed adoption record](../exec-plans/completed/foundation-adoption-decisions.md).
Current release requirements live in the [release runbook](../runbooks/release.md).

- [ai-curation.md](ai-curation.md): proposed document extraction and assisted organization through reviewed import drafts.

- [link-health.md](link-health.md): planned paid monitoring, owner updates and approved redirect repairs.
