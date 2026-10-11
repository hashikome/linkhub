# Free public curation and paid convenience

Status: accepted product direction in
[ADR-0028](../engineering-decisions/0028-free-public-curation-paid-private-sharing.md);
public creation defaults and explicit private choices are implemented. Billing,
entitlements and private quotas are not yet implemented. Current development
sharing permissions must not be described as the enforced launch commercial model.

## Free and paid boundaries

| Capability | Intended model |
| --- | --- |
| Public collections | Free, unlimited collection count; public by default for new collections |
| Public links and collaboration | Free public sharing and contributor invitations |
| Owner-only private collections | Free within a private-collection allowance; count still to be set |
| More private collections | Larger paid allowances; counts and pricing still to be set |
| Private access links | Requires the owner's paid private-sharing entitlement |
| Private viewer or contributor invitations | Requires the owner's paid private-sharing entitlement; invitees need no paid plan |
| Bookmarks and CSV import | Free, through reviewed imports; operational file/job limits still apply |
| Richer Gravatar profile display | Planned paid information beyond avatars; fields, consent and entitlements still to be specified |
| AI curator | Paid proposals for collections, sections, tags and context, reviewed before import |
| Link-health monitoring | Paid checks, unavailable/recovery updates and redirects for owner approval; no automatic URL replacement |
| DOCX import | Paid document extraction into a reviewed draft, including Google Docs exported as DOCX |

The goal is to make creating and sharing useful guides easy. Free ordinary imports
help people bring existing libraries over. AI organization and DOCX extraction
charge for additional convenience. Private sharing is paid regardless of whether
the invited person is a viewer or contributor; inviting a contributor cannot be
used to give free access to a private collection.

The owner pays. A participant's paid plan cannot substitute for the owner's
entitlement. Public invitations remain free. Payment changes neither the roles
nor the policy boundary: contributors work inside invited collections, never the
hub, and cannot import or perform owner operations.

DOCX extraction and AI organization are independent paid capabilities. Deterministic
DOCX parsing remains paid, while deterministic bookmarks/CSV import stays free.
Applying AI to a free input is still a paid operation. Direct Google account access,
PDF import and other document formats are separate scope decisions.

Paid [link-health monitoring](link-health.md) adds ongoing maintenance: notify the
owner of unavailable or recovered links and propose redirect updates for approval.
It never silently rewrites saved URLs. Ordinary metadata fetching remains free.

## Creation and visibility

New collections default to public, with an explicit private choice showing the
remaining private allowance. Apply the same backend default consistently to manual
creation, capture-created collections and new import destinations. Show the selected
visibility before the user submits or commits; do not make publication a hidden
side effect. Import drafts and uploaded files are private working data, not public
collections. Existing destination visibility is preserved when adding items.

Do not retroactively publish existing private collections. Implement the new
creation default together with complete visibility choice/feedback in clients,
including first-save and native forms. Owner-only private collections stay useful
without a paid plan within their allowance. Reaching a limit offers a deliberate
choice to upgrade, remove a private collection or publish one; never auto-publish.

## Enforcement and lifecycle

The backend owns entitlement lookup, quota accounting, grant eligibility and read
policy. No client or agent can bypass them. Apply checks to invitation issue and
acceptance, link creation/use/rotation, public-to-private changes and transfers.
An owner must not invite contributors for free while public, then switch to private
and retain unauthorized free private sharing. Concurrent creation/unpublishing must
not oversubscribe a private allowance.

Settle grant suspension/revocation, grace periods and existing recipients on downgrade
before implementation. Every entry point must follow the same effective policy,
including remembered link grants. Preserve owner reading, export and deletion;
never erase excess collections or silently widen access. Transfer checks the new
owner's quota and entitlements atomically without granting contributors hub rights.
Unlimited public collection count does not remove abuse prevention, request budgets,
file-size limits or worker concurrency bounds.

## Commercial details still open

Set private allowance counts, prices, billing cadence, extra capacity, and AI/DOCX
usage budgets, plus monitoring cadence and link-health allowances. Compare recurring private collaboration with credits or one-off
processing purchases. Define successful/partial/failed/cancelled-job charging and
idempotent usage before taking payment. Provider choice and data retention remain
implementation decisions; no revenue forecast or willingness-to-pay result is implied.

“Curator account” remains a working name, not a requirement that only professional
curators may buy these services. Analytics, API credentials and richer
hub presentation remain additional candidates. Aggregate analytics must not track
individual readers; API credentials use normal authorization and budgets. Selling
reader access to a curator's content is separate and uncommitted.

## Delivery references

[ADR-0028](../engineering-decisions/0028-free-public-curation-paid-private-sharing.md)
explicitly supersedes the conflicting parts of ADR-0016 and earlier private creation
defaults. See the [backlog](../backlog/curation-and-paid-services.md),
[delivery plan](../exec-plans/active/evaluate-curation-and-paid-services.md),
[bulk import](bulk-import.md) and [assisted curation](ai-curation.md).

## Public writing boundary

Keep commercial strategy, plan boundaries and pricing mechanics in this product
repository. The notebook origin story and portfolio project page describe Paul's
motivation, capabilities and future possibilities without disclosing paywalls or
commercial rules. Publishing those details requires a separate explicit decision.
