# ADR-0043: Retired handles and a 30-day rename cooldown

Status: accepted (2026-10-10). Supersedes ADR-0042's same-hub reuse and unrestricted
rename cadence. Editable names, stable UUID routes and removal of permanent
claiming remain accepted.

## Decision

A retired handle can never be used again by any hub or account, including its
original owner. Reservations survive deletion. Keeping the current spelling is a
no-op, not reuse: it remains valid and does not extend the cooldown.

A hub may change its handle once every 30 days (720 elapsed hours). This chooses
the conservative end of the requested 14–30-day window. Generated initial handles
can be customized immediately; the first successful rename starts the cooldown.
Hub names, descriptions and allowed person profile fields stay independently
editable. Shared links continue to use immutable IDs.

The backend owns the decision. The database trigger rejects any existing target
reservation and any rename before the cooldown expires, then records the new
reservation and change timestamp atomically. The profile API returns the next
eligible change time only when still cooling down. Clients cannot write either
the timestamp or the derived value. Saving the current handle remains harmless.

Settings states the 30-day limit and permanent retirement before a change. During
cooldown it shows the current handle read-only, the next-change date and a disabled
Save handle button. Other edits remain available, including without JavaScript.

## Migration and validation

Backfill known changes from the latest successful handle audit or, for hubs with
multiple reservations, the latest reservation. A single generated reservation
alone does not prove a manual change. Previously used names remain retired;
no migration rewrites current handles, identities, permissions or content.

Tests cover same/foreign-owner retirement, deletion, just-before/after cooldown,
concurrent changes, no-op timestamps/audit, failed SQL rollback, client timestamp
forgery, stable UUID URLs and JS/no-JS settings. Upgrade tests check history
backfill, initial-handle eligibility and schema parity.
