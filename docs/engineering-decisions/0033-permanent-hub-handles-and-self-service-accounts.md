# ADR-0033: Permanent hub handles and self-service account lifecycle

Status: **Superseded for hub-handle permanence** by
[ADR-0042](0042-editable-hub-handles.md) (2026-10-10). Account lifecycle and
historical spelling reservations remain accepted. [ADR-0043](0043-deliberate-hub-handle-changes.md)
sets the current 30-day cadence and forbids retired-spelling reuse by anyone.
Recovery presentation is refined
by [ADR-0040](0040-contextual-account-recovery.md).

The decision below records the original policy; permanent claims, their UI/API
fields and the exceptional claim-reset procedure are no longer implemented.
Amends ADR-0002/0018's mutable hub handles and ADR-0023's operator-only lifecycle.
Username rules in ADR-0026 remain unchanged.

## Context

The product owner wants hub identity to remain trustworthy: a popular hub's
address must not later identify someone else. A proposed permanent username rule
was explicitly withdrawn. People may continue changing their usernames freely.
Deactivating an account must not misleadingly mean deleting its data.

## Decision

Generated hub handles are provisional. The owner explicitly confirms one permanent
handle, including choosing to keep the generated spelling. Once claimed, ordinary
profile updates cannot change it. Display names and person usernames remain
editable. Case is normalized to lowercase; hub handles retain their existing
exact-spelling uniqueness (person usernames remain hyphen-insensitive).

Every issued hub handle is recorded in `hub_handle_reservations`, including
provisional handles. Reservations outlive account/hub deletion and cannot be
claimed by another hub. The table retains only the handle, immutable hub ID and
reservation timestamps, no email or profile data. Database triggers reserve
handles atomically on creation/change and reject changes to a claimed handle.
Onboarding and availability consult the same reservation store. There is no alias
redirect from an abandoned spelling. Existing development hubs have no reliable
claim history; their current handles are reserved and receive one explicit choice.

Self-deactivation is indefinite and reversible. It hides the profile and owned
collections, including from collaborators, and revokes sessions, service grants,
pending invitations and auth proofs. Data and collection sharing settings remain.
Self-reactivation restores content availability, never revoked sessions/grants.
Normal sign-in does not implicitly reactivate accounts.

Self-deletion is a separate command, confirmed by email code, with the existing
14-day grace period. Access stops immediately. Cancellation before the deadline
keeps data and leaves the account inactive; reactivation is another explicit action.
Final cleanup uses existing cascades and anonymization, preserving handle reservations.
Export and transfer advice precedes deletion; automatic whole-account export remains
future work. Administrators must relinquish their service role through existing
administration before self-deactivation/deletion.

An explicit `self_deactivated` marker distinguishes recoverable owner choices
from operator restrictions. Operator lifecycle changes clear it and invalidate
pending recovery through the operations version. Self-service cannot unsuspend
accounts, cancel operator-scheduled deletion, or cross the deletion deadline.

Web confirmations also bind the rendered form to its sealed flow ID and action;
a newer flow in another tab cannot silently replace the confirmed action.

All account codes use better-auth proof primitives, isolated from ordinary sign-in
and invitations, bound to action/account/version and the initiating session for
active-account actions. Wrong-code attempts commit. Successful verification and
mutation share one transaction and authority lock. Any temporary session created
by verification is revoked and never returned; recovery ends with fresh sign-in.

## Recovery and consequences

No user or operator endpoint resets a claimed handle. Exceptional correction is
a reviewed deployment operation after verifying the owner's request: under the
normal authority lock, record a deployment audit event with reason and hub ID,
clear the claim, then assign and claim the approved available spelling in the same
transaction. The database reservation trigger still rejects another hub's handle.
Never delete reservation rows, and never use this process to transfer an identity.

This intentionally supersedes unrestricted handle renaming and releasing a handle
on deletion. Stable UUID-based links and authorization remain unchanged.
