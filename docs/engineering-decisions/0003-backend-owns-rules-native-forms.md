# ADR-0003: The backend owns the rules; native forms work without JavaScript

**Status:** accepted  
**Date:** 2026-10-07

Partially superseded by [ADR-0064](0064-client-navigation-and-interactive-forms.md):
client navigation and asynchronous forms replace mandatory native-first/JS-free
interaction and full-document reloads. Other decisions remain binding.

## Context

The web and the planned browser extension are delivery surfaces. Duplicating
rules in clients drifts; JavaScript-only forms fail on slow or blocked scripts.

## Options considered

- Client-side validation as the authority
- Backend-owned rules with native form posts enhanced by JavaScript

## Decision

The API owns validation, authorization and derived state. Clients are
replaceable delivery surfaces whose checks give early feedback only. Web
journeys are native form posts first, enhanced by JavaScript; the mechanics are
in [ARCHITECTURE.md](../../ARCHITECTURE.md) (Runtime Architecture) and the
[interface system](../design-docs/web-interface-system.md).

## Rationale

- One source of truth for rules; clients stay replaceable.
- Every journey works without JavaScript and is testable both ways.

## Constraints to preserve

- UI hiding is never a security rule.
- Form posts accept only same-origin, URL-encoded bodies.
- Clients never import Prisma or API internals; raw `fetch` lives only in `lib/http.ts`.
- Browser journeys are tested with and without JavaScript.

## Links

- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [web-interface-system.md](../design-docs/web-interface-system.md)

## Clarification: shared request contracts (2026-10-09)

The existing web client consumes exported request types as well as response
shapes and backend-provided capabilities. Constructed payloads use shared input
types; decorated API DTOs implement them. Exact typecheck assertions cover DTO
keys and types, including optional fields, to catch drift such as commentsEnabled
being accepted by the backend but missing from UpdateCollectionRequest.

This shares the wire vocabulary, not business logic. API DTOs/services still own
runtime validation, authorization and transitions. Form state and untrusted
transport input are not wire contracts; keep adaptation explicit and never use a
type assertion to pretend optional share-open metadata has already been validated.
No generated client or shared runtime domain engine is introduced.
