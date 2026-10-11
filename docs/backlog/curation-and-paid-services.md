# Curation and paid services

Status: accepted delivery backlog under ADR-0028; reviewed imports complete,
paid services and entitlement rollout pending.

Source: Paul's conversation with a friend, supplied 10 October 2026. The examples
are his browser bookmarks, a 72-page resource document accumulated since 2022,
community resource documents, and links sent to himself in chat. This is firsthand
problem evidence, not willingness-to-pay validation. Paul subsequently settled the
free/paid boundaries and public creation default in ADR-0028.

## Work to carry forward

| Work | User outcome | Dependency and acceptance |
| --- | --- | --- |
| Reviewed bookmarks and CSV import | Bring an existing library over without copying every link | Completed [bulk import plan](../exec-plans/completed/deliver-bulk-import.md); preserve folders, fix failed rows and review destinations before commit |
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

## Invitation-based community access

Accepted follow-up direction: [ADR-0049](../engineering-decisions/0049-invitation-based-communities.md).
Join community means owner-invited membership (including approved join requests),
not self-service subscription. Members can view all collections the owner publishes
for community members. It grants no contribution rights. Design invitation lifecycle,
revocation, transfer and subscription migration before implementation. This is separate
from the collection-draft import and published-by-default milestone.

### Community onboarding and resource-library use case

The owner's experience of joining a learning community involved screening in
TikTok chat, instructions and follow-up in WhatsApp, a Google Form, admission to
a group, and a separately shared Google Doc containing beginner resources.
Answers in the moving chat were difficult for new members to find. This motivates
a durable community library with collection discussions and accepted answers.

Accepted direction: a hub can contain distinct, goal-specific communities. Model
community identity, invitation/accepted membership, and explicit community-to-collection
access separately. Membership grants viewer access to the community's collections
and their visible discussion history; contribution stays an explicit collection
grant. Reuse collections rather than copying them, and keep community associations
within the owning hub. A public collection remains publicly readable; community
publication must never accidentally enable public access.

[ADR-0050](../engineering-decisions/0050-community-entities-and-intake-integration.md)
explicitly supersedes ADR-0049's initial hub-wide membership assumption. Paid Curator
owners would create/manage communities; invited members would not need a paid plan.
Community checkout and real-time chat are not committed features. Runtime schema,
policy, and entitlements remain to be designed and implemented.

### Reusable forms service integration

The shared **Intake and applications workspace brief**
(`../workspace/backlog/inquiry-workspace.md`, relative to the repository root)
is the owning product record for hosted forms, API intake, applications/inquiries,
team review, assignment, history, follow-up, and a client-facing view. NSLinkHub is
its first planned integration; the portfolio is another, retaining independent
API/email delivery. The shared backlog at
`../workspace/backlog/README.md` provides one entry point with links to both products. The service remains ready to scope;
no second implementation has started.

The intake service owns configured questions, submissions, and their handling
workflow. NSLinkHub owns communities, invitation acceptance, membership, and
collection authorization. Form submission and approval alone grant nothing.
Bind an approved application to the intended community and verified account through
an authorized invitation workflow; retries must not create duplicate invitations
or memberships. Forms-team operators, applicants using the client view, and
community members must not inherit each other's access.

The client view lets applicants follow permitted progress and requested next steps;
private staff notes and other applicants' records stay inaccessible. Client access
mechanisms, hosted versus integrated presentation, and supported follow-up fields
remain scoping decisions, owned by the shared brief.

### Community access and intake integration task

**Status:** accepted direction; implementation deferred. This is NSLinkHub's owning
backlog task, not a second forms-product implementation plan.

**Target:** NSLinkHub for community identity, membership, invitations, collection
policy and integration. The intake product's repository is not selected; its
shared brief owns service scope. Portfolio changes belong to its repository when
that integration is selected.

**Dependencies:** community schema and audience design; owner entitlement lifecycle;
verified invitation acceptance; trusted intake contract and organization mapping;
client access and data-retention decisions. Write the implementation ExecPlan before
runtime changes. Do not activate this alongside other selected implementation work.

**Changes and acceptance:**

1. Model distinct communities under a hub and explicitly associate its collections.
   Prove one community's membership does not grant access to another or publish
   private content; retain independent direct grants and public access.
2. Support direct invitations and the complete application → owner review →
   invitation → verified acceptance journey. Neither submission nor approval alone
   grants access. Specify request abuse controls and subscription migration.
3. Integrate client-visible progress and follow-up without exposing internal notes,
   team permissions, or other applicants' records. Enforce this in both APIs.
4. Deduplicate retried outcomes and invitations; reconcile failed delivery and
   reject stale/unauthorized outcomes after changed decisions or deleted communities.
5. Verify membership revocation, ownership transfer, invitation/account binding,
   and access to collections and visible discussions through the central policy.
6. Apply paid-owner entitlements without requiring members to pay. Set limits and
   lapse behavior explicitly; never publish private content when a plan ends.

**Evidence:** the documented founder onboarding experience motivates the work;
ADR-0050 records the accepted boundary. No community runtime, intake service, or
integration verification is claimed. Preserve the portfolio delivery acceptance
criteria in the shared brief when selecting its later integration task.
