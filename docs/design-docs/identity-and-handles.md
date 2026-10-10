# Identity and handles

Status: implemented (web email-change screens pending). Hub identity, the
account's name, passwordless sign-in, email change and the web URL
scheme. Settled in [ADR-0002](../engineering-decisions/0002-immutable-identities.md)
and [ADR-0004](../engineering-decisions/0004-passwordless-email-codes.md).

[People and hubs](people-and-hubs.md) defines implemented separate usernames,
optional hubs and public person profiles. Signup creates no hub; ownership does.

## Identity

- **Handle** — a hub's public, unique identity, permanent once explicitly claimed (YouTube-handle style,
  lowercase `[a-z0-9-]`, 3–60 chars, reserved words blocked). It is a *handy
  way to reach a known hub* — `/@handle` resolves to the hub's page — never a
  key. The durable key is `hubId`. Generated handles allow one explicit choice;
  all issued spellings stay reserved after deletion (ADR-0033).
- **Hub display name** — free-form `hub.name`, the public name of the hub,
  independent of its owner, email and handle. It is neither unique nor a lookup key.
- **Hub description** — optional `hub.description`, shown on the public hub and
  edited in Settings → Hub. The profile API uses `hubDescription`.
- **Username** — the person's unique mutable identity (3–20 characters; ADR-0026), independent of the hub
  handle. `/username` opens a public profile; app routes are reserved. Person
  references carry immutable `userId` plus the current username.
- **Full name** — `user.name`, exposed as `displayName` in the self-service
  profile. `Hub.showOwner` (default true) controls the public profile/hub relationship
  in both directions; profile names remain visible. Comments, contributors and History show the username. The owner's
  direct-share list includes the invitee's name and email for managing access.
  Opting out hides the public ownership connection in both directions; the
  person’s name remains visible on their profile.
- **Sign-in: email codes.** The primary sign-in is
  Substack-style passwordless — continue with email → enter the emailed code
  (email codes only; no direct authentication links or passwords). Usernames are
  not required for sign-in. ns-series single sign-on (a centralized IAM) can join later without reshaping
  this. The web presents it as one verification flow (see [email-verification.md](email-verification.md)): a single code field that accepts pasted spaces or
  dashes. Live provider acceptance remains before release. Optional
  TOTP/recovery codes are a later follow-up.
- **Email change** is only ever the same person updating their address — never
  a way to hand over a hub. A hub is never transferred (it is its owner's
  fingerprint); collections are. It is double-verified:
  1. the signed-in owner sets the new email;
  2. a **confirmation** goes to the **current** address, naming the target
     address — nothing changes unless it is confirmed (email code);
  3. on confirmation, a **verification** goes to the **new** address;
  4. on verification the change applies, **all sessions are revoked**, and the
     account signs in with the new email.
  Templates for both steps exist in `packages/email`; the backend workflow is
  documented in `auth-delivery-integration.md`. Web screens and
  live provider acceptance remain outstanding.
- **nsauth SSO** is bounded to users + SSO + profile (no orgs); see
  `identity-sso.md`. Products keep their own userId authoritative and their own
  authorization; the IdP never decides who may edit a collection.

## Web URL scheme

Durable references carry only the immutable id of the thing itself; every
mutable attribute — handle, slug, owning hub — lives in the payload, never
the address. The public URL shapes are:

| URL | Job |
| --- | --- |
| `/c/<collectionId>` | **Permalink** — any collection. Survives slug renames and ownership transfers. Backed by `GET /api/v1/collections/:id`. |
| `/c/<collectionId>?item=<resourceId>` | Item details within its authorized collection; also supported on the pretty collection address. |
| `/h/<hubId>` | Stable hub page, backed by `GET /api/v1/hubs/:hubId`. Survives handle and name changes; hubs are not transferable. |
| `/@handle` | Hub page. Backed by `GET /api/v1/hubs/by-handle/:handle`. |
| `/@handle/<slug>` | **Pretty browse URL** — human-readable, *allowed to break* on rename/transfer (Drive path vs file id). Backed by `GET /api/v1/hubs/:hubId/collections/:slug` after handle resolution. Slugs are unique per hub. |

Owners see their own collections at both hub address forms; visitors see only
published collections. The web resolves the authenticated profile's immutable
hub ID before selecting the owner list endpoint. `/hub` is the signed-in
shortcut to the viewer's own `/h/<hubId>`, or an explicit Create hub page when no hub exists. Settings provides an explicit `?view=public` preview,
which always uses public queries. This view choice never grants API access.

Rules that keep it drift-proof:

- Collection references navigate directly to `/c/<id>` with no parent context.
- **"Copy link" / share buttons always emit the `/c/<id>` permalink**, never
  the slug URL. Slug URLs are for address bars and link previews only.
- Pretty URLs have exactly a handle and slug. Bare `/name` paths are reserved
  for people's profiles (`/username`, specified in
  [people-and-hubs.md](people-and-hubs.md)).

## Account lifecycle

Settings links to separate email-confirmed deactivation and deletion flows.
Deactivation retains data indefinitely and hides the profile and owned collections,
including from collaborators. Recovery restores availability but requires a new
sign-in; old sessions and service privileges remain revoked. Operator restrictions
cannot be lifted through self-service.

Deletion schedules permanent cleanup after 14 days. Export/transfer advice appears
before confirmation; whole-account export automation remains planned. Cancellation
before the deadline leaves the account inactive for explicit reactivation. Cleanup
removes owned content and anonymizes retained contributions using existing behavior.
Hub handles remain reserved permanently. See
[ADR-0033](../engineering-decisions/0033-permanent-hub-handles-and-self-service-accounts.md)
and [ADR-0023](../engineering-decisions/0023-account-lifecycle-and-unified-collection-actions.md).

## Gravatar follow-up

Selected next implementation task after whole-diff review, fixes, verification
and commit: integrate Gravatar primarily for profile avatars across person-facing
surfaces. Richer Gravatar profile information is a later optional paid feature;
field selection, consent and backend entitlements remain to be designed. Do not
replace local usernames, permanent hub handles or authorization with provider data.

Accepted avatar order for that milestone: Gravatar first, then our existing
deterministic generated icon when no Gravatar image is available, including
people without a Gravatar account. Provider failures also retain that fallback.
The generated icon remains ours; do not replace it with a provider-generated
default. Profile Settings should offer an optional recommendation and link to
create a Gravatar account for a profile picture. Registration is never required
to use NSLinkHub. Avoid claiming that a missing image proves no account exists.
This replaces the chosen-image-first priority when the milestone is implemented.

Existing foundation: `UserAvatarService` resolves only the signed-in person's own
avatar through a chosen HTTPS image, then proxied Gravatar for a verified email,
then the generated SVG. Other viewers currently receive the generated fallback
without an account lookup. Extend this deliberately rather than duplicating it.

Before implementation, specify public avatar visibility and account-state checks,
provider disclosure/choice, cache invalidation on email changes or deactivation,
and safe fallback on missing images, timeouts or provider failure. Keep email
hashes and any profile API credentials server-side, preserve immutable user-ID
avatar URLs, and do not automatically import unrelated profile fields.

Official references (checked 2026-10-10):

- [Gravatar v3 LLMS.TXT guide](https://docs.gravatar.com/guides/llms-txt/)
- [Avatar requests](https://docs.gravatar.com/sdk/images/)
- [Email identifier normalization and SHA256](https://docs.gravatar.com/rest/hash/)
- [Profile API and authentication](https://docs.gravatar.com/rest-api/)

Avatar image requests and profile API calls are distinct; review the relevant
provider contract for each rather than assuming avatar display needs full-profile
access. Repository privacy and identity rules remain authoritative.
