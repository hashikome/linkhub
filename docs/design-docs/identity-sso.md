# Shared Hashikome identity and single sign-on

Status: accepted direction; integration is not built. Local email codes,
user-verified passkeys, Google sign-in and confirmed account creation and optional TOTP/recovery are
implemented. [ADR-0035](../engineering-decisions/0035-passwordless-account-security.md)
explicitly amends delivery order to ship these methods before nsauth. Delivery order is in
[PRODUCT.md](../../PRODUCT.md#11-delivery).

## Scope and ownership

The 11 October company direction supersedes the earlier personal **namestarlit**
account brand and “Continue with namestarlit” action. Hashikome will own the shared
identity foundation. Its final name, provider and first integration scope remain
open; **nsauth** in older records is a working name, not a deployed service.
Branding belongs in configuration and copy, never in schemas, API fields or
environment-variable names.

The existing product-user proposal covers users, single sign-on, profile, MFA
and federated login. Operator access may also be considered during the shared
platform review; no cross-product grants are introduced by this rename.
Organizations, business tenants, groups and
service accounts are outside this scope. Product authorization stays in each
product: LinkHub owns hub ownership, collection grants and service-operator
permissions. An identity-provider claim never grants access to a collection or
creates an operator grant.

```text
Shared identity (separate service)
  owns: credentials, immutable identity subject, identity sessions,
        MFA/recovery, basic profile, consent and connected services
  authenticates through OIDC
    -> LinkHub: local user ID, product sessions, onboarding,
                  hub ownership, collection policy and product data
    -> other company products: their own users, sessions, policies and data
```

Account management is one lightweight center for shared identity concerns:
credentials, MFA, active sessions, name/avatar/email, federated logins and
connected-service revocation. Hub settings, collections and other product data
stay in the product.

## Integration contract

1. **Keep local user IDs authoritative.** Link the external immutable `sub`
   to the local user as a one-to-one external identity. Product primary keys
   and foreign keys continue to use the local UUIDv7 user ID.
2. **Require product enrollment.** SSO authenticates a person; it does not
   silently enroll them in every product. First use requires that product's
   explicit signup and app-owned onboarding. LinkHub's
   [people-and-hubs design](people-and-hubs.md) creates a hub only on first
   save, collection creation or receipt of a collection transfer.
3. **Keep product sessions local.** The IdP authenticates; the product issues
   its session. Product logout and identity-wide logout are distinct actions.
4. **Keep authorization product-owned.** Hub ownership, collection policy and
   service-role grants resolve from product state, never from an IdP role.
5. **Link accounts with verified proof.** An existing account links through a
   verified-email match or an explicit authenticated linking step. Neither
   duplicate identities nor an unverified email match may take over an account.
6. **Preserve local sign-in.** Email codes coexist with SSO. Services consume
   `AuthUser` through `resolveSessionUser`; better-auth types stay behind that
   boundary. Onboarding is callable from any supported authentication path.

Account disable/delete and identity-wide logout are low-frequency
identity signals delivered through authenticated HTTP callbacks. The shared identity
direction does not require a message broker; product background jobs use their
own BullMQ/Redis queues. Callback authentication, replay protection and failure
recovery must be specified and tested in the integration plan. Product email
remains fixed (ADR-0041); an IdP callback cannot silently change it. Any future
email-change signal requires the dedicated identity-change policy first.

## Implementation and acceptance

The candidate is self-hosted better-auth as an OIDC provider in nsauth, with a
product-side OAuth/SSO integration. Verify plugin availability and pinned-version
behavior in a focused spike before adoption. Prove authorization-code handling,
PKCE, refresh, product consent, linking existing accounts, extension bearer
behavior, revocation and preservation of the NestJS HTTP stack.

Keep `resolveSessionUser` in
`apps/api/src/common/guards/auth.guard.ts`, app-owned onboarding, immutable
local identities and `CollectionPolicyService` independent of provider details.
The raw better-auth handler continues to mount before body parsers. Deployment
uses the [Hashikome platform](infra-deployment.md).

## Service-operator authority

[Service operations](service-operations.md) is implemented independently of
nsauth. The initial admin accepts a startup invitation; admins invite operators;
every recipient explicitly consents and verifies a fresh invitation-bound code.
Grants use immutable local IDs. Account email is fixed; suspension revokes
applicable grants, sessions and pending invitations. Recovery requires a fresh invitation; an IdP
claim never restores authority or grants private-content access.
