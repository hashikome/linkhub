# ADR-0034: Public Gravatar pictures with generated fallback

Status: Accepted (2026-10-10).

## Context

The user selected Gravatar-first profile pictures across person-facing surfaces,
with existing generated icons on missing images or failure and optional Settings
guidance. The existing proxy restricts Gravatar to the signed-in person and
prefers a stored chosen image. Public person profiles already expose active
people independently of hub ownership or publication.

## Decision

Make `/api/v1/users/:id/avatar` viewer-neutral. An active account with verified
email and no pending deletion may show its Gravatar publicly. All other cases,
including missing accounts, use the existing UUID-seeded SVG. Service authority
never bypasses this boundary. This supersedes the own-account/chosen-image-first
contract in the web interface design; stored vendor image fields are not erased.

Re-read eligibility and the same verified email after provider resolution so an
in-flight email change or deactivation cannot return the old photo. Responses
remain no-store. No user-ID-to-email cache is introduced: provider caching uses
the current normalized-email hash, so email changes select a new entry and
inactive accounts cannot retrieve old cached photos. Reactivated accounts may
use their current email's cached image. Provider updates follow the existing
bounded TTLs (images one hour, missing images 15 minutes, failures one minute).

Keep the fixed-origin, bounded image proxy and generated fallback. Hashes stay
server-side; clients receive image bytes or a same-origin SVG redirect. Do not
follow provider redirects, use provider-generated defaults, import profile fields,
load provider scripts, or send viewer cookies/referrers to Gravatar. The image
endpoint requires no profile API credential. Rich profiles and entitlements are
separate future work.

Settings explains that the picture is public and associated with the account
email, and offers an optional link to create or update a Gravatar. Registration
is not required, and a missing image says nothing about whether an account exists.
People choose their published image at Gravatar; no extra in-product provider
selector or upload flow is introduced in this milestone.

## Consequences

Profile pages, contributor lists and account navigation use one public picture
contract. Missing and unavailable accounts retain indistinguishable generated
fallback behavior. Existing local identity and collection access are unchanged.
Cached bytes may remain bounded in server memory after account changes, but every
user-ID request checks current eligibility before any photo can be served.

## References

- [Identity and handles](../design-docs/identity-and-handles.md#gravatar-follow-up)
- [Gravatar image requests](https://docs.gravatar.com/sdk/images/)
- [Identifier hashing](https://docs.gravatar.com/rest/hash/)
- [Profile API](https://docs.gravatar.com/rest-api/)
