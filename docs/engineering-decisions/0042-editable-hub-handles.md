# ADR-0042: Editable hub handles with stable hub identity

Status: **Superseded for handle reuse and rename cadence** by
[ADR-0043](0043-deliberate-hub-handle-changes.md) (2026-10-10). Other decisions remain accepted.
The original decision below is retained as history. Supersedes ADR-0033's permanent hub claim and
exceptional-correction mechanism. Its account lifecycle and historical spelling
reservations remain accepted. Restores the mutable-handle direction of ADR-0002.

## Context

A person's hub may begin as an engineering toolkit and change purpose over the
years. Its name and handle should follow that purpose. Stable identity and shared
references already use the immutable hub UUID; permanent claiming unnecessarily
restricts expression without improving those references.

## Decision

Owners may change hub names and handles repeatedly through the validated profile
endpoint. Handles retain existing normalization, format, reserved-word and
uniqueness checks. No permanent claim state or confirmation is needed. Remove
`handleClaimedAt`, `confirmHandle`, claim errors, checkbox/claim UI and the SQL
permanence check. The migration drops obsolete claim metadata and replaces only
the reservation trigger function; IDs, content and grants remain untouched.

Every issued spelling stays reserved to its originating hub, including after
hub deletion. Its owner may return to a prior spelling; another hub cannot take
it. Availability reports the current spelling as current and an own historical
spelling as available. There are no historical-handle aliases. Shared hub links
use `/h/<hubId>` and collection links use `/c/<collectionId>` and survive renames.

Settings always offers an editable Handle field, availability feedback and an
explicit Save handle button. Other profile fields keep autosave. Explicit handle
saving avoids reserving intermediate text while someone types. The same native
form works without JavaScript. Existing account email remains fixed (ADR-0041),
and immutable user/hub UUIDs remain outside generic mutation payloads.

## Verification

API tests cover repeated rename, unchanged UUID routes, own-name reuse, no-op
audit behavior, collision races and cross-hub reservation protection including
after deletion. Migration acceptance upgrades a previously claimed hub and checks
schema parity. Browser checks exercise repeated changes and other hub edits with
and without JavaScript at mobile/desktop widths.

## Form isolation clarification — 2026-10-10

Save handle submits only the handle through a separate native form. Other fields
keep autosave and their no-JavaScript Save changes form. This replaces the shared
form detail above: a draft handle must neither be saved implicitly nor prevent
ordinary edits from saving. Pending handle saves lock that field until its
confirmed value and cooldown arrive, while preserving other drafts.
