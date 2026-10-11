# Identity and handles

Status: implemented; controlled email change is backlog (ADR-0041). Hub identity,
the account's name, passwordless sign-in, fixed email and the web URL
scheme. Settled in [ADR-0002](../engineering-decisions/0002-immutable-identities.md)
and [ADR-0004](../engineering-decisions/0004-passwordless-email-codes.md).

[People and hubs](people-and-hubs.md) defines implemented separate usernames,
optional hubs and public person profiles. Signup optionally creates a named hub;
otherwise first ownership or explicit Create hub does (ADR-0044).

## Identity

- **Handle** — a hub's public, unique editable address (YouTube-handle style,
  lowercase `[a-z0-9-]`, 3–60 chars, reserved words blocked). It is a *handy
  way to reach a known hub* — `/@handle` resolves to the hub's page — never a
  key. The durable key is `hubId`. Owners may rename once every 30 days.
  Retired spellings cannot be reused even by the original owner and remain
  reserved after deletion (ADR-0043).
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
- **Sign-in: passwordless.** Separate sign-in/signup pages share email and Google
  authentication. Ordinary missing accounts require explicit creation after proof;
  task-specific capture/invitation codes retain their focused onboarding.
  Registered user-verified passkeys also sign in. Enrolled passkeys/TOTP protect email
  and Google fallback with an additional factor or recovery code. Usernames are
  not login credentials. See [passwordless security](passwordless-security.md)
  and [email verification](email-verification.md). Future centralized nsauth
  preserves this product boundary. Live provider acceptance remains before release.
- **Account email** stays fixed, like the immutable user UUID. Profile PUT/PATCH
  cannot change either. Names and bios remain editable; usernames retain their
  own rules. Email change is backlog and requires a future dedicated POST action
  with identity proof, affected owner/operator notifications and explicit handling
  of credentials/invitations. No hub or account transfer is implied. See
  [ADR-0041](../engineering-decisions/0041-fixed-account-email.md).
- **nsauth SSO** is bounded to users + SSO + profile (no orgs); see
  `identity-sso.md`. Products keep their own userId authoritative and their own
  authorization; the IdP never decides who may edit a collection.

## Web URL scheme

**Accepted next milestone:** [ADR-0053](../engineering-decisions/0053-id-only-collection-addresses.md)
makes `/c/<collectionId>` the only collection address, including browse links.
`/@handle` resolves hubs only; no hub or handle is embedded in collection URLs.
Collection IDs and addresses survive ownership transfer; access remains subject
to current policy. Remove collection slugs and their uniqueness/lookup contracts.
The [implementation plan](../exec-plans/active/use-id-only-collection-addresses.md)
is pending. The table and rules below describe the existing implementation until
that milestone lands, including the pretty route being retired.

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

## Profile pictures

The shared avatar endpoint is public and viewer-neutral under
[ADR-0034](../engineering-decisions/0034-public-gravatar-avatars.md). For an active
account with verified email and no pending deletion, it serves proxied Gravatar
image bytes. Missing images or provider failure use our existing UUID-seeded SVG;
missing, unverified, inactive, suspended and deletion-pending accounts use that
same fallback without contacting the provider. Stored chosen-image URLs no longer
participate in selection. Existing vendor image fields are not erased.

Public person profiles, contributor lists and account navigation use the same
immutable `/api/v1/users/:id/avatar` address. Profile Settings links to
`/support#profile-picture` below its fields, without an image preview. Support
explains that the picture is public and associated with the account email, and
offers an optional link to create or update a Gravatar. Registration is never
required, and missing images are never described as evidence that no Gravatar
account exists. Picture management remains at the provider; no upload/editor or
provider selector is added.

The API reads current eligibility and email for every request, then checks them
again after image retrieval to discard in-flight results from changed accounts.
User-ID responses remain private/no-store. The provider cache is keyed by the
normalized-email hash, not user ID. Account email is fixed; the defensive
post-fetch identity check also rejects results if stored identity changed during
the request. Deactivation prevents access to any cached picture. Cache entries are bounded
to 128; TTLs are one hour for pictures, 15 minutes for missing images and one minute
for failures. A reactivated account may use its current email's cached picture.

Keep the existing fixed HTTPS origin, SHA256 normalization, `d=404`, G rating,
128px requests, five-second timeout, 256KB response limit, content-type/signature
checks and 16-request concurrency cap. Provider redirects are rejected. Hashes
stay server-side and never appear in browser markup or redirects. Provider
requests carry no viewer cookies or referrers; no profile API credentials,
profile requests or provider scripts are needed.

Richer Gravatar profile information is a later optional paid feature; field
selection, consent and backend entitlements remain to be designed. Local names,
bios, usernames, hub handles and authorization remain product-owned.

Official references (checked 2026-10-10):

- [Gravatar v3 LLMS.TXT guide](https://docs.gravatar.com/guides/llms-txt/)
- [Avatar requests](https://docs.gravatar.com/sdk/images/)
- [Email identifier normalization and SHA256](https://docs.gravatar.com/rest/hash/)
- [Profile API and authentication](https://docs.gravatar.com/rest-api/)

Avatar image requests and profile API calls are distinct; review the relevant
provider contract for each rather than assuming avatar display needs full-profile
access. Repository privacy and identity rules remain authoritative.
