# Show sharing analytics in Manage

## Purpose / Big Picture

Operators and admins can open Analytics immediately before Audit Log in Manage,
then refresh to see share requests and reported opens across the service.

## Progress

- [x] (2026-10-09) Inspected existing analytics API, Manage navigation and visual conventions.
- [x] (2026-10-09) Added the page, navigation, sign-in return and audited operator service aggregates.
- [x] (2026-10-09) Verified permission boundaries, refresh behavior and responsive rendering.

## Surprises & Discoveries

Service analytics initially required admin authority. The user clarified that
operators also need the aggregate view, like Audit Log.

## Decision Log

- 2026-10-09: Show all-time totals and kind/destination tables with a native Refresh
  button and last-loaded time. No polling or unsupported unique-visitor metrics.
- 2026-10-09: Operators and admins may read service aggregates through existing
  cookie authority; individual service entry metadata remains admin-only.

## Outcomes & Retrospective

Completed. Operators and admins can inspect all-time share/open counts in Manage
and manually refresh after trying a link. The API enforces live grants; no private
resource or message access was added. Individual service entries remain admin-only.
Personal analytics, date filters and wider traffic metrics remain separate work.

## Context And Orientation

`SharingService.analytics` implements all aggregates. `OperatorNav` builds
capability-based tabs. `/manage/analytics` will use `operatorRead`, existing
failure presentation and theme tokens. The API remains the permission authority.

## Plan Of Work

Amend the sharing decision and permission, add the navigation/page, preserve
sign-in return routes, and extend HTTP/browser checks for role revocation and
refreshing after actual sharing/opening. Update product/focused docs and changelog.

## Concrete Steps

Run `bun run verify` in the isolated checkout, then focused production browser
journeys. Keep builds away from the live development `.next` directory.

## Validation And Acceptance

Operators/admins see Analytics before Audit Log. Ordinary users and revoked
operators cannot load service aggregates. Copy/open a link, refresh Analytics and
observe changed totals. Empty, mobile, light/dark and no-JavaScript views work.

## Idempotence And Recovery

No migration or dependency change. Reads create only the existing bounded audit
read event, never a share entry or open. Refresh is safe to repeat.

## Artifacts And Notes

- `bun run verify` passed in the isolated checkout, including 9 sharing HTTP
  tests with operator/admin, bearer rejection and revoked-grant coverage.
- Three production browser journeys passed (78 assertions): Manage navigation,
  all four share targets, and operator/admin Analytics. The Analytics journey
  covers empty totals, Copy link, successful opens/reloads, Refresh, no-JavaScript
  admin access, sign-in return preservation and operator revocation.
- Inspected light desktop and dark 390px screenshots. Tables stack on phones,
  tabs wrap, and no horizontal document overflow occurs. All colors reuse the
  verified theme tokens. Native Refresh and the timestamp remain visible.
- No migration, dependency change, commit or deployment required/performed.

## Interfaces And Dependencies

Uses `ShareAnalytics` from shared types and `GET /api/v1/share/analytics?scope=service`.
No Prisma imports in web, resource content, messages or recipient tracking.
