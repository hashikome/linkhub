# Web interface system

Status: interface contract for implemented reading, account, capture, discussion
and service-operation journeys. Planned feature scope and delivery status live
in [PRODUCT.md](../../PRODUCT.md#11-delivery). Each new journey requires its own
browser acceptance.
The [experience](web-product-experience.md) owns journeys and copy direction;
[DESIGN.md](../../DESIGN.md) owns all concrete theme values.

## Principles

- **UX over compactness.** When a screen must fit, keep the readable layout and
  show fewer items or disclose progressively (tags behind "Add tags", two links
  per save); never crowd fields side by side or drop labels to save space.
- **Copy scans at a glance.** Short paragraphs with clear space between them;
  emphasis is bold text, not extra panels competing with the actions.
- **The wordmark is the logo.** Lowercase "nslinkhub" text only; no icon or mark.

## Layout and hierarchy

Use a compact top bar with the wordmark, Discover link and account menu, and
centered content. The navigation wraps at narrow widths and enlarged text.
The collection is the main reading surface. Discover and hub views use compact
rows grouped with whitespace in two desktop columns, collapsing to one on phones. No
nested cards, dashboard metrics or decorative covers.
The collection title and resource titles provide the visual hierarchy.

Desktop page gutter is 32 px and the shell stops at 1120 px. Every page starts
at the shell's left content edge (the wordmark's edge); narrower surfaces keep
their own measure without re-centering: reader 768 px, settings 736 px, sign-in
and capture 512 px. Prose is capped at 65–70 characters. Below 640 px use 20 px
gutters and stack the title/action group. The shell must fit 320 px without
horizontal scrolling. At 1024 px the collection reader places discussion beside the
resources; narrow screens put discussion after the reader. DOM reading order
must remain meaningful. There is no fixed mobile bottom bar.

All routes have a skip-to-content link, one `h1`, a labelled main region and
semantic navigation. Native links handle navigation; buttons perform actions.
Do not make a row containing secondary controls into one enclosing link.

## Component vocabulary

| Component | Required behavior |
| --- | --- |
| Collection row | Title (ink, not accent) is the main link and underlines on hover; description and metadata wrap. Meta items are separated by a muted dot on wide screens and by spacing below 640 px. Tags are outlined text until actual filtering exists. Hover tints the row surface, which bleeds slightly past the content edge so text stays aligned; focus stays visibly attached to the link. |
| Resource row | One primary destination in ink, then one meta line: hostname (leading `www.` dropped), a small arrow-up-right external glyph, and optional tags inline. External links use normal browser behavior and a no-referrer policy. No script/data URL navigation. |
| Collection reference | Viewer-authorized destination title, then a meta line with a stacked-squares icon and an accent “Collection” label; links to its immutable ID without source tokens. Unavailable targets show a neutral muted entry. |
| Heading resource | Plain section heading in resource order, with spacing rather than a card or separator. |
| Button | Filled accent for the primary action, bordered neutral with ink text for secondary, accent text for low emphasis. Shared primary/secondary button sizing: 32 px with a mouse/trackpad, 44 px touch targets on coarse pointers. Fields remain 38 px with fine pointers. Default/hover/focus/active/disabled/pending states share geometry. Signed-out navigation renders Sign in as a compact secondary button. |
| Sharing | Hub, collection and footer sharing controls are deferred to the sharing and hub-engagement slices. Contributors occupy the top of the collection sidebar; Discussion sits directly below them and grows with its own content on wide, tall screens, capped by the available page space above the footer before scrolling internally. Empty discussions stay compact. Its position is independent of the collection header. The footer contains Support only beside the product identity. |
| Toast | Transient confirmations (saved, resent, signed out, done, copied) appear top-center as a small card in the page's own surface, border and radius, with a tone mark (✓ success, dot info), fitted to the message; they clear after ~5 s and the `?notice=` code is removed afterwards. Errors, warnings and anything needing action stay inline: info (neutral blue), warning (amber), error (red). |
| Email verification | One flow for every purpose (sign in, first link, continue, resume, confirm, invitation): the start screen (reason line; the known address in bold or an email field; what happens next; Send code, plus Cancel where backing out makes sense) and the code screen (where it went in bold, the code, the purpose's button, "Didn't receive the code? Send a new code"). Short paragraphs with clear space; no extra panels. |
| Pagination | Visible continuation control with pending state and result-count announcement; prevent duplicate loads; preserve existing results on a retryable page failure. |
| Feedback panel | Heading, short explanation, one recovery action. Errors use icon/text plus color. Request ID is optional expandable support detail, not the headline. |
| Input | Persistent label, instructions and inline error linked with `aria-describedby`; preserve entered values on retryable failure. |

Use one consistent stroke-icon family or simple standard glyphs with accessible
names. Icons supplement text. Do not invent symbolic labels for unfamiliar
actions. No animation on first page load; use short transitions only for focus,
hover and feedback. Reduced motion makes transitions immediate.

## State model

| Condition | Visible result | Recovery |
| --- | --- | --- |
| Initial document | Complete uncached server render, bounded by API deadlines | Results or feedback work without JavaScript |
| Document navigation/revalidation | After ~300 ms pending, hide previous content and show compact progress; offer "Reload this page" after eight seconds or Escape | Fresh server authorization before rendering; cancelled navigation remains recoverable |
| Empty successful list | Context-specific empty copy | Existing navigation only |
| More results loading | Existing rows stay, continuation disabled/busy | Append and announce |
| Next page fails | Existing rows stay; inline feedback at continuation | Retry the same cursor |
| Invalid cursor | Explain that the list changed | Reload the first page |
| Anonymous/unauthorized collection | Indistinguishable unavailable page; may be private or no longer exist | Discover; signed-out readers can sign in and return to the same destination |
| Expired authenticated session | Clear private content and cached identity | Working sign-in journey with safe local return URL |
| Revoked share/unpublished collection | Remove formerly visible content on revalidation failure | Unavailable page |
| 429 | Brief retry message honoring `Retry-After` | Manual retry after the wait |
| Timeout/offline/5xx | Bounded failure with retry and retained public shell | One deliberate retry, no automatic loop |
| 409 write | Keep local draft separate from fresh server state | Review changes and retry with current version |

Transient network failure must not be treated as confirmed sign-out. Do not
replace private data with another user's stale response: cancel outstanding
requests on session transitions and ignore results from the previous session
generation. On return from background, re-check the session through the
browser adapter: a different account or a definite 401 reloads; a network
failure does not. Away for over ten minutes, or restored from bfcache, the page
reloads to re-authorize everything (revoked shares, unpublished content). A revocation cannot erase a resource already read by a person; the
acceptance concerns new requests and stale application/browser state.

## Runtime and HTTP boundary

Browser requests use one typed same-origin adapter under `/api/v1`; no public
API-origin environment setting, bearer storage or client imports from the API.
Normalize the product error union and raw better-auth's different protocol at
their respective adapters. UI copy branches on stable codes. Unknown codes
receive a safe fallback rather than raw remote messages.

Server reads use a server-only adapter with a configured trusted API origin,
an eight-second deadline covering headers and body, and `cache: no-store`.
The browser adapter uses a ten-second deadline and cancels on navigation or
session change. Do not automatically retry mutations. Construct paths from encoded, validated
route parameters. Never derive the upstream origin from request headers or a
submitted URL. Forward only the required session cookie and explicit share
token, never all incoming headers; refuse upstream redirects to prevent
credential forwarding to another host. Do not forward browser bearer tokens.
Only public non-secret configuration can cross the React/server boundary.

Start all collection, discovery and hub reads uncached. Profile, shares, saved
content, tokens and access decisions never enter shared caches. Configure page
and API response cache policy explicitly, disable sensitive route prefetching,
and verify framework/browser history behavior rather than relying on defaults.
Authenticated or token-bearing reads must not appear in static output, metadata,
analytics, logs or service-worker storage. Use a restrictive referrer policy
and exclude share query strings from telemetry. Public metadata is generic
until an explicitly public, independently authorized source supplies its text.
Next.js supports explicit per-fetch `no-store`; the chosen framework version's
page/router behavior must still be verified separately. See the official
[fetch reference](https://nextjs.org/docs/app/api-reference/functions/fetch).

Share tokens remain opaque and scoped to the opened collection and its own
resource reads. Never forward them to referenced collections, discovery, hub
links, third-party links or unrelated API routes. Do not persist tokens in client
storage. Signed-in reads may record access to that collection; rotation still
requires fresh authorization on subsequent reads.

Same-origin routing does not prove CSRF protection. The API rejects untrusted
origins on every cookie-authenticated mutation,
including bodyless actions, multipart uploads and auth routes. Product writes
carrying a session cookie require an exact allowed `Origin`; missing and
`null` origins fail closed. A bearer header alongside a session cookie does
not bypass that check. Cookie-free direct API clients retain bearer support
without an Origin requirement; the auth guard still validates the bearer.
Auth routes retain better-auth's origin checks, including login-CSRF coverage.
Test all of these cases before shipping browser writes. Keep the raw
better-auth handler ahead of body parsing. Align `BETTER_AUTH_URL`, allowed
origins, cookies and redirects with port 3000 in local browser development;
preserve supported direct API/bearer clients. Production uses path routing on
one HTTPS origin. No CORS policy is added by implication.

Runtime configuration has separate server and browser exports. Server secrets
retain `_FILE` precedence and loud invalid-production failures. Web server
configuration may contain the internal API origin; browser configuration may
not. `bun run check:web` enforces the import boundary; browser verification
inspects the production bundle for synthetic secret canaries.

## Browser acceptance

Use the actual web origin and isolated API/database fixtures. Exercise discovery,
hub, pretty URL, permalink and reference reads; cursor continuation; anonymous
404 equivalence; session expiry; cross-user isolation; unpublish/link rotation;
timeout and unavailable API. Check cookie issuance and browser-origin auth,
then every mutation content type including multipart before shipping writes.
Cover 409 reload/retry at the adapter and as a real browser journey when its
editing form lands. Exports require real downloaded file bytes when that
journey lands, not just a mocked success notification.

Focus rings are keyboard-only: a pointer press hides them page-wide (`FocusMode`) until Tab, arrows or F6 are used; text fields always keep their focused border. Check keyboard-only navigation and focus, 320/390/768/1280 px widths, 200% zoom,
long unbroken titles/URLs, loading, empty, failure and reduced-motion states.
Verify text contrast at least 4.5:1, large text 3:1 and meaningful control/focus
boundaries 3:1. Claim browser acceptance only for journeys exercised by the
production browser fixtures.

## Client architecture

`apps/web` is a separate HTTP client, including its Server Components. It imports
wire contracts from `@nslinkhub/types` and runtime config from `@nslinkhub/config`;
it never imports Prisma, Nest modules, database models or backend-owned business
logic. Database-backed browser fixtures live under `apps/api/test/browser`,
not in the web application. Backend validation and authorization remain decisive.

Server/browser config exports, server-only readers, a central browser adapter,
mechanical import checks and the root development launcher enforce the client
boundary. Normal document links avoid router prefetch/cache. Complete initial
server rendering awaits its reads so pages and cursor navigation remain usable
without JavaScript. Enhanced pagination preserves position/focus and announces
results.
If a document navigation is cancelled (for example with Escape), the loading
surface keeps a keyboard-accessible reload action. It reloads the current URL
through fresh server authorization; it never simply reveals the old hidden DOM.

The dev server rewrites `/api/*` to the trusted internal API origin. Production
uses ingress path routing to the API and web separately. Both dev and production
run the web's `server.ts` entry point: it derives the source from the socket and
explicit trusted proxy hops, overwrites untrusted attribution, and signs a
short-lived proof for the API read budget. API and web share `WEB_SOURCE_SECRET`
with `_FILE` support; browser bundles receive neither secret nor proof. The
API verifies attribution only for read budgets; backend authority is unchanged.
Direct `next start` is unsupported. Browser acceptance exercises that topology using an
isolated loopback proxy and the production web build. No deployment image is
required. Next.js/React/Tailwind versions are pinned in the workspace lockfile;
Webpack resolves the shared contracts' NodeNext `.js` specifiers to TS source.

Public hub continuation adapts the public `HubPage` envelope (`hub` + `collections`)
using `/hubs/:hubId`, never the owner-visible collection-list endpoint.
Invalid-cursor recovery stays on the current hub or reader; duplicate rows are
suppressed and announcements count newly appended items. Hub rows use pretty
URLs, while copied links and collection references retain immutable ID URLs. Next's encoded
dynamic route parameters are decoded once before validating the literal `@`
prefix and permitted path shapes. No share token reaches public hub discovery.

Client failures use the same reading width, plain-language messages and semantic
status colors. Meaning never relies on color alone. Offer recovery where a task
fails; infrastructure readiness remains an API monitoring concern, with no
client status page or dependency details in the UI.

## Sign-in and service operations

Email-code sign-in uses one email field followed by one eight-digit code field,
with native POST forms, visible resend/failure feedback and a safe local return.
The code flow is held in a short-lived encrypted HttpOnly cookie; email and codes
never appear in navigation URLs. No code is consumed by GET. Form submission
hides the previous document until fresh server rendering, including cancellation
recovery. Signed-in navigation shows an avatar-only account menu containing
Notifications, Settings, role-gated Manage, and Sign out.
The notification badge counts items newer than the account's last visit to
Notifications (`users.notifications_seen_at`); “Clear all” sets
`notifications_cleared_at`. `GET /api/v1/notifications`, `POST …/seen` and
`POST …/clear` are account-owned and separate from audited operator APIs.
The footer stacks the current-year product copyright above a smaller, muted
“an ns series product” line, with a Support link beside
it. Privacy and Terms join it when those pages exist. Service status is reserved for API monitoring and
has no client page or navigation entry.
A single icon button beside the avatar cycles System → Light → Dark → System.
Its icon shows the current mode; its accessible label and tooltip name the current
and next modes. System remains the default. Only admins
see `Operators and invitations` in the ops nav.

Manage is one role-aware workspace. Owners see Access, Collections and Audit;
operators also see Accounts, and admins have Team and Invitations. Owner and
service contexts remain explicitly separate in shared sections.

For service operators, `/manage` is an account table searchable by exact user ID or username, email and hub handle fragments.
Account (name and user ID), Username, Email, Role, Status, Joined and Active sessions are separate columns.
Email verification accompanies the address. Account detail includes hub, bio, suspension
evidence and session start/verification/expiry dates, without IP or user agent.
Session counts include only unexpired sessions; they are not historical last-login evidence.
Each account shows its user ID beneath its name, with Username in its own column.
The ID uses the Audit Log suffix display: hover reveals the full UUID and clicking
copies it with temporary “Copied” feedback. No expansion is needed. `/manage/collections`
resolves a pasted public collection link and lists active holds. Details use labelled identity/status rows, followed by named
actions with consequences, a required bounded reason and confirmation. Account
suspension, reactivation and session revocation are separate forms. Collection
moderation uses minimal IDs/hold state; operators read any content through the
ordinary reader. `/manage/audit` has one Search field for displayed actor, action, target, outcome and change,
Action and From/To dates, with an Include read events checkbox. Search matches all words case-insensitively, including partial IDs; it stays
bound to continuation. Explicit identity filters resolve to full IDs. Both audit contexts display the last UUID
segment for Actor and Target; hover reveals the full ID, and clicking copies it
with temporary “Copied” feedback.
Current usernames accompany actor IDs. Actions use explicit labels; targets follow
the action's entity rather than a generic ID precedence. Audit Log columns are
Timestamp, Actor, Action, Target, Outcome and Change, in that order. Outcome
shows the recorded result separately; Change shows
bounded hub effects and existing service states/reasons; missing evidence stays
explicitly unavailable. Actions/decisions is the default; Include read events adds
routine reads. Audit timestamps use the viewer's local `YYYY-MM-DD HH:mm:ss` with
seconds and date rollover, without per-row UTC offsets (labelled UTC without JS).
Desktop timestamps stay on one line. Missing Change values read “Not recorded”.
My hub / Service uses the same blue active underline as the Manage tabs.
Accounts switches to labelled rows below 1024px to accommodate its identity and
session columns; other Manage tables retain their narrower breakpoint.
Date ranges follow the same local days, with a UTC fallback without JavaScript.
Load more appends rows and disappears after the final page. Accounts,
Access, both Collections contexts, Team and Invitations use the same continuation
behavior, with sticky column headings and preserved filters. Shared ManageTable
appends server-rendered rows from an authorized read-only server action, preserving
native operation forms and their server-generated operation IDs. Native links
still navigate to the next page without JavaScript. No metrics dashboard, private-content preview or disabled
future actions. Error/reload and denied-access states work without JavaScript.

`/manage/team` lists current admins and operators. The separate admin-only
`/manage/invitations` tab owns the email invitation form and invitation rows with
explicit delivery/expiry states. Pending or expired operator invitations
have separate confirmed resend/cancel forms. Account details show a confirmed
remove-access form only to admins. `/invitations/accept` receives the emailed fragment token; `/invitations/review`
states responsibilities, recipient and expiry, then asks only new users for a name
and everyone for explicit consent. All recipients proceed to email OTP entry,
including matching sessions; verification activates the role. Wrong sessions get a sign-out action. Declining
is separate. Invitations open through their emailed token link. Terminal states
show the outcome without an active accept form.
Wrong-account states offer sign-in with the invited email without disclosing it.

Controls use the shared primary/danger/focus tokens, touch targets and
Schibsted Grotesk typography. Account details stack at phone widths; long emails/UUIDs
wrap. Recent-auth expiry opens “Confirm it’s you” and resumes the explicitly submitted
action once, bound to its original account and operation ID. Stale versions and
uncertain network responses require current-state review; hydration never
replays a mutation.

Native form requests use `x-web-form-source`, signed with the separate
`web-form-source` HMAC domain under the existing source secret. The API accepts
it only on POST for request budgeting; the existing read proof cannot substitute.
The web overwrites incoming proofs, checks the exact configured public Origin,
and forwards only bounded JSON and the session cookie. This attribution grants
no authentication or product permission. API/web both receive `BETTER_AUTH_URL`.

## Profile and appearance

`/settings` has left-hand navigation for Profile, Hub and Notifications, with
one section visible at a time. Selection uses `?section=hub` or
`?section=notifications`; the default and unknown values select Profile. No
additional settings subsections are introduced. Account access and deletion uses
a separate `/account` confirmation flow, linked from Profile and sign-in. On mobile, the navigation becomes
a compact horizontal row. The active section sits in a rounded, bordered panel
using the canvas surface and shared panel radius, matching the collection and
discussion containers. Navigation stays unboxed beside it, with a surface fill
for the selected section. Fields use whitespace rather than separator lines. Necessary helper text sits
beneath its control, including public-view links and Show owner behavior.
Sign out lives only in the account menu; Appearance remains in the header.

Profile starts with Email address, then Full name, Username, Bio and Member since. Bio is optional public plain text,
limited to 500 characters, with help beneath the textarea.
Hub starts with Hub ID, then Hub name, Handle, Show owner
and Description last. The description aligns with the input column and has a
readable multiline height. Without a hub, the Hub section shows first-save
guidance. **Show owner** edits `Hub.showOwner`; no visibility field lives on User.
Notifications contains invitation delivery information; future notification
preferences also belong here.

Section changes with JavaScript keep drafts mounted and autosaving. Native
links and explicit Save changes work without JavaScript, retaining the selected
section after saving. Desktop rows place labels left and controls right; narrow
screens stack labels and fields. View your public hub links to `/h/:hubId`.
The public hub also resolves by `/@handle` and shows its name, handle and description.
The identity line reads “@handle by Owner Name” when the owner shows a nonblank
name; otherwise only “@handle”, never an email fallback.
The name, identity line and description form one header group.
Hub creation and update dates are not displayed. Published collections has its own heading
and quiet count; empty feedback sits immediately beneath it, never at the foot
of the page. No row separators or decorative container borders are added.
The count uses public visibility rules across all pages, excluding private or held content.
Full-name or email changes never rename a hub or change its description. Hubs
are not transferable.
In Settings, View your public profile appears beneath Username, linking to
`/username`; View your public hub appears beneath Handle, using
`/h/:hubId?view=public`. These replace the static address hints. Ordinary clicks
wait for pending autosave and use the saved username or immutable hub ID.
Without JavaScript, links use the last saved values. There is no copy-link action.
Native POST forwards PATCH with signed form-source attribution; Origin, backend
validation and ownership remain enforced. Credential changes are excluded.

The shared avatar requests `/api/v1/users/:id/avatar`. Under
[ADR-0034](../engineering-decisions/0034-public-gravatar-avatars.md), all viewers
receive the active person's verified-email Gravatar or our generated SVG. The
proxy checks account eligibility before and after image resolution; unavailable
accounts receive only the generated icon. Chosen-image priority is retired.
Hashes stay server-side, responses are no-store, and provider fetch/cache limits
remain bounded. See [identity and handles](identity-and-handles.md#gravatar-follow-up).

Person profiles show a 64px picture above their name. Contributor lists and
account menus reuse the same component and user-ID URL. Settings has no picture
preview or provider instructions; a secondary question below the profile fields
links to `/support#profile-picture`. Support explains creating/updating Gravatar
with the account email, public visibility, optional use, generated fallback and
the update delay. Missing images never imply a missing provider account. No photo
upload UI, embedded editor or automatic name/bio import is introduced.

Appearance is a validated, HttpOnly, SameSite cookie containing only `light`,
`dark` or `system`. Server rendering sets the root attribute, and CSS semantic
`light-dark()` tokens follow it without a startup script or a theme flash. System
reacts to the OS preference. Header theme forms preserve the current safe local
URL, including shared-link query context, and work without JavaScript. The account
menu is a native disclosure enhanced with Escape and outside-click dismissal.

Signed-out visitors always follow the system color preference, even when the
browser retains an earlier appearance cookie. Saved Light/Dark/System preferences
apply only with a currently valid session; preference changes require sign-in.
The account-menu trigger shows only the avatar; the popup begins with Notifications.


Profile and hub changes autosave after an 800ms typing pause. Show Saving/Saved
status, retain drafts on failure and offer Retry. Edits made during a save queue
a subsequent save; viewing the public hub flushes pending edits before navigating.
No Save button appears with JavaScript. A noscript Save changes button preserves
native form editing without JavaScript.
Success uses green semantic feedback. Debounced handle availability distinguishes
current, available, reserved, taken and invalid names without exposing owners.
It is advisory: final validation and the database unique constraint decide the
write. Discard stale availability responses and preserve edits made during a save.

During a document navigation pending longer than ~300 ms, hide stale private
content and show a compact progress indicator (no placeholder skeletons) and
no immediate failure instructions. Offer reload recovery after eight seconds or
Escape cancellation. Reduced-motion users get a static indicator.


The owner’s hub view leads with the same hub name, handle, optional owner
attribution and description as the public page. Save a link lives in the top bar for every signed-in page (a labelled
“+” icon below 640 px). Your collections is a separate section below this identity;
it includes the owner’s private collections.

The wordmark links signed-in users directly to `/h/:hubId` for their personal hub
and signed-out users to the landing page.
Keep its normal ink color in all interaction states and remove link underlining;
retain the shared focus outline. Notification rows are informational, with no
link/hover affordance that implies in-app invitation acceptance. They direct
recipients to their email. Invitation codes are not implemented.


Routine profile-save confirmation is a compact green “Saved” with a check beside
the form; errors remain prominent. Show the public-address preview below the
handle and only show format/availability guidance when it changes. Keep native
field values intact through hydration and preserve edits made during a request.
Page titles use the current surface name followed by “· nslinkhub”; hub titles
use the public hub display name. Account/private collection data and tokens do not appear
in metadata titles.


Discover is a persistent header link grouped on the right with the account controls for both signed-in and
anonymous visitors. Do not repeat it as a breadcrumb on hub/collection pages;
collection context retains its hub link. Signed-in visitors then see Save a link, the appearance toggle and the avatar; navigation wraps at narrow widths or
enlarged text.


## Public entry and neutral surfaces

The root `/` introduces the product; `/discover` is the public feed.
The header keeps the wordmark alone on the left and groups Discover before the
account controls on the right.
The landing uses a clearly labelled example collection, working discovery and
sign-in/own-hub links, and no pretend collection editor. Dark surfaces are
neutral charcoal; the blue accent, semantic feedback and system preference
remain shared with account and reading pages. The self-hosted Schibsted Grotesk face is part of the identity. Landing headings may scale up to 3.5rem; product headings
retain the compact type scale. Layout stacks naturally on narrow screens.


### Stable page frame and compact discovery

The document scrolls beneath a sticky header. The footer stays at the viewport
bottom on short pages and follows the content at the end of longer pages; it
never overlays content or remains pinned while the document scrolls. Main is
keyboard-focusable as the skip-link target. Very short viewports (480px high or
less, including heavy zoom) use natural document flow. Discover and public
hubs use compact collection rows in two columns on desktop, one on phones;
reading content keeps its comfortable text width. Desktop uses Previous/Next
pages sized to the frame; mobile retains More collections, with native
next-page links without JavaScript.
Inline text links use accent color or button styling without decorative arrow
suffixes; list titles are ink. The small external glyph beside a resource
hostname marks the destination type and is not a link suffix.


Landing questions type at 65ms per character, hold each completed question for
about three seconds and loop quietly, with no control. Reserve space for the
longest question, keep the complete set available to screen readers without live
announcements, and show static questions with reduced motion or without
JavaScript. No animation library is needed.

## Capture and collection lists

Desktop discovery uses the remaining main-region height to show only complete
collection rows, with Previous/Next controls. Capacity is recalculated on resize
and text changes; mobile and short/zoomed viewports retain scrolling. Native
no-JavaScript rendering retains readable cursor pagination. Long pages use the
document scrollbar; main has no separate scroll container.

Collection rows show title, up to two description lines, then hub attribution and
updated date. Keep the header/footer and landing discovery divider; omit repeated
row and example-content rules. Account navigation retains **Sign in**. Capture
reuses labelled native controls, private defaults and explicit success/failure.

Landing composition: two balanced desktop columns, capture above discovery on
the left and a compact example collection spanning the right. The discovery
divider marks the second intent within the left column. Mobile stacks capture,
example, discovery. Keep the shared typeface, tinted-neutral palette and blue actions.

Collection owners can edit name, description and comment settings together.
The editor preserves submitted values on errors through progressive form state,
including without JavaScript. Backend policy and version checks remain authoritative.
Hide collection pagination entirely when all results fit and no further cursor exists.

Collection previews and readers show description and tags, hub context and
updated time. Reader metadata keeps the owner, contributor count and updated
time on one line, with “Created by <person>” when creator and owner differ.
The API supplies immutable creator provenance.
Hub links use the immutable `/h/:hubId` route. No email fallback is used for
publication attribution. Collection ownership follows the hub owner, not the
original creator or the last editor.


## Collection editing and hub routes

Owners and contributors see one Edit button beside Share in the collection
sheet's top bar at every screen width. It opens `/c/:id/edit`, with owner-only
collection details and a paginated Items and sections area. The latter offers
Add a link through the existing owner capture flow, Reorder, Add section and
per-section description editing. History is a secondary link. Metadata uses a
native form with name, description, comment settings and Save changes /
Cancel; all editing paths work without JavaScript.
Validation errors keep the draft. A version conflict keeps the draft, shows the
latest saved name and lets the owner start again from the latest version or save
the draft over it deliberately. Success returns to the reader with a toast.
The edit page requires the API's `canEdit` capability; owner metadata additionally
requires `canManage`. The API still decides every write. Visitors see read-only content.

Both `/h/:hubId` and `/@handle` resolve the hub and show its authenticated owner
their own collections. Everyone else receives only the public list. `/hub` is a
compatibility redirect, never the shared address. Settings alone offers View your
public hub, using `?view=public`; that explicit preview always uses public list
queries, including pagination. Copy links omit the preview flag and use the
immutable ID. Private listing authorization remains backend-owned.


## Shared visual system

One self-hosted typeface (Schibsted Grotesk) keeps the brand consistent across
platforms; the wordmark stays the plain text
`nslinkhub` with no icon. All routes share one left content edge, one row
vocabulary (collections and resources), one button vocabulary and one form
control style (fields under `main` share border, hover and focus states).
Accent blue is reserved for primary actions, inline text links, focus and
selection; titles, navigation and metadata links are ink or muted. The header
Discover link is muted, turning ink on hover. The collection reader's hub link
carries a small back chevron; operator section navigation does not. The account
menu popup and the landing example are the only elevated surfaces. Hub and
collection layouts add no row separators or container borders. Exact values live in
[DESIGN.md](../../DESIGN.md).


## Reader, discussion and verification interactions

- Collection reader: one sheet whose header (hub link, Share and Edit for owners/contributors, title,
  description, tags, metadata with GitHub-style relative “Updated …” and the
  exact time in the title) stays fixed on desktop while sections and links
  scroll inside it. The description eases closed over 220ms before links scroll;
  title, tags, author/update metadata, access notices and the sheet bar stay
  visible. Input during the transition carries into the links when it finishes,
  keeping a continuous scroll gesture. Reduced-motion preferences skip animation.
  Returning to the top (or scrolling upward there) restores the introduction.
  Only scrolling in the collection sheet triggers the fold, not the independent
  discussion column. Small/short viewports
  retain natural document scrolling; without JavaScript the full heading remains.
  From 1024 px a Contributors section shows linked avatars and a total at the top
  of the sidebar. The collection header shows up to three stored item-derived tag names,
  then +N tags for the remaining names; omit the tag row when empty.
  Discussion follows Contributors in normal flow, independently of the collection
  header and its folding description. At viewport heights of at least 600px,
  the collection and discussion each grow naturally with their own content.
  Both are capped by the reader layout's available space above the footer;
  the discussion's limit accounts for Contributors and the gap above it.
  A short collection never caps a longer discussion, and an empty discussion has
  no imposed minimum height. CSS provides the same sizing without JavaScript. Discussion keeps its
  heading visible; comments scroll below. Add a comment at the top opens a
  native disclosure containing the input (Ask a question or add a note…) and
  Post button. Closing preserves drafts. Signed-out readers see Sign in to join
  the discussion and return to the open composer; JavaScript focuses the input.
  Opening, closing and returning from sign-in also work without JavaScript.
  Disclosure focus rings follow keyboard use; returning to a pointer-focused
  disclosure after switching windows does not add a ring. Text inputs retain
  their normal focus indication.
  Short viewports use document scrolling.
- Sign-in codes: one code per address every 30 s (server-enforced, `429` with
  `Retry-After`; cleared by a successful sign-in) inside the existing 5 per 10
  minutes. The code page disables “Send a new code” with a live countdown from
  the flow's separate retry deadline (issuance remains the expiry anchor); without JavaScript, reload after the wait.
  `AUTH_CODE_RESEND_SECONDS` (API and web) shortens it for isolated tests only.
- Layout reads session, profile and theme in parallel.

- Discussion: on wide screens the side column places Contributors above Discussion,
  with comments scrolling independently beside the sheet. Below 1024 px both
  sections follow the collection links in document flow. Native forms post through `/forms/comment-*` and return to
  the same collection URL (keeping an explicit share token) at the comment's
  anchor with a toast; errors show inside the discussion. Reply, Edit and Delete
  (with a confirm step) are disclosures; contributor replies carry a Contributor
  label and the accepted answer a green Answer marker. Native anchor jumps may
  scroll the document; the footer follows the content.
- People appear by username, linking to `/username`. The API carries
  `PersonRef { userId, username }`, including for contributors without a hub.
  Names appear on person profiles when set; `Hub.showOwner` controls profile/hub links and hub owner credit;
  access-management lists retain the invited person's name and email.
- Comments read TikTok-style: "username · Contributor" (a Contributor pill), the body, then the age leading the actions — "53m  Reply  Edit" —
  as now, 53m, 23h, 2d, then a date ("Oct 7"); the exact time is on hover.
- Discovery is `GET /api/v1/discover` (web `/discover`).

Collection-row and account-detail Action buttons use the secondary button style. Native modal dialogs are portaled out of tables, centered, labelled, and retain keyboard Escape/focus behavior. Actions are direct links, with no intermediate selector or Run step. Without JavaScript, an expandable native list provides the same operation continuation. Collection toolbar Share leads to a copyable URL and owner-only access controls.

Accounts rows open account detail directly. The account name is a plain-text form button for keyboard and JavaScript-free access, without an anchor; copy-ID controls do not navigate. No Select or Action column is shown. Account detail presents permitted action buttons at the bottom without a chooser dialog.

Account detail groups name/public-profile username in a heading with a 24px gap
before metadata. Desktop metadata uses a 10rem label column, 24px column gap and
16px row gap; labels stack over values below 640px. Session/action sections use
32px separation, 24px top padding and 16px between heading and content. The
layout keeps the existing theme, field order and bottom action placement.


### Permanent hub handle and account confirmation

An unclaimed hub handle shows availability, its prospective `/@handle` address,
a permanence checkbox and an explicit Claim handle button. Handle edits never
autosave. After claiming, the handle becomes a plain label/value fact in the same
layout as Hub ID, retaining the hint “This is your claimed permanent hub handle.”
A hidden field preserves the native form's saved handle, while the backend
continues to enforce immutability.
Person usernames continue to autosave with existing validation.

Account deactivation and deletion are separate choices. Each explains consequences
before sending an action-specific email code. The native verification form names
the action being confirmed; error, expired-code and resend paths remain available.
Recovery requires the account email and restores neither old sessions nor service
privileges. The account page uses the existing quiet typography and form tokens;
only the final deletion confirmation receives destructive emphasis.
