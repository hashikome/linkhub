# Match code emails to verification purpose

## Purpose / Big Picture

Code emails should explain the same task as the verification screens: sign-in,
first-link capture, continuing, session recovery, fresh confirmation or invitation
acceptance. Existing two-step email-change messages stay distinct.

## Progress

- [x] Trace lost purpose between web forms, auth delivery and email templates.
- [x] Share the purpose vocabulary and select validated purpose-specific copy.
- [x] Test rendering, persisted delivery, resend context and browser flows.
- [x] Record verification results and complete the plan.

## Surprises & Discoveries

Invitation codes are cryptographically bound to invitations but use the library's
sign-in callback; their email wording must be selected from the workflow context.

## Decision Log

- 2026-10-09: Purpose selects fixed email wording only; it never changes proof
  validity or grants access. Invitation purpose comes from its backend workflow.
  Web resends retain the sealed flow's purpose. No user-supplied free text goes
  into templates.

## Outcomes & Retrospective

Implementation complete. The full verification gate passes; all 47 browser tests pass (613 assertions). Mobile previews for first-link, confirmation and invitation codes were
rendered and visually inspected.

## Context And Orientation

Web form actions call delivery-auth; its callback writes a rendered encrypted
email to the outbox. packages/email owns HTML, text, subjects and previews.
The shared contract lives in packages/types/src/auth.ts.

## Plan Of Work

Move purpose types into shared contracts; pass purpose before sending; render
fixed copy for each context. Keep default sign-in for ordinary API callers,
existing challenge namespaces, expiry, budgets and invitation binding.

## Concrete Steps

Run bun install, bun run verify, and browser verification in an isolated checkout.
Inspect representative rendered emails and persisted outbox payload assertions.

## Validation And Acceptance

All six purposes have accurate subjects, previews and HTML/text wording.
Every code email retains expiry, warning and support; no code enters its subject.
Unknown purposes and invitation purpose through ordinary code/send are rejected.
Resends retain context; actual sign-in, step-up and invitation flows still work.

## Idempotence And Recovery

No schema changes. Only newly enqueued messages use new copy; existing sealed
outbox entries retain their rendered content. Tests use disposable databases.

## Artifacts And Notes

Full gate: /tmp/nslinkhub-email-purpose-verify.log.
Template checks: 7 tests / 194 assertions. API tests cover every ordinary
purpose on issue and resend, unchanged proof verification, invalid values,
default sign-in, and invitation copy from the workflow. Preview artifacts use
synthetic codes: /tmp/code-email-first-link.png, /tmp/code-email-confirm.png,
and /tmp/code-email-invitation.png. Browser log: /tmp/nslinkhub-email-purpose-browser.log. First-link initial and
resend subjects and fresh-confirmation subjects were verified in browser flows.

## Interfaces And Dependencies

SendSignInCodeRequest accepts optional purpose, default sign-in. Presentation
purposes are separate from proof identifiers. Email templates import the shared
purpose type; delivery surfaces never import the email rendering package.
