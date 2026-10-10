# ADR-0041: Fixed account email and explicit identity actions

Status: accepted (2026-10-10). Supersedes the email-change workflow in the
identity, transactional-email and auth-delivery designs, and the address-update
assumption in ADR-0017. Its rejection of hub transfer remains unchanged.

## Context

An email is recognised by people granting access and issuing invitations. Although
access grants and contributions reference immutable user UUIDs, changing the
recognisable address is a consequential identity operation. The implemented
current/new-inbox verification flow does not settle lost-inbox proof, affected
party notifications, or Google identity continuity.

## Decision

The chosen email stays with the account. Names, bios and other explicitly allowed
profile fields remain editable; user UUID and email never belong in standard
PUT/PATCH updates. Profile PATCH rejects either field atomically. PUT is not a
supported profile operation. Usernames are distinct from immutable user UUIDs
and retain their existing editing rules.

Retire the three `/auth/email-change/*` endpoints. Disable native email-change
and `/auth/update-user` routes; profile edits use the product's validated endpoint.
Google identity must continue to match the existing account email. No operator or
self-service email-change action is introduced. A person may create another
account with a different email; that account does not inherit existing access,
contributions or ownership.

A future email change must be an app-owned, dedicated POST action, analogous to
other explicit domain commands, never a generic profile mutation. Before shipping,
settle identity proof (including lost-inbox cases), review authority, relevant
owner/operator notifications, invitation handling, Google/credential continuity,
session revocation, audit, concurrency and rollback. Preserve the same user UUID;
do not rewrite UUID-based access references or treat an email change as transfer.

## Consequences

The old intent schema, cleanup identifiers and email templates remain for safe
cleanup/history; no migration deletes stored data. Public endpoints cannot start
or consume those intents. The future workflow is backlog, not a promised recovery
service. Regression tests cover rejected identity writes, unchanged profile and
service authority on rejection, and successful allowed profile edits.
