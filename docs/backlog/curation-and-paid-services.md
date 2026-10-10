# Curation and paid services

Status: accepted delivery backlog under ADR-0028; implementation pending.

Source: Paul's conversation with a friend, supplied 10 October 2026. The examples
are his browser bookmarks, a 72-page resource document accumulated since 2022,
community resource documents, and links sent to himself in chat. This is firsthand
problem evidence, not willingness-to-pay validation. Paul subsequently settled the
free/paid boundaries and public creation default in ADR-0028.

## Work to carry forward

| Work | User outcome | Dependency and acceptance |
| --- | --- | --- |
| Reviewed bookmarks and CSV import | Bring an existing library over without copying every link | Existing [bulk import plan](../exec-plans/active/deliver-bulk-import.md); preserve folders, fix failed rows and review destinations before commit |
| Document link extraction | Upload an exported resource document and review its links and headings | [AI curation design](../design-docs/ai-curation.md); paid DOCX extraction, including Google Docs exports; other formats separate; no Google account connector implied |
| Mixed-source AI organization | Put related exports and loose links in one draft; receive proposed collections and sections | Reviewed-import contracts first; provenance, deduplication, user changes, bounded cost and explicit commit |
| Useful returning readership | Keep a guide current and let readers follow updates and ask questions | Implemented discussion plus planned subscriptions and broader notifications; specify update grouping and unsubscribe behavior before claiming every edit sends a notification |
| Paid convenience | Deliver paid AI curation and DOCX import | Keep bookmarks/CSV import free; measure complete successful jobs and actual processing cost before choosing prices |
| Paid private collaboration | Free public collaboration and limited owner-only private storage; paid private collaboration | ADR-0028 supersedes the conflicting ADR-0016 guarantee; invitations and link grants remain backend policy operations; readers and invited contributors do not buy a plan just to participate |
| Link health | Paid unavailable/recovery updates and redirect suggestions for owner approval | [Link-health design](../design-docs/link-health.md), ADR-0029; confirm failures, prevent repeated alerts, validate every redirect hop, version and scope approvals with a required explanation; generic PUT/PATCH cannot change URLs; never rewrite silently |
| Richer Gravatar profile display | Paid users can choose to display more than an avatar | Public avatar integration is implemented; select richer fields, consent, refresh and backend entitlements; never replace local identity with provider data |
| Private capacity | Implement a private-collection allowance and larger paid allowances | Define what is counted, concurrent limit enforcement, transfers, downgrade/grace policy and existing grants before implementation |

## Settled boundaries and remaining details

- Paid link-health monitoring is accepted: unavailable/recovery updates and
  owner-approved redirect changes. Set cadence, monitored-link quotas, confirmation
  thresholds, notification delivery and review retention before implementation.

- Bookmarks/CSV import, unlimited public collections, public links and public
  contributor invitations are free. New collections default to public, with an
  explicit private choice. Private owner-only collections have a free allowance.
- AI curator, DOCX import, private links and private invitations are paid. Both
  viewer and contributor invitations to private collections require the owner's
  entitlement. Invited people do not need paid plans.
- Set numeric private allowances, prices, cadence and processing budgets. Define
  failed/partial-job charging, quota concurrency, transfers and downgrade/grace rules.
- Deliver visibility choice and backend defaults together across capture and import;
  never retroactively publish existing private content. Drafts remain private.
- Prevent public-to-private and transfer flows from retaining free contributor
  access to private collections. Apply the same effective policy at read time.

Owner-only private storage is the more permissive refinement of the conversation's
initial “pay for anything private” idea. Do not implement both as conflicting
rules. The phrase “pay to keep secrets” is brainstorming humor, not product copy.
Keep owner access, export and deletion available when a plan ends; never silently
publish private content or delete excess collections.

## Delivery

[Deliver curation and paid services](../exec-plans/active/evaluate-curation-and-paid-services.md)
sets the sequence and decision gates. [Monetization](../design-docs/monetization.md)
owns the accepted packaging; [PRODUCT.md](../../PRODUCT.md) owns delivery order.
