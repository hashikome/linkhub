# People and hubs

Status: identity, profiles and optional hubs implemented; subscriptions remain
planned in the home/subscriptions slice. Decision:
[ADR-0018](../engineering-decisions/0018-people-and-hubs-are-separate.md).
Collection grants use `viewer` and `contributor`.

## Two identities

| | Person (the account) | Hub (their publishing space) |
| --- | --- | --- |
| Identity | **username** and a name | **Hub name** and its own **@handle** |
| Has one? | Everyone with an account | Optional — selected during signup with a name, created explicitly with Create hub, or on first saved link, first collection or collection transfer; at most one per person |
| Owns | Account identity and private collection bookmarks | Every collection in it; planned hub subscriptions target its immutable ID |
| Shows up as | Commenters, contributors, History entries (`username`, linking to `/username`); invited viewers and contributors in the owner's access list (name and email) | Collection pages, Discover, its own page (`Hub name @handle`, at `/@handle`) |
| Others can | Grant collection access; email invitations are planned | **Subscribe** (planned) |
| Transferable | — | Never (collections are) |

The hub is the face: wherever something it owns appears, it shows as the hub.
People act as themselves.

## Namespaces and routes

Like YouTube channels (`/@handle`) and GitHub people (`/username`):

- **Hubs** live at `/@handle`; **people** at `/username`. They are separate
  namespaces (lowercase `[a-z0-9-]`; usernames 3–20, hub handles 3–60), so a person may give their hub
  their own username (`/@paul`) or another handle (`/@webcornerhub`).
- Usernames sit at the top level, so the app's own route words are reserved
  (`home`, `settings`, `profile`, `notifications`, `discover`, `platform`,
  `manage`, `capture`, `sign-in`, `sign-up`, `support`, `c`, `h`, `api`, `forms`, … plus a
  buffer for future routes), as handles already reserve words.
- **The hub page** (`/@handle`) credits its owner — "by Paul John" when they
  show their name, linking to `/paul`.
- **The profile** (`/username`) is minimal: the name when set, the username, an optional personal bio,
  their hub if they have one, and the public collections they have contributed
  to. Saved collections stay private (a public-saves opt-in can come later if
  wanted).
- Permanent addresses use IDs: `/h/<hubId>` and `/c/<id>`. Collections have only
  the ID address, with `?item=<itemId>` opening one item.

In the interface hubs read as **@handle** and people as their plain
**username**, both linked, so the two never look alike.

## Username availability

[ADR-0026](../engineering-decisions/0026-username-availability.md) defines the
backend-enforced policy and its GitHub/npm references. Username input is trimmed
and lowercased; stored values use 3–20 ASCII letters, digits and single internal
hyphens. Dots and underscores are invalid. Availability and reserved-name checks
remove hyphens: `UserName`, `username` and `user-name` compete for one claim;
`share` and `s-hare` are both reserved. The owner can change their own spelling.
The API checks this key during onboarding and profile changes, and a SQL unique
expression index prevents bypass. Display and readable routes retain the selected
lowercase spelling; variants are not route aliases. Hub handle availability keeps
its existing separate, exact-spelling rules.

An otherwise valid overlong draft can receive a backend-checked shortening
suggestion: a readable prefix, hyphen and four letters/digits, at most 20 total.
The web offers an explicit Use button; it never silently saves the replacement.
Suggestions do not reserve a name and saving rechecks availability. Live
suggestions enhance the settings form; native forms support manual names within
the same saved limit.

## Names

- A person's name appears on their profile. The visibility setting controls
  the public connection between their profile and hub. The owner's collection access list can show
  name and email for a direct share. Elsewhere people appear by username.
- A hub page reads "Hub name", then "@handle", or "@handle by Owner Name" when
  the owner shows their name.

## Signing in, saving and the hub

| Action | Result |
| --- | --- |
| **Sign in** | Authenticate an existing account; a verified missing identity requires explicit account creation |
| **Create account** | Verified creation offers an optional named hub, off by default. Initial hub handle equals the generated username; existing and retired hub handles are excluded. Without a hub, the person can read, bookmark, comment and collaborate (ADR-0044) |
| **Bookmark a collection** | Saves a private reference for the person (`CollectionSave.userId`); no hub is needed or created |
| **Create hub** | Explicit, idempotent creation from the Hub entry or own profile; opening either page creates nothing |
| **Import** | Owner-only, into an existing personal hub; a missing hub returns `hub_unavailable`. Contributors cannot import into shared collections |
| **Save your first link** | Sign in (or sign up) **and add the link**. No hub yet: it is created on the spot with a first private collection holding the link. A hub with collections: the person chooses the collection (or a new one), as on Save a link. Existing accounts are never turned away |
| **Save a link** / creating a collection (signed in) | The same rule: the hub is created if missing, otherwise the link goes where the person chooses |

- Sign-up derives the username from the name, or a readable random one; never
  from the email.
- A new hub is named from the person by default and takes their username as its
  handle when unreserved. Both name and handle stay editable as its purpose
  changes. Handle renames require 30 days between changes; retired spellings
  cannot be reused by anyone, including the original owner (ADR-0043).
- Someone who only reads or contributes by invitation never gets a hub.
- Paid entitlements are planned under [monetization](monetization.md) and ADR-0028;
  they extend convenience and private sharing without changing identity or ownership.

## Subscriptions

Planned: people subscribe to hubs (like YouTube), with a per-hub notifications toggle;
subscriptions belong to the person, subscribers to the hub. People are not
followed. See [hub home and subscriptions](hub-home-and-following.md).

## Data

- `users.username` (unique, reserved words blocked); `hubs.handle` stays
  unique in its own namespace.
- `hubs.owner_user_id` stays unique (one hub per person); a user may have none.
- The account-creation hook assigns usernames and optionally creates the requested named
  hub in the same transaction (ADR-0044). Explicit hub creation, first-link
  saves, collection creation and incoming transfers create a missing hub under the
  authority transaction; failed first-link saves leave none. Imports require an
  existing hub and owner management authority; bookmarks require no hub.
- Person references in the API are `PersonRef { userId, username }`; hub
  references carry their own id, name and handle. Public hub pages include the
  owner reference; public person profiles expose only available published
  contributions, from the activity records, with cursor pagination. Cursors preserve
  PostgreSQL timestamp microseconds and use collection ID to break exact ties.
- `Hub.showOwner` (default true) controls the public profile/hub relationship in both
  directions. Opting out removes `PersonProfile.hub` and the hub owner reference
  and name from public API responses. Profiles still show name and username.
  Email and saved collections remain private.

## Profile and settings entry points

The person profile (`/username`) is a viewing page, distinct from the hub. It
shows the person's public contributions and a link to their hub when it permits showing its owner.
Only its owner sees **Create hub** when no hub exists. This submits an explicit,
idempotent `POST /api/v1/hubs` for the authenticated user; revisiting Profile or
Settings never creates a hub. Profile editing is available through the account
menu's **Settings** entry at `/settings`, without an Edit profile shortcut.
Notification preferences also belong in Settings, in their own section.

The account menu orders Profile, Hub, Notifications, Settings, then
Manage (when authorized). Profile and Hub are separate views. Profiles show the saved name and username to owners and visitors alike.
Hub links to the existing hub or to `/hub`, where a hubless person can explicitly
create one. Settings initializes newly available hub controls from the returned
profile without discarding newer edits.
The visibility switch controls the public relationship in both directions.

## Public hub connection

Settings labels the preference **Show owner**. When enabled:

- Profile byline: `username of The Hub Name`; only the hub name links to `/h/<hubId>`.
- Hub byline: `@handle by Owner Name`; only the owner name links to `/username`.

When disabled, the profile keeps the person's name and username without its
hub link; the hub keeps its own name and `@handle` without owner attribution.
The signed-in account menu still links privately to the person's Hub. A hidden
public relationship never means the person has no hub or should create another.
Contributor lists and immutable content authorship are unaffected; collection
contributor visibility remains an open product decision.


## Personal bio

User.bio is optional public plain text, independent of the hub description.
Profile settings offers a 500-character textarea beneath Username. Both autosave
and native forms persist it without creating a hub. The API trims outer whitespace
and stores blank input as null; omitted updates preserve it. Non-string and
overlong input is rejected. Public profiles show it beneath the name/byline with
line breaks preserved and markup escaped; an empty bio renders no block.
Hub.showOwner does not affect the bio.

## Durable profile sharing

Profiles also resolve at `/people/{userId}` and `GET /api/v1/people/:id`. These
use the existing public projection and exclude inactive accounts. Shared profile
links use this immutable ID so renaming a username does not break them. The
`share` username is reserved. See [sharing](sharing.md).

## Private display preferences

User stores nullable `time_zone`, exposed only as `timeZone` in authenticated
GET/PATCH profile. Null means Automatic (device timezone); explicit IANA names are
validated and normalized by the API. The preference follows the account, renders
on the server, and never appears in public person profiles. See
[ADR-0045](../engineering-decisions/0045-account-timezone-preference.md).
