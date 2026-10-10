# ADR-0036: Browser API traffic and OAuth callbacks reach the backend directly

Status: accepted (2026-10-10).

## Context

The user requested Pigfarm's transport pattern and reaffirmed that business
logic belongs in the backend. NSLinkHub's development Next rewrite obscured the
API destination, and BETTER_AUTH_URL served both OAuth callbacks and web links.
Pigfarm instead uses direct browser-to-API calls with exact-origin CORS locally;
production ingress routes API paths directly to the API.

## Decision

Remove the Next API rewrite. Development uses backend BETTER_AUTH_URL
`http://localhost:4000` and WEB_ORIGIN `http://localhost:3000`, with explicit
port overrides from the launcher. Google callbacks use the backend URL; web
redirects, WebAuthn origins/RP IDs, invitations, shares and exports use WEB_ORIGIN.
Production retains one public origin with ingress routing `/api/*` to Nest.
WEB_ORIGIN may default to an explicitly configured BETTER_AUTH_URL for that case.

Only the exact configured web origin receives credentialed CORS. Allow bounded
methods/headers and expose request IDs/retry timing, never bearer issuance
headers. Cookie mutations independently require the web Origin; missing, null
and foreign origins fail closed. Better Auth trusts the configured web origin.
API and web share a hostname and scheme so host-only cookies remain usable by
both; unrelated domains and cross-site cookies are outside this decision.

The web renders its validated public backend origin for browser requests and
image URLs. Private API_INTERNAL_ORIGIN and secrets stay server-only. Runtime
configuration preserves one prebuilt artifact across environments. Next has no
API catch-all proxy. Native `/forms/*` and server rendering remain delivery
adapters under ADR-0003, including no-JavaScript Google initiation; they do not
exchange OAuth codes, choose Gravatar pictures or own product authorization.
Gravatar lookup, hashing, eligibility, caching and fallback remain in the API.

## Alternatives and rationale

Keeping the development rewrite gives one origin but hides the direct backend
contract. Moving all native forms into browser JavaScript would remove existing
no-JavaScript support without improving backend authority. Direct API requests
plus the existing bounded form adapters satisfy both requirements.

## Consequences and migration

This supersedes the no-CORS/development-rewrite policy in the former Origins
sections of SECURITY.md and infra-deployment.md, and amends the same-origin
browser-adapter description in web-interface-system.md. ADR-0003's native form
origin rule remains valid; its backend-authority rule is unchanged.

Restart development after the launcher environment changes. Register Google's
new local callback `http://localhost:4000/api/v1/auth/callback/google` (or the
explicit API port). Do not change Pigfarm's existing callback registration.
Verify both direct local origins and production ingress routing, including
passkeys, protected Google redirects, cookies, avatars and foreign-origin denial.

## References

- [Security boundary](../SECURITY.md#origins-cors-and-csrf)
- [Local development](../runbooks/local-development.md)
- [Backend authority and native forms](0003-backend-owns-rules-native-forms.md)
- [Passwordless security](0035-passwordless-account-security.md)
