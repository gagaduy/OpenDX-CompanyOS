<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Marketing & Creative Facebook Publication Design

## Status

Approved through collaborative design on 2026-08-28 and 2026-08-29. This is a
focused post-Commerce design for one department only. It does not approve any
other new department, generic workflow builder, social network, paid ads,
analytics ingestion, Company Memory, or GraphRAG.

## Outcome

An authorized staff member or the governed AI CEO can hand one bounded
Facebook publication task to Marketing. Three distinct Digital Employees
prepare copy, create one raster visual, and assemble a publication package.
A human approver decides the exact immutable package before a backend-owned
Facebook connector may publish it. Completion requires a verified Facebook
post, an authoritative publication record, audit/provenance, and a private
downloadable handoff bundle.

```text
direct staff assignment or AI CEO handoff
  -> validate Marketing scope and immutable campaign brief
  -> Content Strategist creates versioned copy
  -> Visual Designer creates one versioned PNG
  -> Campaign Lead applies deterministic quality rules
  -> human approves exact content/image/Page/schedule digest
  -> durable publisher calls the Facebook adapter exactly once
  -> adapter reads the post back and verifies identity/digests
  -> API generates DOCX, XLSX, PDF and records completion
```

## Digital Employees

| Identity | Responsibility | Explicitly denied |
| --- | --- | --- |
| `marketing_content` | Convert the approved brief and purpose-limited Catalog facts into structured Facebook copy | Image generation, credentials, approval, publication |
| `marketing_visual` | Turn the accepted content direction into one governed raster PNG plus alt text and provenance | Product/price mutation, approval, publication |
| `marketing_publisher` | Build the package, run deterministic quality checks, request approval, and coordinate the connector after approval | Viewing tokens, changing the approved package, self-approval |

Each identity has a separate Keycloak client, model configuration, budget,
policy scope, task memory, audit trail, and revocation state. There is no
shared Marketing credential and no Agent may add permissions or substitute
for another identity.

## Intake Modes

`assignmentMode=direct_department` selects Marketing explicitly and bypasses
AI CEO planning. The backend still validates actor authorization, Department
scope, active configuration, budgets, tools, and approval policy.

`assignmentMode=ai_ceo` retains the existing governed CEO boundary. The AI CEO
may select Marketing only from a policy-eligible Department catalog and then
creates the same immutable Marketing handoff. It cannot rewrite or skip the
Marketing workflow.

Unsupported work fails with `OUT_OF_DEPARTMENT_SCOPE`. Work requiring another
Department is not forwarded automatically; it settles as
`CROSS_DEPARTMENT_COORDINATION_REQUIRED` and the staff operator decides
whether to submit a new CEO-coordinated task.

## Campaign Brief

The version-one brief contains:

- campaign name, objective, product or topic reference, audience, language,
  tone, mandatory message, prohibited claims, call to action, reference IDs,
  Facebook Page configuration ID, requested publication time, deadline,
  approver reference, task budget, and provenance;
- either a current, purpose-specific public Catalog snapshot or explicit
  user-supplied facts; Marketing never invents price, promotion, inventory, or
  availability;
- source classification and immutable digests for every accepted reference.

Missing product/topic, Page, schedule, or approver results in
`WAITING_FOR_INPUT`. Tone or audience may be proposed by the Content
Strategist but remains visible in the package presented for approval.

## Owned Data and Storage

The new API `marketing` module owns campaigns, briefs, content versions,
visual assets, quality reviews, publication packages, publication attempts,
verified publication records, and report artifacts. PostgreSQL is the source
of truth. Private MinIO object storage owns generated PNG/DOCX/XLSX/PDF bytes;
object keys never cross staff API responses.

The Agentic module continues to own Digital Employee configuration, policies,
budgets, approval governance, audit, provenance, and task assignment. The two
modules communicate only through public application ports and stable IDs.
Neither imports the other's repositories or private entities.

Artifacts are immutable and content-addressed. Authorized downloads stream
through the backend. DOCX is an editable working document, XLSX is a structured
publication log, and PDF is the approved final report. None replaces the
authoritative PostgreSQL records.

## Durable Workflow

`MarketingFacebookPublicationWorkflowV1` is a separate versioned Temporal
workflow. Its history contains IDs, versions, digests, status codes, and
idempotency keys only—never prompts, generated bytes, Page tokens, or private
artifact bodies.

```text
submitted -> validating -> content_drafting -> visual_creation
  -> campaign_review -> awaiting_human_approval -> scheduled
  -> publishing -> verifying_publication -> reporting -> completed
```

Safe nonterminal and terminal outcomes include `waiting_for_input`,
`revision_requested`, `quality_escalated`, `blocked_credentials`,
`platform_rejected`, `schedule_missed`, `out_of_scope`,
`cross_department_coordination_required`, `failed`, and `canceled`.

Quality correction is bounded to two rounds. A changed content, image, Page,
or scheduled time creates a new package version and invalidates the previous
approval. Cancellation before a verified publish prevents publication.
Cancellation after publication never deletes or edits the Facebook post; that
requires a separately approved future workflow.

## Model and Image Boundaries

Text generation reuses the governed OpenRouter model lifecycle with a strict
`marketing_content_v1` result schema. Image generation uses a new inward-facing
image port and an OpenRouter Image API adapter. Runtime discovery verifies that
the configured image model outputs raster images and supports the configured
parameters before private context leaves the system. Only PNG is accepted in
version one; decoded bytes, media type, dimensions, size, digest, provider
request digest, cost, and provenance are validated before MinIO storage.

No provider or model name is hard-coded into the Marketing domain. Model pairs,
pricing ceilings, and budgets are human-governed configuration. Raw base64,
prompts, responses, and provider identifiers are excluded from Temporal
history, ordinary logs, and staff reports.

## Social Publishing Port

The application owns a platform-neutral contract:

```ts
export interface SocialPublisher {
  publish(input: ApprovedSocialPublication): Promise<PublishReceipt>;
  verify(input: VerifySocialPublication): Promise<VerifiedPublication>;
}
```

`FacebookPagePublisher` is the only version-one adapter. Platform selection is
resolved in the composition root; the workflow contains no Facebook-specific
branching. Future Instagram or TikTok support requires a separately approved
adapter, validation rules, credentials, tests, and design, but does not change
the workflow contract.

The adapter uses a configured, version-pinned Graph API endpoint and a Page
access token from the API process secret boundary. It records only a secret
reference and credential health, never the token. Page identity is configured
by governance and cannot be selected by an Agent. Publishing is allowed only
after a live approval is revalidated against the exact package digest.

Because Meta does not promise an application-provided idempotency key for Page
publishing, CompanyOS enforces exactly-once intent internally: one immutable
publication claim per package, deterministic attempt keys, recovery lookup,
and read-after-write verification. An ambiguous timeout becomes
`publication_unknown`; the system reconciles the configured Page before any
new attempt. It never blindly repeats a POST.

## Approval and Completion

Publication is a risky public action and always requires a human with the
Marketing publication approval scope. The approver sees the exact copy, image,
alt text, Page, scheduled time, source facts, content/image/package digests,
estimated cost, and policy/configuration versions.

The campaign is complete only when all are true:

```text
approved package digest is current
+ Facebook returned an external post ID
+ read-after-write verification found the post on the configured Page
+ stored publication record matches Page/post/content/image digests
+ DOCX, PNG, XLSX and PDF artifacts are present and digest-verified
+ audit, provenance and settled cost records are complete
= completed
```

The handoff bundle contains `campaign-brief.docx`, `facebook-content.docx`,
`facebook-visual.png`, `facebook-publication-log.xlsx`, and
`marketing-final-report.pdf`. Staff responses expose authorized download
routes, not MinIO keys.

## Console

The existing Digital Workforce intake adds `AI CEO` and `Direct department`
assignment modes. Selecting Marketing opens a focused form for the version-one
brief. Task detail renders the three-person pipeline, immutable versions,
quality feedback, approval package preview, publication status, Post ID/URL,
cost, and artifact downloads. The Approval Inbox renders the complete package
before decision.

Backend authorization remains decisive. A hidden button never substitutes for
an API denial. Desktop, tablet, and mobile preserve the existing dense,
Linear-inspired operational canvas.

## Failure and Recovery

- Expired/missing Page credential: `blocked_credentials`; notify an operator,
  never substitute another Page or token.
- Rate limit: bounded provider-aware retry before the publication claim is
  ambiguous; retain the same attempt key.
- Timeout after request transmission: mark unknown, reconcile by stored
  provider evidence/Page lookup, and require operator intervention if identity
  cannot be proven.
- Platform rejection: store a bounded Meta error class and correlation digest,
  never secret-bearing response bodies.
- Missed schedule: do not publish late; a human selects a new time and approves
  the new package digest.
- Artifact failure after verified publication: keep the publication truthful,
  retry report generation idempotently, and remain `reporting` rather than
  claiming full completion.
- Worker/API restart: Temporal resumes the same versions and idempotency keys
  without duplicate model charges, image objects, approvals, or posts.

## Acceptance

Deterministic tests use fake OpenRouter, image, MinIO, and Facebook boundaries.
PostgreSQL and Temporal lifecycle acceptance proves concurrency, replay, worker
kill/restart, approval invalidation, and artifact recovery. A separate explicit
owner-credential live acceptance publishes one uniquely marked test post to a
configured test Page, verifies it, records redacted evidence, and does not
delete it automatically.

The live test is excluded from default CI. It requires an explicit confirmation,
a Page owned by the operator, an approved Meta app/permissions, and secrets
provided outside source control.

## Non-Goals

- Instagram, TikTok, LinkedIn, Facebook Reels, Stories, video, carousels,
  comments, editing, hiding, or deleting posts.
- Paid ads, ad budgets, boosting, audience upload, or performance analytics.
- Autonomous promotions, prices, legal claims, customer targeting, or product
  mutation.
- Generic workflow building, recurring schedules, Company Memory, or GraphRAG.
- Any other Department implementation.
