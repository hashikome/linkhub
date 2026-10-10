# ADR-0045: Account timezone preference

Status: Accepted  
Date: 2026-10-10

## Context

Readers want timestamps in a familiar calendar and clock. Device detection is a
useful default, but some people need a consistent timezone across devices or when
travelling. Rendering UTC and replacing it after hydration shows an incorrect
intermediate time for those readers.

## Decision

Store nullable `time_zone` on the database User. Expose it as private `timeZone`
in authenticated GET/PATCH `/api/v1/profile`. Null means Automatic (the current
device's timezone); a non-null value is a backend-validated IANA
name. Public person profiles never expose this preference. It is independent of
identity, authorization, hub ownership and sharing.

Settings offers Automatic and named timezones, using the existing autosave/native
save flow. A saved explicit choice follows the account across sessions and devices.
The web passes the authenticated preference to its shared timestamp context during
server rendering. Exact timestamps, relative-date fallbacks, hover times and audit
calendar filters use that context. Changing the preference does not rewrite any
stored instant; UTC persistence remains authoritative.

Automatic and guests resolve their device timezone in the browser. Exact dates
wait for that resolution rather than flashing UTC. With JavaScript disabled,
Automatic/guests receive explicitly labelled UTC; a saved explicit timezone works
without JavaScript. Ordinary timestamps have no repetitive timezone suffix.

## Consequences

An additive nullable column gives every existing/new account Automatic without a
backfill. IANA names preserve daylight-saving rules; fixed numeric offsets are not
accepted as preference values. Calendar-day filters must account for DST and
fractional offsets, and use the same timezone as the rows they filter.

Automatic cannot supply device-local server rendering on the first request because
the server does not know the device timezone. No extra tracking cookie or inferred
location is introduced. The backend owns preference validation and persistence;
clients own presentation formatting.
