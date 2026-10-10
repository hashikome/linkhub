# Transactional Email

## Direction

Implementation status: codes-only templates, transaction-scoped auth,
encrypted PostgreSQL outbox, BullMQ relay/worker, capture and Resend providers,
and signed webhooks are implemented locally. See the
[integration contract](auth-delivery-integration.md) for endpoints, evidence and
retention. Web email-change screens, live sender/domain validation and live webhook
configuration remain separate acceptance work; no live sending is claimed.

Use Resend as the initial transactional-email provider. It fits the
namestarlit-VPS deployment model because the application only needs an HTTPS
API, signed webhooks, and restricted deployment secret files — no outbound SMTP
infrastructure to operate. Keep provider-specific code behind an application
adapter so switching providers does not change domain workflows.

Implemented messages:

- sign-in code (continue-with-email);
- account-email change (confirmation to the current address, then
  verification to the new address);
- service admin/operator invitations and their acceptance codes.

Other message kinds require their own product workflow and template work:

- collection-share notification (a collection was shared directly with an
  account);
- targeted collection-share invitation to an unregistered email (planned);
- account-security notification;
- high-priority operational alert when explicitly configured.

Do not use the transactional channel for marketing.

## Authentication Boundary

better-auth owns credentials, sessions, and verification primitives (see
`AGENTS.md`). The product does **not** re-implement verification or OTP
primitives. better-auth **mints**, hashes and consumes the OTP; the application
binds the email-change workflow to its purpose, initiating session and target
address. The outbox + Resend adapter deliver the library-issued code.

Concretely, better-auth's OTP send callbacks receive the code from
better-auth and enqueue an application email-outbox intent. They never call the
Resend SDK directly and never construct their own tokens. When the ns-series
identity provider (nsauth) exists, verification delivery may move
behind the SSO boundary (`docs/design-docs/identity-sso.md`); this adapter is
the seam that makes that migration a delivery-path change, not a workflow
change.

## Application Boundary

The API owns the provider-neutral interface in `src/email/provider.ts`:

```ts
interface EmailProvider {
  send(key: string, payload: DeliveryPayload, reference: string): Promise<string>;
}
```

Auth callbacks enqueue email intent; they do not call Resend directly.
Application-owned React Email templates and rendering live in a backend-owned
`packages/email`. Enqueue selects the approved template, renders HTML and plain
text, then encrypts the recipient and rendered message in the auth transaction.
The worker loads authoritative intent state from PostgreSQL, decrypts that
immutable payload and passes it to the provider adapter. Retries preserve the
same payload and idempotency key. Sharing notifications are not yet wired.

Providers do not own templates. Do not pass React components directly to the
Resend adapter or upload the authoritative templates into Resend. This keeps
template review, tests, retention behavior, and a future provider migration
inside the application boundary.

Template inputs:

- contain only the minimum values needed to render the approved message;
- never include recipient addresses because delivery metadata owns recipients;
- use opaque, expiring application URLs rather than raw record IDs (hubId,
  collectionId, and share IDs are immutable UUIDv7 values and must
  not leak into provider-visible URLs or tags);
- avoid names and hub details unless a reviewed message requires them;
- remain typed and discriminated so unsupported message kinds fail before
  provider delivery.

New email workflows must use the provider-neutral outbox, worker and an
environment-appropriate sender before they are exposed to users.

Use:

- a deterministic in-memory or restricted local-capture sender for automated
  tests and local development;
- the Resend adapter for deployed environments.

The local/test sender must not print verification links, reset links, OTPs,
recipient addresses, or rendered email bodies to ordinary application logs.
The implemented capture sender exposes messages only through bounded in-memory
test assertions, with no HTTP or ordinary-log inspection path.

## Delivery Workflow

Use a PostgreSQL outbox so API requests do not depend on synchronous email
delivery:

1. process the auth mutation through better-auth in the request transaction;
2. render the approved React Email template into HTML and plain text;
3. encrypt and append email intent in that same transaction, then commit;
4. let the outbox relay publish a BullMQ job containing only the outbox ID;
5. let the worker claim authoritative delivery state and decrypt the payload;
6. send the rendered message through the environment-selected provider with an
   idempotency key;
7. record the provider message ID and send result;
8. process signed Resend webhooks idempotently;
9. update delivery, bounce, complaint, delay, failure, and suppression status.

Email and link-metadata lookups use durable PostgreSQL intent and BullMQ
dispatch; exports are synchronous and do not queue. Run delivery in a separate worker process
built from the API image. Scale the worker independently or split specialized
workers only when measured load or failure isolation justifies it.

Do not place recipient addresses, subject lines, template variables, or
rendered content in Redis job payloads. Queue only the email-outbox ID or
another purpose-limited opaque reference.

## Templates And Rendering

`packages/email` is backend-owned and provider-neutral. All code-bearing
messages render through one shared base (`code-email.tsx`) so the layout and
warning language never drift between purposes, and **every code email carries
the code only, with no direct authentication link**. Built
templates (typed inputs, validated before render, HTML + plain text, subject
never carries the code):

- **verification code** (`renderVerificationCode`) — purpose-specific subject,
  inbox preview and body for sign-in, saving a first link, continuing, resuming
  after session expiry, confirming a sensitive action, and invitation acceptance.
  Resends retain the same purpose. All variants share the code layout and warning.
- **email-change confirmation** (`renderEmailChangeConfirmation`) — to the
  **current** address, naming the target address; step one of the
  double-verified account-email change
  ([identity-and-handles.md](identity-and-handles.md)). Ignoring it changes
  nothing.
- **new-email verification** (`renderNewEmailVerification`) — to the **new**
  address; completing it applies the change and revokes all sessions.

Collection-share notification remains separate sharing work. Password reset
is not a product feature; sign-in uses mailbox codes.

**Visual direction (decided):** Substack-style minimal transactional layout —
the lowercase `nslinkhub` wordmark (text, no image logo), one large
letter-spaced code, a short validity line, one bold "do not share" warning, then a muted footer with the
support route. Use a neutral near-black palette; the web theme is not an email rendering contract.

Each render returns an application-owned subject, HTML body, and plain-text
body. Keep subjects free of personal or sensitive data. Use conservative
email-client-compatible layout and inline styles.

Every approved template:

- accepts an explicit supported locale and renders matching language metadata,
  subject, preview, body copy, actions, and expiry units;
- includes a configured HTTPS support route for unexpected-message recovery;
- includes viewport metadata and conservative narrow-client adaptations;
- validates HTTPS support URLs, expiry bounds, product-name bounds,
  and purpose-specific values before rendering.

Import only the focused React Email components and renderer used at runtime. Do
not depend on the preview/CLI package from production rendering code.

Tests must prove that each approved template renders both formats, includes its
required code and support route, uses localized language
metadata and copy, handles singular expiry units, retains meaningful-text WCAG
AA contrast, and does not emit missing placeholder values. Delivery integration
tests remain responsible for proving that sensitive content stays out of
ordinary logs, Redis payloads, and external telemetry
(`docs/design-docs/observability.md`).

### Shared footer and warning

Code emails carry one warning line, “Do not share this code with anyone.”, and
every email (codes and invitations) ends with the same footer as the web: a
support prompt (“Didn't request this? You can safely ignore this email. Need
help? Contact <support>”), then “© <year> nslinkhub” over “an ns series
product”. The prompt always links `EMAIL_SUPPORT_URL`, the web `/support` page,
which shows the support address (`SUPPORT_EMAIL`, web server config). Emails
never carry the address themselves, so changing it needs no email change.

## Idempotency

Every send must have an application-owned idempotency key. Do not include raw
user, hub, collection, or share IDs in provider-visible idempotency keys.
Use a random outbox-message ID or a purpose-limited opaque reference.

Resend retains idempotency keys for a limited window. Keep the durable
deduplication state in PostgreSQL so retries remain safe beyond the provider
window.

Delivery has an external side effect and cannot be made atomic with a database
transaction. Use an exclusive, expiring database claim so concurrent deliveries
cannot both send; recover stale claims after crashes. Keep provider-send failure
separate from failure to record provider success. The latter retries bookkeeping
with the same idempotency key, not a new message. Do not claim exactly-once
delivery beyond the provider's deduplication window; resolve uncertain outcomes
explicitly before resending expired authentication material.

The queue adapter owns bounded connection/retry/shutdown behavior. Versioned
jobs carry only opaque delivery references and approved correlation context.
Malformed known jobs fail terminally; unknown versions remain recoverable across
rolling upgrades. Prove duplicate delivery, Redis loss/recovery, worker death,
poison jobs, and retry exhaustion against isolated real services.

## Auth Integration Gate

Inject persistence, configuration, and durable-delivery callbacks into the
better-auth composition root. Prove callbacks persist intent before reporting
success; where better-auth and the outbox cannot share a transaction, document
and test the recovery path. Preserve `resolveSessionUser`, app-owned hub
onboarding, and the raw auth handler before body parsers.

Authentication uses email codes only. The transaction-scoped integration proves one-time consumption,
resend invalidation, concurrent completion, cross-device sign-in and replay
rejection on the pinned dependency. GET never consumes proof. Eight-digit
verification codes are keyed-hashed through the supported auth integration;
shared issue/verify budgets and non-enumerating issuance responses apply.
See the [integration contract](auth-delivery-integration.md) for endpoints,
transaction semantics, retention, failure recovery and local acceptance.

Email change confirms the current address, verifies the new one, and revokes
all sessions. Its proof cannot be replaced by a normal sign-in code. Security
audit outcomes land with the flow, never including codes or links.

## Domain And Deliverability

Use a dedicated sending subdomain such as:

```txt
notify.example.com
```

Configure and verify SPF, DKIM, and DMARC (starting with a monitoring policy and
tightening after validation), plus a monitored reply-to or support address.
Using a subdomain isolates transactional sending reputation from other domain
mail.

Production sending-domain verification and DNS rollout can finish during
deployment preparation. The Resend adapter and queued delivery path are
implemented.

## Webhooks

The API webhook endpoint is:

```txt
POST /api/v1/webhooks/resend
```

Requirements:

- verify the Resend webhook signature against the raw request body (respect the
  better-auth-before-body-parser ordering in `app.setup.ts` — the webhook route
  needs the raw body, like the auth handler);
- reject invalid signatures;
- process webhook deliveries idempotently because providers retry;
- retain only fields required for delivery state and support;
- avoid logging webhook payloads;
- alert on sustained webhook failures.

Subscribe initially to `email.sent`, `email.delivered`, `email.delivery_delayed`,
`email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`.

Disable open and click tracking unless there is a concrete product requirement.
They add privacy considerations and are not needed for authentication or
share-notification emails.

## Privacy

Email delivery necessarily sends recipient addresses and rendered message
content to Resend. Treat Resend as a processor of personal data and review its
data-processing agreement before production.

Minimize provider-visible data:

- use templates with the smallest necessary variable set;
- do not put personal or sensitive data in subjects;
- link users back to the authenticated application for sensitive details;
- do not include user, hub, collection or resource IDs in provider tags or
  idempotency keys; the opaque outbox UUID is a delivery-only correlation tag;
- do not emit recipient addresses, subjects, template variables, or webhook
  payloads into external telemetry.

Store only the minimum delivery metadata. Delivery/webhook metadata retains
30 days; credential payloads are erased on terminal outcomes or expiry. The
[integration contract](auth-delivery-integration.md) owns retention details.

Credential-bearing render inputs need an explicit shorter lifecycle than
delivery metadata. Strip them on delivery or terminal failure; sweep abandoned
pending intents without disrupting live claims or legitimate retries. Do not
deliver already expired challenges. Test cleanup after relay exhaustion as well
as after worker attempts: a message the worker never sees can otherwise retain
a plaintext code indefinitely. Hashing the auth verification row alone does
not protect a renderable copy in the outbox. Review any transient plaintext
retention and access boundary before enabling code delivery.

## Secrets

Store `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_SUPPRESSION_SECRET`, and sending-domain
configuration. Provide credentials to the API or email worker through the
deployment's restricted `_FILE` secret contract
(`docs/design-docs/infra-deployment.md`). Do not bake them into images, source
control, or external telemetry.

`EMAIL_SUPPRESSION_SECRET` is a stable, independent HMAC key of at least 32
characters, required in production. Preserve it across auth-secret rotation
and database restore; changing it requires an explicit suppression rekey/import.
Credential expiry erases render inputs but retains the outbox delivery reference
for signed provider-event correlation during the 30-day metadata lifecycle.
See [auth delivery](auth-delivery-integration.md) for the implemented contract.

## Alternatives

Re-evaluate the provider when delivery volume or pricing materially changes,
regional data-handling requirements change, support or deliverability does not
meet requirements, or the product needs advanced inbound mail, marketing
automation, or dedicated IP controls. Likely alternatives are Postmark for a
strongly transactional focus and Amazon SES when cost optimization justifies the
additional operational overhead.
