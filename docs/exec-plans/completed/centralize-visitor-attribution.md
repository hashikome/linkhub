# Centralize visitor attribution and preserve import tags

This ExecPlan follows `PLANS.md`.

## Purpose / Big Picture

Every visitor-triggered server API call must retain trusted source attribution,
including recovery storage during SSR. Editing an imported row must preserve tags
containing punctuation. Record the lasting transport contract in ADR-0052.

## Progress

- [x] (2026-10-11) Confirmed duplicated header forwarding and comma-splitting corruption.
- [x] (2026-10-11) Centralized attributed transport; all server callers migrated and bypass probe rejected.
- [x] (2026-10-11) Line-separated tags preserve punctuation; browser round trips passed with/without JavaScript.
- [x] (2026-10-11) Browser regressions, responsive screenshots and full isolated verification passed; recorded results.

## Surprises & Discoveries

The web entry point already stamps both read and form proofs for every incoming
request. The omission occurs between feature adapters and the HTTP transport.
Repeated teardown timeouts came from rejected-request sockets; explicitly closing
this HTTP suite's owned sockets before app shutdown resolved them. The first full
gate passed API and 37 web tests, then found a TypeScript union inference error in
the new test fixture; constructing Headers objects directly corrected it.
Persisted tags normalize all whitespace to spaces, so line breaks are an unambiguous
editor separator; commas, semicolons and quotes remain literal tag text.

## Decision Log

Use one server-only transport with mandatory incoming proof headers. Forward both
proof domains; the API still selects the applicable one. Preserve the existing
rate policies and shared PostgreSQL store. No web background caller currently
needs an unattributed transport: future service calls need an explicit reviewed
service policy rather than an optional attribution switch.

## Outcomes & Retrospective

Implementation complete; `bun run verify:isolated` passed, including all API
tests, 37 web tests, production build, typechecks, lint/format, tooling, boundaries
and documentation checks. Four focused browser tests
passed (128 assertions), covering recovery, bookmark import, inline editing/error
retention, pagination and audit pagination. After adjusting field width and disabling
visual line wrapping, the recovery browser test passed again (18 assertions).
Screenshots inspected at 390/768/1280/1440: phone uses stacked cells; the tablet
editor scrolls within the table; desktop keeps tag text readable without wrapping
one tag into apparent separate entries. Existing tokens/typeface retained.
UI review: clarity 4/5, consistency 5/5, responsive behavior 4/5; remaining horizontal
scrolling at tablet size is intentional for the inline table, not document overflow.
Pure tag/source tests: four passed / 16 assertions. Recovery HTTP tests: two passed,
including exhausted-A/working-B isolation. No schema or data changes.

## Context And Orientation

`apps/web/server.ts` establishes trusted source headers. `server-api.ts`,
`form-server.ts`, `import-forms.ts` and `action-recovery.ts` call the API.
`request-budget.ts` verifies proofs and applies atomic budgets. `import-review.tsx`
and `import-forms.ts` serialize edited tag lists.

## Plan Of Work

Introduce an attributed transport, migrate all server callers, and extend the web
boundary check. Test missing context and cross-visitor isolation with real recovery
requests. Replace the tag input with a labelled textarea and line serialization.
Retain the quiet visual register and existing Schibsted Grotesk/tokens; follow
Refactoring UI layout/spacing and taste-layer copy guidance for the inline field.

## Concrete Steps

Run `bun run check:web`, focused web/API tests, then `bun run verify:isolated`.
Run isolated browser recovery and tag round-trip checks sequentially after the gate.

## Validation And Acceptance

Visitor A exhausting recovery requests must not block visitor B; forged proofs
must not select another visitor. Missing context must fail before API transport.
Address-only edits and sign-in recovery preserve punctuation-bearing tags, with
and without JavaScript. Inspect the inline editor at 390/768/1280/1440 widths.

## Idempotence And Recovery

No schema migration or data rewrite. Existing receipts and encrypted recovery
payloads stay compatible; only new form submissions use line-separated tags.

## Artifacts And Notes

Logs: `/tmp/attribution-focused4.log`, `/tmp/attribution-browser.log`,
`/tmp/attribution-browser2.log`, final gate `/tmp/attribution-verify2.log`.
Screenshots: `/tmp/import-tag-editor-{390,768,1280,1440}.png`.
Changes remain uncommitted.

## Interfaces And Dependencies

The low-level HTTP transport retains timeout, cookie and response handling.
Only the server transport may issue server API requests. Authentication and
source attribution remain separate; neither source proof grants data access.
