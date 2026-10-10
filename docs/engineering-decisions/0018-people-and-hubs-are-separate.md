# ADR-0018: People and hubs are separate identities

**Status:** accepted  
**Date:** 2026-10-08  
**Amends:** ADR-0001 (a hub is optional, created on first use; still one per
person, owned by them, never transferred).

## Context

Every account was a hub: the hub's handle was the person's identity, so
commenters, contributors and invited viewers appeared as hubs, and someone
invited to read one collection got a hub they never asked for. Yet the hub is
the face that owns and publishes everything, while people act — comment,
contribute, are invited by email.

## Options considered

- Keep the account and the hub as one identity (the hub's handle is the
  person's).
- Separate them, as a Google account and a YouTube channel, a Substack reader
  and a publication, or a GitHub user and their repositories are separate.

## Decision

A **person** (the account) has an **@username** and a name; a **hub** is their
optional publishing space, with its own **name** and **@handle**. A person has
at most one hub, created explicitly or when they first save a link or create a collection, owned by them and
never transferred; the hub owns their collections and its subscribers.
People act as themselves: they comment, contribute and are invited by email to
view or contribute, with or without a hub. Others **subscribe to hubs**; people
aren't followed. Hubs live at `/@handle` and people at `/username` — two
namespaces, so a person may give their hub their username or another handle;
top-level usernames never take the app's own route names. Display, routes and
data: [people-and-hubs.md](../design-docs/people-and-hubs.md).

## Rationale

- Readers and collaborators don't need a hub; publishing does.
- A hub can be named and branded on its own; a comment is clearly the person.
- One social graph (subscriptions) instead of two.
- Leaves room for GitHub-style organizations later as another kind of hub
  owner, without reshaping people (ADR-0017 stays rejected for now).

## Constraints to preserve

- At most one hub per person; hubs and collections are owned, people are never
  owned. Hubs aren't transferred; collections are.
- Usernames and handles are separate namespaces with their own addresses
  (`/username`, `/@handle`); reserved words protect app routes; durable
  references use ids (ADR-0002).
- Contributors and viewers are people, never hubs; access never comes from a
  username or handle.

## Links

- [people-and-hubs.md](../design-docs/people-and-hubs.md)
- [ADR-0001](0001-drive-tenancy-model.md), [ADR-0002](0002-immutable-identities.md),
  [ADR-0017](0017-hubs-are-entities-with-members.md)

## Explicit creation amendment — 2026-10-08

The product owner requested a quick Create hub button on a hubless person's
own profile. A hub can therefore also be created explicitly before saving a
collection. This amends the first-ownership-only creation timing; optionality,
at-most-one ownership and no creation on profile/settings reads stay intact.

## Public relationship amendment — 2026-10-08

The visibility preference controls the public relationship, not profile-name
visibility: `Hub.showOwner` defaults true. The hub owns this setting; no
visibility preference is stored on User. This supersedes the user-level name
visibility preference because disclosure describes the hub’s public relationship. Opt-out suppresses the profile's
hub and the hub's owner reference/name in public responses. Self-service access
and authorization remain unchanged. Profiles always show the person's name
when set and username. Contributors remain ordinary contributors; deciding
whether to expose a collection's contributor list is deferred.


## Personal bio addition — 2026-10-08

People may describe themselves with an optional public 500-character plain-text
bio stored on User. It is edited in Profile settings, available without a hub,
and independent of hub description and ownership visibility. This gives people
their own introduction while preserving the separate identities above.


## Import and bookmark boundary amendment — 2026-10-09

The product owner clarified that saving (bookmarking) a collection belongs to
the person, not their hub. Reading, bookmarks, viewer/contributor invitations,
comments and contributions never create or require a personal hub.

Imports are owner management. A new-collection import requires an existing
personal hub and fails with `hub_unavailable` otherwise; it never creates one.
Existing targets require collection ownership, not merely contribution access,
even when the contributor owns another hub. This supersedes imports being
classified as contributor content writes. Explicit Create hub and existing
first-link, collection-creation and incoming-transfer workflows remain valid.

Hub is always present in the account menu. For hubless people `/hub` offers an
explicit Create hub action; GET never creates one. The future import page must
prompt for explicit hub creation before accepting an import. Client guidance
never replaces backend target and ownership checks. Settings adopts a newly
created hub from returned profile data while preserving newer profile edits.


## Amendment (2026-10-10)

[ADR-0033](0033-permanent-hub-handles-and-self-service-accounts.md) makes explicitly
claimed hub handles permanent and retains every issued handle after deletion.
Person usernames remain freely editable. It also adds distinct self-service
deactivation, recovery, deletion and cancellation alongside operator lifecycle
controls. Its rules supersede conflicting handle-renaming/release and
operator-only initiation statements above; UUID identity and authorization remain.
