# API & Persistence Conventions

Small, load-bearing rules that every module follows. Casing is the recurring
one, because three layers meet here.

## Casing

- **JSON field keys → camelCase.** Every request and response key is
  camelCase: `hubId`, `linkedCollectionId`, `linkSharingEnabled`,
  `requestId`, `nextCursor`, `redisQueue`. The whole
  stack is TypeScript (Prisma models, DTOs, response mappers, and
  clients), so camelCase keeps payloads transform-free from the database row
  to the client.
- **Machine-token values → `lower_snake`.** Values that a client matches on
  programmatically — not prose — are lowercase snake tokens: error codes
  (`not_found`, `validation_failed`), resource kinds (`external_link`,
  `collection_link`), share roles (`viewer`, `contributor`), share sources
  (`direct`, `link`), export formats (`markdown`, `pdf`,
  `docx`). This is deliberately distinct from field keys and
  is the common convention (HTTP, OAuth, Stripe error codes).
- **Database columns → snake_case**, mapped to camelCase model fields with
  Prisma `@map`/`@@map` (`hub_id` ↔ `hubId`). PostgreSQL folds unquoted
  identifiers to lowercase, so camelCase columns would force double-quoting
  in every raw SQL statement — and this project has substantial raw SQL
  (migration triggers, functions, CHECK constraints). snake_case columns keep
  that SQL and `psql` clean; the `@map` verbosity in `schema.prisma` is the
  one-time cost that buys it.

Application-owned keys remain camelCase. Recognized standard `utm_*` keys
inside sharing attribution retain their conventional spelling; client-owned
context keys are opaque JSON metadata.

## Response envelope

- Success: `{ "data": ..., "meta"?: ..., "warnings"?: [...] }`.
  Forgiving share-open metadata uses warnings with `code`, `field`, `message`;
  warnings do not alter success status or imply a retry is needed.
- Failure: `{ "error": { "code", "message", "requestId", "details" } }`.
- Every response carries a server-generated `X-Request-Id` header.
- Growth-prone lists paginate by opaque cursor: `meta: { limit, nextCursor }`.
- Collection PATCH requires `version` in the body for optimistic concurrency.
  Read responses use ETags with `If-None-Match` for conditional GETs.

See [verification](../runbooks/verification.md) for contract checks.

## Typed errors and safe details

`packages/types/src/errors.ts` owns the product API's error catalog, status and
safe fallback text. `ApiError.error` is a discriminated union: narrowing its
`code` narrows `details`. Clients branch on codes and own user-facing copy;
`isApiErrorCode` validates incoming codes before clients select safe fallback copy.
Never render arbitrary remote exception text as trusted content.

Application services throw the backend-only `appError(code, details?)`.
`AllExceptionsFilter` recognizes that instance; ordinary Nest/framework
exceptions are mapped by HTTP status, and their messages, codes, objects and
stacks are discarded. A payload that merely claims `dependencies_unavailable`
or `validation_failed` receives no privileged treatment. Unexpected failures
are sanitized and captured once by the telemetry boundary. Hidden and absent
collections both return the identical safe `not_found` shape (apart from the
request ID). SQL errors never expose driver messages or database metadata.

Useful actionable codes include:

| Code | Meaning for a client |
| --- | --- |
| `validation_failed` | Highlight declared fields using `details.issues` |
| `invalid_cursor` | Discard the cursor and reload the first page |
| `version_conflict` | Reload current state before retrying the edit |
| `handle_unavailable` | Choose another value |
| `handle_invalid`, `handle_reserved` | Correct the requested handle |
| `handle_change_cooldown` | Keep the current handle; display the profile’s next eligible change date |
| `duplicate_resource`, `position_conflict` | Resolve the existing resource/order |
| `invalid_reorder`, `invalid_transfer` | Correct the operation |
| `transfer_requires_contributor` | Grant the recipient contributor access first |
| `collection_not_published` | Saving requires publication |
| `too_many_requests` | Respect Retry-After before another attempt |
| `service_unavailable`, `dependencies_unavailable` | Show a retryable unavailable state |

Other failures use safe generic status codes such as `bad_request`,
`unauthorized`, `forbidden`, `not_found`, `conflict`, and `internal_error`.
The catalog is authoritative; do not duplicate message-to-code parsing.

Validation returns `details: { issues: [{ field, rule }] }`. Field paths come only from class-validator DTO metadata;
`*` denotes an array item and `$` an unspecified/unknown field. A submitted
unknown property name is never reflected. Rules are a bounded union, not
constraint messages. At most 32 distinct issues and eight nested levels are
reported; neither submitted values nor validation targets leave the server.
UUID/JSON parser failures use a safe generic `bad_request`.

The only other nonempty details variant is readiness:
`dependencies_unavailable` includes `{ dependencies: { postgres,
redisQueue } }`, with only `ready`/`unavailable` values.
All remaining codes carry `{}`.

The raw `/api/v1/auth/*` handler retains better-auth's own response protocol;
it runs ahead of Nest's filter. The shared endpoint budget can still reject a
request before that handler using the product error envelope. The web auth
adapter normalizes both protocols without changing raw handler/body-parser
ordering.

## Wire-contract verification

`@ntumie/types` owns shared wire shapes for both requests and responses.
Web code constructing an API payload uses an imported request type (`satisfies`
or a typed parameter), rather than a parallel local interface or an unchecked
object. Local form state may have a different shape: strings, draft text and
navigation context are adapted to a wire request at the HTTP boundary.

Backend DTOs implement the matching request interfaces and retain all runtime
decorators and validation. `apps/api/test/request-contracts.typecheck.ts` checks
exact DTO field/type parity, including optional fields, during API typecheck.
Adding an optional backend field must not silently leave the client contract
behind. API-only features retain their contracts even before a web screen exists.

These types describe messages, not authority. Only the API validates input,
checks permissions, executes workflows and derives authoritative state. Clients
consume returned capabilities and results. HTTP transport and untrusted native
form adapters can accept `unknown`; do not assert that unvalidated input satisfies
a request contract. In particular, share-open attribution/context must reach the
API's forgiving parser so optional invalid metadata does not discard the event.
Do not import Nest DTO classes or backend domain services into the web.

Profile, collection, resource, share, shared/saved, hub-page, audit and status
mappers compile against `@ntumie/types`. Dates become ISO strings explicitly
at the serialization boundary. Persisted role/source/kind strings are validated
against their wire unions rather than hidden behind type assertions. Responses
are selected field-by-field; adding a database column cannot silently expose it.

`apps/api/test/wire-contracts.e2e.spec.ts` checks actual JSON keys, nullability,
timestamp strings, omitted optional resource URLs, pagination and ETags through
`configureApp`. Its expected shapes are themselves checked against shared types.
It covers private/missing 404 equivalence, direct-versus-link-share email
privacy, dormant saves, readiness states and malicious validation/error inputs.
Expand these checks as new slices ship. Nest DTOs and Swagger stay in place;
a Zod or generated-client migration still requires its own evidence and plan.
