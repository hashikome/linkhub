# ADR-0037: Connect Google within sign-in

Status: accepted (2026-10-10). Amends the first-link UX in
[ADR-0035](0035-passwordless-account-security.md).

Google onboarding and entry presentation are amended by
[ADR-0038](0038-email-owned-google-onboarding.md) and
[ADR-0039](0039-confirmed-google-account-creation.md). The current policy permits
explicitly confirmed new-account creation from verified Google identity without
another inbox code. Existing-account first proof can use email or a registered
passkey. The original decision below explains the earlier restriction; consult
[passwordless security](../design-docs/passwordless-security.md) for the current contract.

## Context

The intended journey is email registration followed by Google sign-in with the
same email. Requiring users of external-email Google accounts to discover
Settings → Security was an implementation mismatch. Google recommends additional
ownership proof for an email it does not host, even when its claim is verified:
see [Google's identity guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
Removing that proof would weaken account linking; moving it into sign-in resolves
the mismatch without doing so.

## Decision

Register with email, then use Google with that same email. Any necessary first-time
verification happens within that flow, and the backend saves the connection
automatically. Users never need a separate Settings step. Email registration
alone does not invent a Google subject: the user's first Google OAuth exchange
establishes it. Google still cannot create product accounts.

Verified authoritative Gmail/Workspace matches continue to link automatically.
For other verified Google emails, after Better Auth validates state and exchanges
the authorization code, the backend holds an encrypted pending association to
the existing verified local account. A ten-minute HttpOnly cookie with a random
secret binds the browser; the record binds user UUID, email, account operations
version and Google subject. No token or subject is returned to the web.

The inline screen displays the known email and uses the existing emailed-code
flow. The backend checks the bound identity before sending/verifying; it saves
the connection through Better Auth's adapter only when authentication completes.
An enrolled factor must pass first. Connection, proof consumption, session and
audit commit together. Existing sessions cannot substitute for that completion.
Invalid/stale proof, account changes, cancellation and OAuth-state replay cannot
connect an account. Subsequent Google sign-ins use the stored provider subject.

Web code owns presentation and native-form transport only. OAuth callbacks,
eligibility, proof storage, factor policy and account linking remain in the API.
Optional explicit linking/disconnection in Security settings remains available.

## Consequences

External-email users may enter one email code during the first Google sign-in;
later Google logins omit that step. Protection already enrolled still applies.
The browser never needs a second Google authorization round-trip to finish the
pending connection. No schema, Google console or deployment-secret change is
needed. Pending data expires and lifecycle/security revocation invalidates it.
Tests must cover native forms, wrong identities, expiry, replay, rollback and MFA.


### Restarting sign-in

Starting ordinary email sign-in (`/code/send`) or standalone passkey sign-in
(`/passkey/generate-authenticate-options`) cancels the browser's pending Google
association in the backend and clears its cookie after commit. Navigating away
from inline linking must not block signing into another account.

Inline Google email issuance/resends explicitly send `googleConnection: true`;
passkey factor continuation sends `continueSignIn: true`. These preserve the
pending association and all existing identity, expiry and factor checks. The
flags express flow intent and grant no identity authority. Verification still
rejects mismatched accounts, and rolled-back cancellation emits no cookie reset.
