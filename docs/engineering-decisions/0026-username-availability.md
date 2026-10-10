# ADR-0026: Lowercase usernames with hyphen-insensitive availability

Status: Accepted (2026-10-09).

## Context

People must not be distinguishable only by capitalization or hyphen placement.
`UserName`, `username` and `user-name` must compete for one username identity.
The product is predeployment, so existing development names need no compatibility
exceptions. `share` remains reserved for the application route.

## Decision

- Trim surrounding whitespace and lowercase username input in the backend.
- Store 3–20 ASCII characters: letters, digits, and single internal hyphens.
  Format: `^[a-z0-9]+(-[a-z0-9]+)*$`. Dots, underscores, non-ASCII characters,
  leading/trailing hyphens and consecutive hyphens are invalid.
- Compare availability using the stored lowercase spelling with every hyphen
  removed. `username`, `user-name` and `u-sername` have the same identity key.
  The owner may change that spelling; another account cannot claim a variant.
- Compare reserved names using the same key. `share` and `s-hare` are reserved;
  `sign-in` also reserves `signin`. Keep reservations in the API and SQL.
- Use the same backend lookup for onboarding and availability; enforce uniqueness
  with a database expression index so concurrent or direct writes cannot bypass it.
- Keep the chosen lowercase spelling for display and readable profile URLs. This
  availability rule creates no route aliases. Immutable user IDs remain the basis
  of authorization and durable links. Hub handles remain a separate namespace and
  keep their existing exact-spelling availability rule.

This refines the username availability contract in ADR-0018 without changing its
person/hub separation. Correct the uncommitted people migration's backfill: reserved
and colliding hub-derived names receive fresh fallback usernames, without
predeployment grandfathering. Do not reset development data as part of this patch.

## Amendment: Length and shortening suggestions (2026-10-09)

The accepted maximum is 20 characters, superseding the initial 60-character
limit. Hub handles retain their separate 60-character limit. Backend validation,
the SQL column and CHECK constraint enforce the username limit.

For an otherwise valid username draft longer than 20 characters (up to 255), the
availability endpoint may return an optional `suggestion`. Keep up to 15 leading
characters, trim a trailing hyphen, then append a hyphen and four lowercase
base-36 characters derived from SHA-256 of the omitted text and a retry counter.
Try at most 20 candidates through the existing reserved-name and normalized
availability checks. Return no suggestion if none is available. This is a
readability aid, not a uniqueness or security guarantee; final saving rechecks
availability under the normal write transaction and SQL unique index.

Case normalization makes repeated input deterministic while availability is
unchanged. A person's current claim can be offered back to them. The lookup never
reserves or saves a name. Profile edits require explicit acceptance of the offered
spelling; invalid punctuation is rejected rather than repaired. Enhanced settings
retain the long draft and offer a Use button. Native forms keep a 20-character
field and support ordinary manual editing and saving. Onboarding uses the same
bounded generator for long names; suffixing shorter colliding defaults also fits
within 20 characters. Predeployment backfill excludes overlong hub handles and
uses a bounded random fallback.

## Examples

| Input or proposed claim | Result |
| --- | --- |
| `EngToolKit` | Valid input; stored as `engtoolkit` |
| `eng-toolkit` when another person owns `engtoolkit` | Taken; hyphens only change formatting |
| `the-99s` when another person owns `the99s` | Taken; same identity key |
| `eng-toolkit1` when `engtoolkit` exists | Distinct name; digits remain meaningful |
| `eng.toolkit` | Invalid; dots are not allowed |

Digits remain allowed to support meaningful names such as `the99s`; numeric
suffixes therefore remain possible. This rule prevents case/hyphen-only duplicates,
not every similar-looking or impersonating name. Capitalization is accepted at
input, not preserved in the stored or displayed username.

## References and scope

These are design precedents, not a claim that our entire policy matches another
service. Repository rules above remain authoritative.

- [GitHub Enterprise username normalization](https://docs.github.com/en/enterprise-server%403.21/admin/managing-iam/iam-configuration-reference/username-considerations-for-external-authentication)
  documents alphanumeric characters and hyphens, with no edge or consecutive
  hyphens. It preserves letter casing; our product deliberately stores lowercase.
- [npm package-name guidelines](https://docs.npmjs.com/package-name-guidelines/)
  prohibit uppercase names and advise against confusingly similar package names.
- [npm's published package moniker rules](https://blog.npmjs.org/post/168978377570/new-package-moniker-rules.html)
  reject new package names that differ from existing names only by punctuation.
  That is the precedent for our availability comparison, adapted to person
  usernames and our narrower alphabet. npm permits more punctuation, offers
  scoped package names and describes legacy exceptions; we adopt none of those.

References checked 2026-10-09. These precedents concern specific services, not a
universal username standard or an Instagram compatibility promise.

## Consequences

Hyphens improve readability without opening up near-identical account names.
Formatting feedback remains a client convenience; the API and database enforce
the policy. The expression index is SQL-only and must survive migration reviews.
Invalid punctuation is rejected rather than silently rewritten into another name.
