# ADR-0046: Shared transactional authentication completion

Status: Accepted  
Date: 2026-10-10

## Context

Email delivery and the passwordless security hook independently updated completed
sessions and recorded success. The hook excluded email to avoid duplicates, but
ordinary email registration used a different endpoint and missed both audit writers.
Per-route exceptions made a security invariant depend on the entry workflow.

## Decision

One application-owned completion operation stamps session assurance, updates last
login, finishes a bound invitation and records an account-bound successful sign-in.
Every authentication method uses it after credential, account, factor and association
checks, inside the transaction that creates the usable session. A persistence failure
rolls back completion, including account/hub creation and proof consumption when
registration is involved. Responses and session cookies leave the boundary only
after commit.

Better Auth owns verification primitives and session creation. Its lifecycle hooks
adapt to app-owned username/optional-hub onboarding; provider endpoints do not
reimplement that policy. The application continues to own creation consent,
same-email association, account eligibility and invitation authority. The signup
and security policies of ADR-0035 and ADR-0044 remain unchanged.

Code delivery, rejected proof, account recovery, lifecycle confirmation and
credential management have their own evidence. They are not completed sign-ins.
Enrollment can rotate a session without updating last login or recording sign-in;
its original assurance is preserved by the management transaction. Pending factors
and staged creation consent do not produce authentication-success events.

## Consequences

All completed methods emit `security.sign_in.<method>` with immutable actor and
target user IDs. The old email-only success writer and duplicate session stamping
are removed. No compatibility writer, route alias or historical-event translation
is introduced during development. Integration tests cover exactly-once recording,
replay, pending workflows and rollback on audit failure.

See [passwordless security](../design-docs/passwordless-security.md) and
[auth delivery](../design-docs/auth-delivery-integration.md) for the current contract.
