<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Operational CRM, Support, and Dashboard Design

**Date:** 2026-08-10

**Status:** Approved focused design

**Phase:** 7 — Operational CRM, Support, and Dashboard

## 1. Purpose

Phase 7 gives NovaCommerce staff the minimum operational tools needed after a
customer starts buying: a read-only Customer 360 view with internal follow-up
work, a staff-created support ticket workspace, and a business dashboard. The
phase extends the existing single-store B2C platform without turning CompanyOS
into a generic CRM, help-desk platform, data warehouse, or workflow engine.

The backend remains authoritative for customer, order, payment, inventory, and
support state. PostgreSQL is the system of record. MinIO stores ticket
attachments, while ClamAV scans every uploaded object before it can be
downloaded.

## 2. Goals

- Let CRM staff find customers and understand their profile, addresses, order
  history, deterministic segments, internal notes, and follow-ups.
- Let support staff create, assign, investigate, and resolve tickets with a
  complete immutable event history and continuously measured SLA.
- Accept a bounded set of common image, text, and office-document attachments
  without exposing unscanned content.
- Give executives and operators fresh aggregate commerce and service metrics
  without exposing customer-level data to executive viewers.
- Preserve module ownership, least privilege, backend authorization, audit
  provenance, and the repository's existing Clean Architecture boundaries.

## 3. Non-goals

Phase 7 does not add:

- customer self-service support, inbound email, live chat, telephony, or social
  media integration;
- editable customer identity or address data in the staff Console;
- AI segmentation, lead scoring, free-form workflow construction, or campaign
  automation;
- marketplace, multi-store, multi-warehouse, shipping-provider, refund,
  return, or electronic-invoice behavior;
- a separate analytics database, Redis, message broker, search engine, or new
  application service;
- public attachment links or attachment access from the Storefront.

## 4. Roles and Least Privilege

Three staff roles are added to the existing Keycloak and API authorization
model:

| Role | Allowed scope | Explicit exclusions |
| --- | --- | --- |
| `crm_operator` | Customer search and Customer 360; CRM notes, deterministic segments, and follow-ups; tickets created by that CRM operator and their clean attachments | Other agents' ticket attachments, support-only ticket queue, customer profile edits, reporting with individual customer exports |
| `support_operator` | Support queue, owned or available ticket work, necessary customer contact/order context, messages, event history, and all clean ticket attachments | CRM notes, segments, follow-ups, customer profile edits, executive-only reporting |
| `executive_viewer` | Aggregate reporting endpoints and Dashboard | Customer records, tickets, messages, attachments, notes, and any other PII |

Administrators retain full operational access. Existing operational roles keep
their current permissions and gain no Phase 7 access implicitly. Every API
endpoint enforces role and resource ownership in the backend; hidden Console
navigation is only a usability aid.

Support receives only the customer fields needed to identify and contact the
requester and relate an order. CRM may see profile, addresses, orders, notes,
segments, and follow-ups. Reporting DTOs never include customer identifiers,
names, email addresses, phone numbers, postal addresses, ticket messages, or
attachment metadata.

## 5. Module Boundaries

Phase 7 adds three independent API modules inside the existing API application:

### 5.1 CRM

The `crm` module owns Customer 360 orchestration, immutable CRM notes,
deterministic segment evaluation, and follow-ups. It does not copy or mutate
Customer, Order, or Payment truth. It consumes focused public reader ports
exported by the owning modules.

### 5.2 Support

The `support` module owns tickets, assignment, status transitions, messages,
attachment metadata, SLA clocks, escalation, and ticket event history. It
references customers and orders by their public identifiers but does not own
their lifecycle.

### 5.3 Reporting

The `reporting` module owns purpose-specific dashboard query services and
read-model DTOs. It may use documented, read-only PostgreSQL aggregate queries
across approved commerce tables because those queries have an active reporting
responsibility. It must not mutate another module's tables or import another
module's private code.

No module may reach into another module's private repository. Cross-module
reads use public reader contracts, except for the explicitly approved
read-only reporting aggregates. Routes and controllers validate input and map
results; business rules remain in application/domain services; PostgreSQL,
MinIO, and ClamAV implementations remain in infrastructure.

## 6. CRM Model and Behavior

### 6.1 Customer 360

Customer search supports bounded pagination and normalized lookup by customer
name, email, phone, or customer ID. Customer 360 composes:

- customer-owned profile and addresses as read-only data;
- order summary and order history from Order;
- paid-order statistics from Payment/Order truth;
- deterministic segment membership;
- immutable CRM notes;
- open and recent follow-ups.

Staff cannot edit the customer's core profile or addresses. Customers retain
ownership of those fields through existing Storefront flows.

### 6.2 Notes

CRM notes are append-only. Each note records its author, creation time, text,
and optional `correctsNoteId`. A correction creates a new note linked to the
original; neither the original content nor author is overwritten. Deletion is
not exposed.

### 6.3 Deterministic Segments

Membership is calculated from authoritative paid-order history:

| Segment | Rule |
| --- | --- |
| `new_customer` | No paid order |
| `first_time_buyer` | Exactly one paid order |
| `repeat_customer` | At least two paid orders |
| `high_value` | Lifetime paid total is at least 50,000,000 VND |
| `inactive_90d` | Has bought before and has no newly paid order in the previous 90 days |

Membership is not manually editable and is not inferred by AI. Segment
responses include the calculation timestamp so staff can judge freshness.

### 6.4 Follow-ups

A follow-up belongs to one customer and contains a due time, short description,
status, version, creator, and optional assignee. Work begins in an unassigned
queue and an eligible CRM operator self-claims it. Supported status is `open`
or `completed`; completing a follow-up records actor and time. Optimistic
versions prevent silent concurrent overwrite. Overdue means an open follow-up
whose due time is before the current server time.

## 7. Support Model and Behavior

### 7.1 Ticket Creation and Assignment

Tickets are created by staff in the Console. Each ticket has a customer,
optional related order, subject, description, priority, status, version,
creator, optional assignee, SLA state, and timestamps. The related order must
belong to the selected customer.

New work enters an unassigned queue. Eligible support staff self-claim a ticket;
administrators may reassign when operationally necessary. Assignment and
reassignment are recorded in the ticket history. Keycloak user administration
is not used as a ticket-routing system.

### 7.2 Workflow

The ticket statuses are:

- `new`
- `assigned`
- `in_progress`
- `waiting_customer`
- `waiting_internal`
- `escalated`
- `resolved`
- `closed`

The domain accepts only these transitions:

| From | Allowed next status |
| --- | --- |
| `new` | `assigned`, `escalated` |
| `assigned` | `in_progress`, `escalated` |
| `in_progress` | `waiting_customer`, `waiting_internal`, `escalated`, `resolved` |
| `waiting_customer` | `in_progress`, `escalated`, `resolved` |
| `waiting_internal` | `in_progress`, `escalated`, `resolved` |
| `escalated` | `in_progress`, `waiting_customer`, `waiting_internal`, `resolved` |
| `resolved` | `in_progress`, `closed` |
| `closed` | None |

Claiming a `new` ticket moves it to `assigned`. Claiming an already escalated,
unassigned ticket assigns it without erasing the escalated status. A resolved
ticket may be reopened to `in_progress` when further staff work is required.
Closing is the terminal confirmation after resolution; closed tickets are
immutable except for retention processing. Every accepted transition records
actor, source and time in an append-only event history.

Messages are append-only staff messages. Phase 7 has no customer message
ingress, so adding a message does not pretend that a customer replied or prove
resolution.

### 7.3 SLA

SLA is continuous 24 hours a day, seven days a week:

| Priority | Resolution target |
| --- | --- |
| `urgent` | 2 hours |
| `high` | 8 hours |
| `normal` | 24 hours |
| `low` | 72 hours |

The clock starts when the ticket is created. It pauses only while the ticket is
in `waiting_customer`; `waiting_internal` continues to consume SLA. Pause
intervals are persisted and accumulated, so restarts do not change the due
time. Resolved and closed tickets stop the active clock while preserving the
final SLA result.

An operator may escalate early. A bounded backend worker automatically
escalates an unresolved ticket when its effective due time is breached. The
worker uses PostgreSQL locking and an idempotent event key so racing workers
produce one escalation transition and one audit event. Automatic and manual
escalation are distinguishable in history.

### 7.4 Attachments

Allowed formats are JPG, PNG, WebP, PDF, TXT, CSV, DOCX, and XLSX. Limits are:

- at most 25 MB per file;
- at most 20 files per ticket;
- at most 200 MB total retained attachment bytes per ticket;
- exactly one file per upload request.

Extension, declared media type, byte signature, and text encoding are checked.
The server writes a UUID object key in a private MinIO bucket and never derives
the key from the submitted filename. Original filenames are stored only as
bounded display metadata.

Every new object is `quarantined`. The `SupportAttachmentScanner` port streams
the object to a ClamAV infrastructure adapter. A clean result atomically marks
the metadata `clean`; only clean objects can be downloaded. An infected object
is deleted and leaves rejected/tombstone metadata plus audit evidence. Scanner
errors retry a bounded number of times and remain unavailable; exhausted or
unavailable scanning fails closed. Transactions are not held open while
calling MinIO or ClamAV.

Support operators and administrators may download clean attachments on tickets
they are authorized to view. A CRM operator may download clean attachments
only on a ticket that operator created. There are no public URLs, presigned
browser URLs, or Storefront access.

Objects are retained while a ticket is active and for 365 days after it is
closed. A bounded retention worker deletes the object after the retention date
and keeps a metadata tombstone and audit record. Repeated deletion attempts are
idempotent.

The infrastructure baseline uses the official ClamAV Docker image from the
1.5.3 feature release, pinned to an immutable multi-architecture digest during
implementation. Virus signatures live on a persistent volume and readiness
must not pass until the scanner can accept scans. Contributor documentation
must call out ClamAV's memory and initial signature-update requirements. The
implementation baseline is grounded in the official
[ClamAV Docker documentation](https://docs.clamav.net/manual/Installing/Docker.html)
and [official image repository](https://hub.docker.com/r/clamav/clamav/tags).

## 8. Reporting Semantics

All dashboard monetary values are integer VND. Calendar boundaries use
`Asia/Ho_Chi_Minh` and half-open ranges `[start, end)`. The default range is the
previous 30 days and a request may cover at most 366 days. Every response
includes `refreshedAt`; production freshness must be no worse than 60 seconds.

The approved metrics are:

| Metric | Definition |
| --- | --- |
| Gross paid revenue | Sum of authoritative paid order totals whose `paidAt` is in range |
| Paid orders | Count of orders that became paid in range |
| Average order value | Gross paid revenue divided by paid orders, rounded half-up to whole VND |
| Conversion | Orders currently in paid state divided by all orders created in range, grouped by `order.createdAt` |
| Payment status | Count of payments by current status for orders created in range |
| Product sales | Quantity and paid line revenue by product/SKU for paid orders in range |
| Inventory snapshot | Current on-hand, reserved, available, and sold-out counts at refresh time |
| Customer count | Total registered customers at refresh time |
| Repeat customers | Customers with at least two authoritative paid orders at refresh time |
| Lifetime value | Paid lifetime value distribution and aggregate at refresh time |
| Open tickets | Tickets not resolved or closed at refresh time |
| Overdue follow-ups | Open CRM follow-ups past due at refresh time |
| SLA breaches | Tickets whose effective SLA due time was breached in range |

Revenue and product-sales facts are attributed by `paidAt`; conversion is
intentionally a created-order cohort as defined above. Browser redirects and
unverified provider messages never contribute paid facts. Cancelled, expired,
or merely pending orders do not count as paid revenue.

Read queries must be indexed and bounded for the Phase 7 target of 100,000
customers and 1,000,000 orders. A short-lived PostgreSQL-backed read model or
aggregate cache may be refreshed by an idempotent worker to satisfy the
60-second freshness target. Redis or a separate warehouse is not introduced.

## 9. HTTP API

All routes are under authenticated staff `/v1/admin` boundaries.

### 9.1 CRM

- `GET /customers`
- `GET /customers/:customerId`
- `GET /customers/:customerId/notes`
- `POST /customers/:customerId/notes`
- `GET /customers/:customerId/followups`
- `POST /customers/:customerId/followups`
- `PATCH /customers/:customerId/followups/:followupId`
- `GET /segments`
- `GET /segments/:segmentId/customers`

### 9.2 Support

- `GET /support/tickets`
- `POST /support/tickets`
- `GET /support/tickets/:ticketId`
- `POST /support/tickets/:ticketId/claim`
- `PATCH /support/tickets/:ticketId`
- `POST /support/tickets/:ticketId/messages`
- `POST /support/tickets/:ticketId/attachments`
- `GET /support/tickets/:ticketId/attachments/:attachmentId/content`

### 9.3 Reporting

- `GET /reporting/commerce`
- `GET /reporting/products`
- `GET /reporting/customers`
- `GET /reporting/operations`

List endpoints use bounded pagination and stable ordering. Mutations that can
race require an optimistic version or an idempotency key. Public DTOs expose
only fields needed by their screen and role.

Representative stable error codes include `CUSTOMER_NOT_FOUND`,
`ORDER_NOT_OWNED_BY_CUSTOMER`, `INVALID_TICKET_TRANSITION`, `TICKET_NOT_OWNED`,
`STALE_VERSION`, `ATTACHMENT_TYPE_NOT_ALLOWED`, `ATTACHMENT_TOO_LARGE`,
`ATTACHMENT_LIMIT_EXCEEDED`, `ATTACHMENT_QUARANTINED`,
`ATTACHMENT_SCAN_FAILED`, `REPORTING_RANGE_TOO_LARGE`, and `FORBIDDEN`.

## 10. Console Experience

The Console retains its existing dark, Linear-inspired visual language and
adds role-aware navigation for:

- `/customers` — searchable customer table, deterministic segment filters,
  and bounded pagination;
- `/customers/:id` — Customer 360 summary, read-only profile and addresses,
  orders, notes, segments, and follow-ups;
- `/support` — queue filters for assignment, priority, status, SLA risk, and
  breached work;
- `/support/tickets/:id` — context, workflow controls, chronological messages
  and events, and quarantined/clean/rejected attachment states;
- `/dashboard` — aggregate commerce, customer, inventory, and service metrics.

The UI provides explicit loading, empty, forbidden, stale-version, retry,
quarantine, scan-failure, and validation states. It never reports an attachment
as usable until the backend reports `clean`. It never calculates authoritative
segments, SLA, or financial metrics in the browser.

Layouts must remain usable at 390 px, 768 px, and 1440 px, preserve keyboard
focus, semantic landmarks, readable contrast, reduced-motion behavior, and no
document-level horizontal overflow. Executive viewers see only the Dashboard.

## 11. Persistence and Concurrency

New PostgreSQL migrations live with their owning module and have reversible
rollback coverage. Expected data includes CRM notes and follow-ups; support
tickets, messages, events, SLA pauses, and attachments; and any approved
reporting read-model rows. Exact table and index names belong in the Phase 7
implementation plan.

Queue workers claim bounded batches with `FOR UPDATE SKIP LOCKED`. Ticket
claiming, state changes, SLA accounting, automatic escalation, scanner state
changes, and retention transitions use transactions and uniqueness constraints
that make retries converge. External object-store and scanner calls occur
outside database transactions with explicit recoverable intermediate states.

All integer money and byte totals must round-trip safely. Queries reject unsafe
numeric values rather than silently narrowing them in JavaScript.

## 12. Security, Privacy, and Audit

- Validate every identifier, filter, status, filename, media type, byte limit,
  and date range at the HTTP boundary.
- Enforce role, ticket ownership, and attachment ownership again in repository
  queries where practical.
- Do not log customer PII, ticket bodies, original filenames, object keys,
  attachment bytes, session material, or scanner payloads.
- Audit note creation, follow-up ownership and completion, ticket creation and
  assignment, every ticket transition, manual/automatic escalation, attachment
  scan outcome, download authorization, and retention deletion.
- Keep support attachments private in MinIO and stream authorized downloads
  through the API.
- Treat ClamAV unavailability, malformed scanner responses, and unknown scan
  outcomes as unavailable content, never as clean content.

## 13. Seed and Acceptance Data

Normal `db:seed` remains idempotent and does not fabricate operational
customers, tickets, notes, messages, or follow-ups. Phase 7 uses an isolated,
explicit acceptance fixture script that creates deterministic customers,
orders, payments, CRM work, tickets, SLA states, and attachments, then cleans
up only records it owns.

The fixture set must prove boundary conditions such as exactly one and two paid
orders, the 50,000,000 VND high-value threshold, 90-day inactivity, each SLA
priority, paused customer waiting, automatic breach, and reporting date-range
edges.

## 14. Validation and Exit Criteria

Phase 7 is complete only when all of the following pass:

- domain tests for note immutability, segment thresholds, follow-up ownership,
  ticket transition legality, SLA pause math, escalation idempotency, and
  attachment state transitions;
- PostgreSQL integration and concurrency tests for ownership, optimistic
  versions, self-claim races, exactly-once escalation, scanner retries,
  retention, and migration rollback/reapply;
- authorization tests that prove CRM, Support, Executive, existing roles, and
  Administrator cannot cross their approved boundaries;
- malicious-upload tests for spoofed extensions/media types, signatures,
  oversized streams, archive-like office files, infected files, scanner
  failure, duplicate requests, and unauthorized downloads;
- reporting fixture tests for every metric, VND rounding, timezone and
  half-open boundaries, plus query-plan checks at the target data scale;
- Console tests for role-aware routes, workflow recovery, attachment states,
  responsive behavior, accessibility, and no horizontal overflow;
- Docker acceptance proving PostgreSQL, Keycloak, MinIO, ClamAV, API, Console,
  and Storefront readiness, restart persistence, private attachment access,
  worker recovery, backup/restore, and full migration lifecycle;
- repository validation required by `docs/build-from-source.md`, including the
  full source check, production builds, repository audit, and Compose config;
- independent spec-compliance and code-quality review with all Critical and
  Important findings resolved or explicitly approved.

API readiness must include the ability to reach a ready ClamAV service. If the
scanner is unavailable, attachment scanning and download fail closed; health
diagnostics must make the dependency failure visible.

## 15. Delivery Sequence

The later Phase 7 implementation plan should preserve this dependency order:

1. roles, migrations, public read contracts, and domain rules;
2. CRM application and PostgreSQL behavior;
3. Support tickets, workflow, SLA, and workers;
4. private attachment upload, MinIO state machine, and ClamAV integration;
5. reporting semantics and bounded PostgreSQL read models;
6. role-aware Console surfaces;
7. deterministic acceptance fixtures, operations documentation, container
   lifecycle, performance evidence, and final exit gates.

No Phase 8 hardening or hosting work is pulled into this phase unless required
to make an approved Phase 7 capability safe and runnable from source.
