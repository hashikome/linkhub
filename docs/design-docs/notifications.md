# Notifications

Status: service-role invitation notifications are implemented at `/notifications`.
The additional inbox kinds and configurable preferences below are planned.
Settings has a Notifications section showing invitations as always on. Person labels and hub
subscriptions follow [people and hubs](people-and-hubs.md).

Notifications are one inbox for everything that happened that concerns you,
with preferences in **Settings › Notifications** (`/settings`). Like [Manage](manage-workspace.md), the kinds
you see and can configure follow your roles.

## Kinds

| Kind | Who receives it | Example |
| --- | --- | --- |
| Subscriptions | Subscribers of a hub | "@namestarlit published *Backend building blocks*" |
| Comments | Owner and contributors of the collection; the author of the comment replied to | "reader asked a question on *How the web reaches you*"; "curator replied to your comment"; "Your reply was marked as the answer" |
| Saves and subscriptions | Hub owner | "reader saved *Accessibility from the start*"; "reader subscribed to your hub" |
| Sharing | The person shared with | "namestarlit shared *Code style* with you (Can contribute)" |
| Invitations | Invited people | "You're invited to be a service admin" |
| Imports | The importing owner | "Your import is ready to review: 184 ready, 12 need attention" |
| Service | Operators and admins | Invitation accepted or declined; a held collection was corrected by its owner |

New kinds are added here with their recipients. A notification never reveals
anything its recipient couldn't otherwise read: a comment notice for a
collection you lost access to drops out of your inbox.

## Settings

The Notifications page is the inbox only. A **Notifications** section in
`/settings` owns all notification preferences; there is no separate
`/notifications/settings` route. Planned controls:

- one switch per kind you can receive (for example, turn off "Saves and
  subscriptions");
- **Subscriptions**: each subscribed hub with its own switch (on by default, like
  YouTube's bell), also reachable from the hub's Subscribe button;
- invitations and security notices (sign-in and account changes) are always
  on.

Settings save as they are changed, like the rest of Settings.

## Delivery

In-app first: a notification row per recipient, written by the same
transaction as the event when there are few recipients, and fanned out by the
worker when there are many (a hub's subscribers). Email carries codes and service invitations. Targeted share invitations
and security notices require their own workflows.

## Email

Notifications are in-app. Email carries sign-in codes and service invitations; targeted shares and
security notices are planned. A weekly email digest
may follow later as a per-kind opt-in, if people ask for it.

## Link-health updates (planned)

Paid [link-health monitoring](link-health.md) informs the owner of confirmed
unavailability, recovery and redirects awaiting review. Group repeated observations
into an issue; avoid an alert on every check. Monitoring never changes the saved
URL. The owner approves or dismisses redirects in the authorized review workflow.
Channels, digest cadence and reminder policy remain to be set; audience-wide
updates are not implied. Existing notification preferences continue to apply.
