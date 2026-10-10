# Document imports and assisted curation

Status: accepted paid AI/DOCX direction (ADR-0028), following [reviewed bulk import](bulk-import.md), not implemented.
The product owner wants to turn years of bookmarks, resource documents and loose
links into collections worth maintaining. The existing CSV and bookmarks APIs do
not extract Google Docs or organize links with AI.

## Inputs and review

DOCX import, including a Google Doc exported as `.docx`, is a paid workflow.
Extract explicit hyperlinks, visible URLs, headings and surrounding text into the
reviewed-import draft. Do not fetch document-linked assets or execute embedded
content. A Google Docs export is an uploaded file, not permission to read a Google
account. Direct connectors, PDF and other document formats are separate decisions.

Bookmarks and CSV imports are free. AI grouping is paid regardless of input format;
DOCX extraction is paid even without AI. A manually prepared CSV remains free to
import, including one prepared using an external tool. Pasted links from a chat can
use the reviewed-import path; whole-chat ingestion is outside this scope.

A draft may combine sources. Preserve each extracted URL's source file and
location, original heading/path and nearby text so the owner can check a proposal.
Parse explicit URLs and hyperlinks deterministically before asking a model to
organize them. Keep uncertain or unsupported input visible with a reason; never
invent a URL for an unlinked label or silently drop an unreadable source. A manual
CSV prepared with an external tool remains a valid route into the same importer.

The optional AI step proposes collection names, section headings, descriptions,
tags and ordering. Existing heading and paragraph context may inform suggestions;
mark generated context for review. Authored section descriptions remain plain text
of at most 500 characters. Per-item notes remain planned and cannot be written to
an unsupported field. Link titles still come from page metadata under ADR-0007.

The preview lets the owner move, rename, split, merge or reject groups; choose
owned destinations; inspect duplicates; and edit context before importing. Each
committed section must contain at least one accepted web link or collection
reference (ADR-0027). Skipped/failed rows must not leave an empty heading. Imported
rows retain their outcome so retrying commits cannot duplicate successful work.
Under the accepted launch direction, new committed collections default to public,
with a private choice shown before commit and checked against the owner’s quota.
Drafts and uploads remain private; an AI proposal cannot grant access or commit
publication itself. Existing destination visibility is preserved. Current private
creation defaults remain implemented until the ADR-0028 rollout.

## Backend contract

Reuse import drafts, canonical URLs, destination ownership checks, resource
validation, audit recording and commit semantics. Require an existing personal
hub before ingestion; a contributor's invitation never authorizes imports.
Clients submit intent and render server capabilities; they do not decide quotas,
entitlements, grant eligibility, publication or final organization validity.

Document parsing and model calls run outside authority transactions in bounded
jobs. The model receives the minimum selected content and has no production
credentials or direct write access. Treat source text and linked-page text as
untrusted data, including instructions embedded in them. Validate structured
output, then apply normal API rules only after the owner's explicit commit.
Reuse guarded metadata fetching; a model does not establish that a link is safe,
accurate or educationally suitable. Label checks by their actual evidence.

A job should report parsing, proposing, ready for review, failed or cancelled;
retry transient failures without charging or committing twice. Define file, link,
source-text and job budgets before enabling uploads. Disclose external processing
before submission; define uploaded-file and provider retention, cancellation and
deletion separately from the existing 30-day draft expiry. Store useful provenance
in the draft, not whole source documents in audit logs.

## Provider evaluation

The friend suggested the [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview/).
It describes a programmable agent loop with tools and permissions. It is an
implementation candidate, not a selected dependency. Compare deterministic
extraction plus a bounded structured model call against an agent only where a
multi-step task warrants it. Evaluate output quality, reproducibility, permission
scope, latency, processing cost and data handling on the same fixtures. No
provider integration, subscription reuse or price is established here.

## Acceptance before implementation

Use consented or synthetic fixtures representing Paul's resource guide: sections,
inline links, duplicate URLs, links outside headings, an unlinked planned topic,
malformed URLs and content that tells an agent to ignore its instructions. Compare
proposals against a manually reviewed URL inventory; report omissions and invented
addresses separately. A user must reach a useful draft and commit only chosen
items, including after cancellation, partial failures and retries.

Commercial boundaries are settled in [monetization](monetization.md). Basic parsing,
free bookmarks/CSV, paid AI grouping and paid DOCX extraction are separate boundaries,
not reasons to bypass the review or access model. See the
[backlog](../backlog/curation-and-paid-services.md) and
[evaluation plan](../exec-plans/active/evaluate-curation-and-paid-services.md).
