# ADR-0063: Wordmark, footer and account appearance

Status: Accepted
Date: 2026-10-13

Partially superseded by [ADR-0064](0064-client-navigation-and-interactive-forms.md):
client navigation and asynchronous forms replace mandatory native-first/JS-free
interaction and full-document reloads. Other decisions remain binding.

## Context

Mobile review found that the wordmark and footer navigation were undersized,
the footer tagline added clutter, and the header theme control consumed space.
The owner selected a quieter shell with appearance choices in account settings.
This supersedes ADR-0056's footer layout and signed-in About variant, and the
previous header/reader appearance contract in the interface system.

## Decision

- Treat ntumie. as a typographic logo: 24 px on phones, 28 px from 640 px,
  weight 700 and tight tracking. Keep the existing font and color tokens.
- Put one 18 px About ntumie. link on the right of each web footer. On About,
  replace it with Join ntumie. for signed-out visitors; omit it when signed in.
- Remove the web footer tagline. Keep existing homepage, Support and email copy.
  About uses “Good links belong together.” as its hero headline.
- About's curated links reuse the reader's tags, section/item disclosures and
  copy-item controls. Reopen item links at `/about?item=<id>#item-<id>`.
  Like Ada's homepage example, use a self-contained typed collection/resource
  fixture with simulated metadata, fixed dates, and namestarlit as the displayed
  contributor. No real account, hub or collection is required. This supersedes
  ADR-0056's omission of presentation metadata; fixture identities never link to
  API record routes. Keep real Support/portfolio destinations.
- Remove all header theme controls. Signed-out pages always follow the device.
  Signed-in users choose System, Light or Dark under Settings → On this device.
  Save the preference in the existing browser cookie, not an account record.
- Require a valid session and same-origin POST to change appearance. Use a native
  form, selected button state and saved confirmation; JavaScript is optional.
  Ignore legacy reader cookies. Signing out does not overwrite the saved choice.
- Share the 28 px email header wordmark across code and invitation templates.
  In email footers, use a 20 px bold wordmark beside a smaller muted 14 px year.
  Keep the email tagline and plain-text meaning.

## Consequences

The mobile header has fewer controls, and branding has a deliberate hierarchy.
Signed-out visitors cannot override their device theme in ntumie.; account
appearance remains local to the browser. No schema, dependency or live-service
change is needed. Native forms reload the settings document after selection.
