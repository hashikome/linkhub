# Footer follows document content

## Purpose / Big Picture

Keep the footer at the viewport bottom for short content and at the end of long
content. Preserve desktop collection/resource scrolling and make the audit
Load more control visibly separate from its table. Audit rows scroll beneath
fixed filters and column headings; successive pages append until exhausted.

## Progress

- [x] Replace the fixed main scroller with document flow and a minimum-height page.
- [x] Keep the header sticky and desktop panels bounded; use natural flow below 1024px.
- [x] Add standard pagination spacing to Older events and update design docs.
- [x] Add audit Load more with preserved encrypted filters and a bounded desktop scroll region.
- [x] Apply bounded table scrolling to Accounts, Collections, Team and Invitations tables.
- [x] Remove the cancelled /platform rename from the backlog and amend ADR-0014.
- [x] Split service invitations from Team and record the owner Invitations/People direction.
- [x] (2026-10-08) Complete repository verification and all 46 browser tests (580 assertions).

## Surprises & Discoveries

The footer had no sticky positioning; it was pinned by the viewport-height grid
and an independently scrolling main region. Fixing it requires changing that
scroll boundary and removing the client code that resets document scrolling.

## Decision Log

- 2026-10-08 / User: footer at the viewport bottom for short pages, after content
  for long pages. Add space between the audit table and Older events.
- Implementation: document flow, sticky header, bounded desktop collection and
  discovery panels, native narrow-screen scrolling. Reuse continuation spacing.

## Outcomes & Retrospective

Completed. Footer flow, bounded tables, audit append and the separate Invitations tab pass the full verification gate and browser suite. No commit or push requested.

## Context And Orientation

Global layout styles live in `apps/web/src/app/globals.css`. Collection heading
folding and paginated lists own panel behavior. FreshDocument owns navigation
recovery; it must not prevent native document scrolling. The audit page lives
in `apps/web/src/app/ops/audit/page.tsx`.

## Plan Of Work

Update page flow and remove obsolete scrolling assumptions; adjust existing
browser checks and verify both JavaScript and native HTML layouts.

## Concrete Steps

Run Bun/Biome, `bun run verify` and `bun run test:browser` in the isolated scratch
checkout. Check short and long pages at desktop, tablet and mobile widths.

## Validation And Acceptance

Short pages end at the viewport bottom. Long pages reveal the footer only after
scrolling through content, with no overlap. Desktop collections retain bounded
panels; narrow pages scroll normally. Audit pagination has 24px spacing.

## Idempotence And Recovery

No migrations or new dependencies. Test databases are disposable and isolated;
preserve development records and prior uncommitted work.

## Artifacts And Notes

Local screenshots and check scripts are disposable files in `/tmp`.

## Interfaces And Dependencies

No backend wire or persistence changes. Reuse the existing continuation class.
A web-only GET adapter at `/ops/audit/more` uses the existing authorized
operations read, decrypting the search on the server. Native cursor links remain
the no-JavaScript fallback.
