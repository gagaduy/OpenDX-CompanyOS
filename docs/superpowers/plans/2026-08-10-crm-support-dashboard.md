<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Operational CRM, Support, and Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add least-privilege Customer 360 and follow-up operations,
staff-created support tickets with continuously measured SLA and private
malware-scanned attachments, and reproducible aggregate commerce reporting.

**Architecture:** Extend the existing Express modular monolith with
feature-first `crm`, `support`, and `reporting` modules. Customer and Order
publish focused operations readers; CRM and Support depend only on those public
ports, while Reporting owns approved read-only PostgreSQL aggregate SQL.
PostgreSQL remains authoritative, MinIO stores private attachment objects, and
ClamAV is reached through an inward-facing scanner port.

**Tech Stack:** Node.js 22+, strict TypeScript, Express 5, React 19, Vite,
React Router 6, Zod 4, PostgreSQL 18, `pg`, `node-pg-migrate`, MinIO, ClamAV
1.5.3, Node `net`/`crypto`, existing Multer and `file-type`, Vitest, Supertest,
Testing Library, Keycloak, Docker Compose, and pnpm 11.

## Global Constraints

- Work directly on `phuong`, which is based on `develop`; do not edit `main`.
- Follow
  `docs/superpowers/specs/2026-08-10-crm-support-dashboard-design.md` exactly.
- Keep NovaCommerce single-company, B2C, single-store, one inventory location,
  physical-goods, and VND-only. Do not add a Company ID to Phase 7 tables.
- Do not add customer self-service support, inbound email/chat, staff profile
  editing, AI segmentation, marketing automation, workflow construction,
  refund, return, shipping-provider, marketplace, multi-warehouse, Redis,
  message broker, search engine, warehouse, or new application service.
- PostgreSQL is the only relational source of truth. Runtime does not switch to
  an in-memory repository by environment.
- CRM and Support consume Customer/Order through public `index.ts` contracts;
  Reporting may execute only documented read-only aggregate SQL across module
  tables.
- Add `crm_operator`, `support_operator`, and `executive_viewer`. Existing
  staff roles gain no Phase 7 access implicitly; Administrator keeps full
  access.
- CRM sees Customer 360, notes, segments, follow-ups, and only CRM-created
  tickets. Support sees necessary contact/order context and the support queue,
  but not notes, segments, or follow-ups. Executive sees aggregate reporting
  only, with no PII.
- Notes and ticket messages are append-only. Staff cannot mutate Customer-owned
  profile or address fields.
- Ticket status is one of `new`, `assigned`, `in_progress`,
  `waiting_customer`, `waiting_internal`, `escalated`, `resolved`, `closed`;
  accept only the transition table in the focused design.
- SLA runs continuously with targets urgent 2h, high 8h, normal 24h, low 72h;
  pause only in `waiting_customer` and count `waiting_internal`.
- Attachment allow-list is JPG, PNG, WebP, PDF, TXT, CSV, DOCX, XLSX; one file
  per request, 25 MB per file, 20 files and 200 MB per ticket.
- Attachments remain private and quarantined until ClamAV reports clean. Scan
  uncertainty fails closed. Retain active-ticket objects and delete 365 days
  after close while preserving a tombstone/audit event.
- Use official
  `clamav/clamav:1.5.3-debian13-slim@sha256:741e6c447241220e0792a901befcaec1d55a755c5097fc9cd88d7fd8be251a5c`
  with a persistent `/var/lib/clamav` volume.
- Dashboard uses integer VND, `Asia/Ho_Chi_Minh`, half-open `[start,end)`
  ranges, default 30 days, maximum 366 days, and `refreshedAt` no older than 60
  seconds. Payment truth comes only from authoritative paid backend state.
- Normal `db:seed:all` must not create customers, CRM work, or tickets. Use an
  isolated Phase 7 acceptance fixture and ownership-scoped cleanup.
- Do not log PII, ticket/message bodies, filenames, object keys, attachment
  bytes, cookies, tokens, or scanner payloads.
- Add directories only with their first source/test file. Keep business logic
  out of routes, controllers, repositories, and React presentational
  components.
- Add the repository's Apache-2.0 SPDX header to every new license-capable
  source, test, script, and documentation file.
- Write the smallest failing behavior test and observe RED before production
  code; then implement GREEN and refactor while tests remain green.
- Update `CHANGELOG.md` under `[Unreleased]` in every implementation commit.

## Stable Phase Contracts

### Reporting authorization

Only `administrator` and `executive_viewer` can call Reporting endpoints or
open `/dashboard`. This is the least-privilege interpretation of the approved
design; no existing role gains Phase 7 access implicitly.

### Migration order

```text
Catalog -> Company Core -> Inventory -> Customer -> Cart
-> Promotion -> Checkout -> Order -> Payment -> CRM -> Support

Support rollback -> CRM -> Payment -> Order -> Checkout -> Promotion
-> Cart -> Customer -> Inventory -> Company Core -> Catalog
```

Reporting uses current read-only aggregate SQL and therefore owns no table or
migration in Phase 7.

### Worker contracts

```ts
export interface TickWorker {
  start(): void;
  stop(): void;
  tick(): Promise<number>;
}

export interface SupportAttachmentScanner {
  scan(content: NodeJS.ReadableStream): Promise<
    | { readonly outcome: "clean" }
    | { readonly outcome: "infected"; readonly signature: string }
  >;
}
```

All workers use bounded PostgreSQL claims with `FOR UPDATE SKIP LOCKED`, have a
single-flight tick, and converge under retry.

## Implementation Checklist

### Task 1: Staff Roles and Public Operations Readers

**Files:**

- Modify: `apps/api/src/shared/auth/staff-principal.ts`
- Modify: `apps/api/src/shared/auth/staff-auth.middleware.test.ts`
- Create: `apps/api/src/modules/customer/application/services/interfaces/customer-operations-reader.ts`
- Create: `apps/api/src/modules/customer/application/services/implementations/customer-operations-reader.ts`
- Create: `apps/api/src/modules/customer/application/services/implementations/customer-operations-reader.test.ts`
- Modify: `apps/api/src/modules/customer/application/repositories/interfaces/customer.repository.ts`
- Modify: `apps/api/src/modules/customer/infrastructure/repositories/implementations/postgresql-customer.repository.ts`
- Modify: `apps/api/src/modules/customer/customer.module.ts`
- Modify: `apps/api/src/modules/customer/index.ts`
- Create: `apps/api/src/modules/order/application/services/interfaces/customer-order-operations-reader.ts`
- Create: `apps/api/src/modules/order/application/services/implementations/customer-order-operations-reader.ts`
- Create: `apps/api/src/modules/order/application/services/implementations/customer-order-operations-reader.test.ts`
- Modify: `apps/api/src/modules/order/order.module.ts`
- Modify: `apps/api/src/modules/order/index.ts`
- Modify: `apps/console/src/features/authentication/api/oidc-manager.ts`
- Modify: `apps/console/src/features/authentication/tests/authentication.test.tsx`
- Modify: `infra/keycloak/realm-export.json`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces:

```ts
export interface CustomerOperationsSummary {
  readonly id: string;
  readonly email: string;
  readonly fullName?: string;
  readonly phoneNumber?: string;
  readonly status: "active" | "disabled";
  readonly createdAt: string;
}
export interface CustomerOperationsDetail extends CustomerOperationsSummary {
  readonly addresses: readonly {
    readonly id: string; readonly recipientName: string;
    readonly phoneNumber: string; readonly addressLine: string;
    readonly ward: string; readonly provinceOrCity: string;
    readonly postalCode?: string; readonly isDefault: boolean;
  }[];
}
export interface CustomerOperationsReader {
  search(query: { readonly search?: string; readonly page: number;
    readonly pageSize: number }): Promise<{ readonly items:
    readonly CustomerOperationsSummary[]; readonly totalItems: number }>;
  get(customerId: string): Promise<CustomerOperationsDetail | undefined>;
  getSupportContext(customerId: string): Promise<Pick<CustomerOperationsSummary,
    "id" | "email" | "fullName" | "phoneNumber"> | undefined>;
}
export interface CustomerOrderOperationsReader {
  listByCustomer(customerId: string, limit: number): Promise<readonly {
    readonly id: string; readonly publicNumber: string; readonly status: string;
    readonly totalVnd: number; readonly createdAt: string;
    readonly paidAt?: string;
  }[]>;
  getOwned(customerId: string, orderId: string): Promise<{
    readonly id: string; readonly publicNumber: string; readonly status: string;
    readonly totalVnd: number; readonly createdAt: string;
  } | undefined>;
}
```

- [ ] **Step 1: Write role and reader RED tests.** Assert exact parsing of the
  three new roles, unknown-role discard, case-insensitive bounded customer
  search, support-context field narrowing, newest-first customer orders, and
  rejection of an order owned by another customer.

```ts
expect(parseStaffPrincipal(tokenWith("crm_operator")).roles)
  .toContain("crm_operator");
expect(await orders.getOwned("customer-a", "order-of-b")).toBeUndefined();
```

- [ ] **Step 2: Run RED.** Run
  `pnpm --filter @opendx/api test -- staff-auth.middleware.test.ts customer-operations-reader.test.ts customer-order-operations-reader.test.ts`
  and the focused Console authentication test. Expected: failures because the
  roles/readers do not exist.
- [ ] **Step 3: Implement the public readers.** Extend only owning repositories,
  compose the readers in Customer/Order modules, return them as `operations`,
  and export their types from public `index.ts` files. Keep CRM/Support imports
  out of these modules.
- [ ] **Step 4: Update Keycloak and Console role parsing.** Add exactly the three
  approved realm roles and typed frontend values; keep unknown roles ignored.
- [ ] **Step 5: Run GREEN and integration regression.** Run the focused tests,
  API typecheck, and Customer/Order PostgreSQL integration suites.
- [ ] **Step 6: Update `[Unreleased]` and commit.** Commit as
  `feat(identity): add phase seven staff readers and roles`.

### Task 2: CRM Schema and Domain Rules

**Files:**

- Create: `apps/api/src/modules/crm/infrastructure/database/migrations/202608100012_create_crm.ts`
- Create: `apps/api/src/modules/crm/infrastructure/database/run-crm-migrations.ts`
- Create: `apps/api/src/modules/crm/infrastructure/database/crm-migration.integration.test.ts`
- Create: `apps/api/src/modules/crm/domain/entities/crm-note.ts`
- Create: `apps/api/src/modules/crm/domain/entities/followup.ts`
- Create: `apps/api/src/modules/crm/domain/services/crm-rules.ts`
- Create: `apps/api/src/modules/crm/domain/services/crm-rules.test.ts`
- Create: `apps/api/src/modules/crm/domain/exceptions/crm-domain.error.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/shared/database/run-migrations.ts`
- Modify: `CHANGELOG.md`

**Interfaces:** Produces `CrmNote`, `Followup`, `CustomerSegment`,
`createNote`, `createCorrection`, `claimFollowup`, and `completeFollowup`.

```ts
export type CustomerSegment = "new_customer" | "first_time_buyer"
  | "repeat_customer" | "high_value" | "inactive_90d";
export interface PaidCustomerFacts {
  readonly paidOrderCount: number;
  readonly lifetimePaidVnd: number;
  readonly latestPaidAt?: string;
}
export function calculateSegments(
  facts: PaidCustomerFacts, now: string,
): readonly CustomerSegment[];
```

- [ ] **Step 1: Write domain RED tests.** Cover zero/one/two paid orders,
  exactly 49,999,999 and 50,000,000 VND, exactly before/at the 90-day boundary,
  immutable correction links, open self-claim, competing claim rejection,
  version mismatch, completion actor/time, and overdue strict-before-now.
- [ ] **Step 2: Run RED.** Run
  `pnpm --filter @opendx/api test -- crm-rules.test.ts`; expect missing CRM
  modules.
- [ ] **Step 3: Implement minimal domain behavior.** Use integer validation and
  ISO instants. Segment output uses the stable order shown in the
  `CustomerSegment` union and may contain both behavioral and value segments.
- [ ] **Step 4: Write migration RED integration test.** Assert `crm_notes`,
  `crm_followups`, and `crm_audit_events`; customer/self foreign keys; note
  body/description bounds; status/version checks; one open-assignee transition;
  indexes on `(customer_id, created_at)`, `(status, due_at)`, and `assignee_id`;
  and absence of `company_id`.
- [ ] **Step 5: Implement migration and lifecycle.** Add CRM after Payment in
  migrate-all and before Payment in rollback-all. Prove migrate, rollback, and
  reapply on `opendx_test`.
- [ ] **Step 6: Run GREEN.** Run domain tests, CRM migration integration, API
  typecheck, and full migration-chain tests.
- [ ] **Step 7: Update `[Unreleased]` and commit.** Commit as
  `feat(crm): add crm schema and domain rules`.

### Task 3: CRM Application, PostgreSQL, and Admin API

**Files:**

- Create: `apps/api/src/modules/crm/application/dtos/crm.dto.ts`
- Create: `apps/api/src/modules/crm/application/mappers/crm.mapper.ts`
- Create: `apps/api/src/modules/crm/application/repositories/interfaces/crm.repository.ts`
- Create: `apps/api/src/modules/crm/application/services/interfaces/crm.service.ts`
- Create: `apps/api/src/modules/crm/application/services/implementations/crm.service.ts`
- Create: `apps/api/src/modules/crm/application/services/implementations/crm.service.test.ts`
- Create: `apps/api/src/modules/crm/application/services/crm-application.error.ts`
- Create: `apps/api/src/modules/crm/infrastructure/repositories/implementations/postgresql-crm.repository.ts`
- Create: `apps/api/src/modules/crm/infrastructure/repositories/implementations/postgresql-crm.repository.integration.test.ts`
- Create: `apps/api/src/modules/crm/presentation/validators/crm.validator.ts`
- Create: `apps/api/src/modules/crm/presentation/controllers/crm.controller.ts`
- Create: `apps/api/src/modules/crm/presentation/routes/crm.routes.ts`
- Create: `apps/api/src/modules/crm/presentation/middleware/crm-error.middleware.ts`
- Create: `apps/api/src/modules/crm/tests/crm.api.integration.test.ts`
- Create: `apps/api/src/modules/crm/crm.module.ts`
- Create: `apps/api/src/modules/crm/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

**Interfaces:** Consumes Task 1 readers. Produces authenticated router mounted
at `/v1/admin/customers` and a `CrmOperationsSummaryReader` for Reporting.

```ts
export interface CrmOperationsSummaryReader {
  countOverdueFollowups(asOf: string): Promise<number>;
}
export interface CrmContext {
  readonly actorId: string;
  readonly roles: readonly ("administrator" | "crm_operator")[];
  readonly correlationId: string;
}
```

- [ ] **Step 1: Write service RED tests.** Assert Customer 360 combines the
  public readers, independently calculates the five segments, keeps customer
  fields read-only, creates immutable notes/corrections, self-claims follow-ups,
  returns `STALE_VERSION`, and emits allowed/denied audit without note text.
- [ ] **Step 2: Run RED.** Run the focused CRM service test; expect missing
  service/repository contracts.
- [ ] **Step 3: Implement application behavior.** Keep DTOs purpose-specific;
  use `runReadOnly` for Customer 360 and one transaction per mutation.
- [ ] **Step 4: Write PostgreSQL RED tests.** Prove stable search pagination,
  newest-first notes, correction ownership, cross-customer follow-up denial,
  two concurrent self-claims yield one winner, optimistic update, safe integer
  parsing, and audit metadata excludes PII.
- [ ] **Step 5: Implement owner-constrained SQL.** Lock follow-up rows for claim
  and use `WHERE id=$1 AND customer_id=$2 AND version=$3` for mutation.
- [ ] **Step 6: Write API RED tests.** Cover every CRM route in the design,
  invalid UUID/range/body, 401, CRM/Admin success, Support/Executive/existing
  role 403, pagination, correction linkage, and stable error mapping.
- [ ] **Step 7: Implement validators/controllers/router/module.** Mount the CRM
  router once in `app.ts`; authenticate before authorization; never expose a
  profile mutation route.
- [ ] **Step 8: Run GREEN and regressions.** Run CRM unit/integration/API tests,
  API typecheck, and existing Customer/Order API tests.
- [ ] **Step 9: Update `[Unreleased]` and commit.** Commit as
  `feat(crm): add customer operations api`.

### Task 4: Support Schema, Workflow, and SLA Domain

**Files:**

- Create: `apps/api/src/modules/support/infrastructure/database/migrations/202608100013_create_support.ts`
- Create: `apps/api/src/modules/support/infrastructure/database/run-support-migrations.ts`
- Create: `apps/api/src/modules/support/infrastructure/database/support-migration.integration.test.ts`
- Create: `apps/api/src/modules/support/domain/entities/support-ticket.ts`
- Create: `apps/api/src/modules/support/domain/entities/ticket-message.ts`
- Create: `apps/api/src/modules/support/domain/entities/support-attachment.ts`
- Create: `apps/api/src/modules/support/domain/services/support-rules.ts`
- Create: `apps/api/src/modules/support/domain/services/support-rules.test.ts`
- Create: `apps/api/src/modules/support/domain/exceptions/support-domain.error.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/shared/database/run-migrations.ts`
- Modify: `CHANGELOG.md`

**Interfaces:** Produces pure transition/SLA/attachment rules used by Tasks 5-7.

```ts
export const SLA_SECONDS = {
  urgent: 7_200, high: 28_800, normal: 86_400, low: 259_200,
} as const;
export function transitionTicket(ticket: SupportTicket,
  target: TicketStatus, actorId: string, now: string): SupportTicket;
export function effectiveSlaConsumedSeconds(ticket: SupportTicket,
  now: string): number;
export function isSlaBreached(ticket: SupportTicket, now: string): boolean;
```

- [ ] **Step 1: Write workflow/SLA RED tests.** Test every allowed transition
  row and representative forbidden reverse/skip transitions; reopen resolved;
  closed terminal; all four exact targets; pause only `waiting_customer`;
  multiple pause accumulation; waiting-internal consumption; boundary equality
  is breached; resolved/closed clock stop; early manual escalation; repeated
  automatic escalation is a no-op.
- [ ] **Step 2: Write attachment rule RED tests.** Cover exact 25 MB, 20-file,
  and 200 MB boundaries; each allow-listed format; rejected macro/executable,
  extension/media/signature mismatch; quarantine/clean/rejected/deleted
  transitions; and 365-day closed retention boundary.
- [ ] **Step 3: Run RED and implement pure domain GREEN.** Run
  `pnpm --filter @opendx/api test -- support-rules.test.ts` before and after
  implementation.
- [ ] **Step 4: Write migration RED test.** Assert tickets, messages, events,
  attachments, and support audit tables; customer/order references; exact enum
  checks; byte/count/version checks; unique object key and event idempotency;
  scanner/retention claim indexes; and no `company_id`.
- [ ] **Step 5: Implement reversible migration.** Add Support after CRM and
  reverse before CRM. Store pause seconds and pause-start explicitly; store
  rejected/deleted attachment tombstones.
- [ ] **Step 6: Run migration lifecycle and API typecheck.** Prove full chain
  up/down/up on PostgreSQL.
- [ ] **Step 7: Update `[Unreleased]` and commit.** Commit as
  `feat(support): add ticket sla and attachment schema`.

### Task 5: Support Ticket Application, PostgreSQL, API, and Escalation

**Files:**

- Create: `apps/api/src/modules/support/application/dtos/support.dto.ts`
- Create: `apps/api/src/modules/support/application/mappers/support.mapper.ts`
- Create: `apps/api/src/modules/support/application/repositories/interfaces/support.repository.ts`
- Create: `apps/api/src/modules/support/application/services/interfaces/support.service.ts`
- Create: `apps/api/src/modules/support/application/services/implementations/support.service.ts`
- Create: `apps/api/src/modules/support/application/services/implementations/support.service.test.ts`
- Create: `apps/api/src/modules/support/application/services/support-application.error.ts`
- Create: `apps/api/src/modules/support/infrastructure/repositories/implementations/postgresql-support.repository.ts`
- Create: `apps/api/src/modules/support/infrastructure/repositories/implementations/postgresql-support.repository.integration.test.ts`
- Create: `apps/api/src/modules/support/infrastructure/workers/support-escalation.worker.ts`
- Create: `apps/api/src/modules/support/infrastructure/workers/support-escalation.worker.test.ts`
- Create: `apps/api/src/modules/support/presentation/validators/support.validator.ts`
- Create: `apps/api/src/modules/support/presentation/controllers/support.controller.ts`
- Create: `apps/api/src/modules/support/presentation/routes/support.routes.ts`
- Create: `apps/api/src/modules/support/presentation/middleware/support-error.middleware.ts`
- Create: `apps/api/src/modules/support/tests/support.api.integration.test.ts`
- Create: `apps/api/src/modules/support/support.module.ts`
- Create: `apps/api/src/modules/support/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

**Interfaces:** Consumes Task 1 Customer/Order readers. Produces support router,
`TickWorker` escalation worker, and aggregate operations reader.

```ts
export interface SupportOperationsSummaryReader {
  summarize(asOf: string, start: string, end: string): Promise<{
    readonly openTickets: number; readonly slaBreaches: number;
  }>;
}
```

- [ ] **Step 1: Write service RED tests.** Cover staff-only create, related
  order ownership, Support queue visibility, CRM creator-only visibility,
  Support self-claim, CRM prohibition from claiming/transitioning, append-only
  messages, transition/version/idempotency, PII-minimized context, and audit.
- [ ] **Step 2: Implement application GREEN.** Keep authorization in service
  context as well as routes. CRM can create/read its own tickets and clean
  attachments later, but cannot browse queue or operate workflow.
- [ ] **Step 3: Write PostgreSQL concurrency RED tests.** Prove two claimers
  yield one assignee; cross-owner CRM read fails; duplicate transition key
  converges; stale version loses; event ordering is `(occurred_at,id)`; two SLA
  workers claim the breach once with `FOR UPDATE SKIP LOCKED`.
- [ ] **Step 4: Implement repository and worker.** Claim at most 100 tickets per
  tick. Use a unique automatic-escalation event key derived from ticket ID and
  effective breach instant; do not hold a transaction across external calls.
- [ ] **Step 5: Write API RED tests.** Cover list/create/detail/claim/patch/message
  routes, all role/ownership combinations, invalid transitions, stale versions,
  validation bounds, and stable error codes.
- [ ] **Step 6: Implement presentation and composition.** Mount at
  `/v1/admin/support/tickets`; start/stop escalation with server lifecycle and
  inject deterministic clock/ID in tests.
- [ ] **Step 7: Run GREEN and regressions.** Run Support unit, PostgreSQL, API,
  staff auth, Customer/Order reader tests, and API typecheck.
- [ ] **Step 8: Update `[Unreleased]` and commit.** Commit as
  `feat(support): add staff ticket operations and sla escalation`.

### Task 6: Private Attachment Storage and ClamAV Scanner

**Files:**

- Create: `apps/api/src/modules/support/application/storage/support-attachment-storage.ts`
- Create: `apps/api/src/modules/support/application/security/support-attachment-scanner.ts`
- Create: `apps/api/src/modules/support/application/services/interfaces/support-attachment.service.ts`
- Create: `apps/api/src/modules/support/application/services/implementations/support-attachment.service.ts`
- Create: `apps/api/src/modules/support/application/services/implementations/support-attachment.service.test.ts`
- Create: `apps/api/src/modules/support/infrastructure/storage/minio-support-attachment.storage.ts`
- Create: `apps/api/src/modules/support/infrastructure/storage/minio-support-attachment.storage.integration.test.ts`
- Create: `apps/api/src/modules/support/infrastructure/security/clamd-support-attachment.scanner.ts`
- Create: `apps/api/src/modules/support/infrastructure/security/clamd-support-attachment.scanner.test.ts`
- Create: `apps/api/src/modules/support/infrastructure/workers/support-attachment-scan.worker.ts`
- Create: `apps/api/src/modules/support/infrastructure/workers/support-attachment-scan.worker.test.ts`
- Create: `apps/api/src/modules/support/infrastructure/workers/support-attachment-retention.worker.ts`
- Create: `apps/api/src/modules/support/infrastructure/workers/support-attachment-retention.worker.test.ts`
- Modify: `apps/api/src/modules/support/presentation/controllers/support.controller.ts`
- Modify: `apps/api/src/modules/support/presentation/routes/support.routes.ts`
- Modify: `apps/api/src/modules/support/support.module.ts`
- Modify: `CHANGELOG.md`

**Interfaces:** Consumes the scanner contract in Global Constraints. Storage
uses private object operations only.

```ts
export interface SupportAttachmentStorage {
  put(objectKey: string, content: Buffer, mediaType: string): Promise<void>;
  open(objectKey: string): Promise<NodeJS.ReadableStream>;
  delete(objectKey: string): Promise<void>;
}
```

- [ ] **Step 1: Write service RED tests.** For every allow-listed type, validate
  extension, media type, magic signature/text UTF-8, SHA-256, per-file/count/
  total limit, random UUID object key, quarantine metadata, rollback cleanup,
  CRM creator/Support/Admin download authorization, and clean-only download.
- [ ] **Step 2: Implement upload/download application GREEN.** Use Multer's
  existing one-file memory boundary capped at 25 MB, inspect before MinIO write,
  store no public URL, and map authorized downloads through API streaming.
- [ ] **Step 3: Write clamd protocol RED tests.** Against a local TCP fake,
  assert `zINSTREAM\0`, unsigned 32-bit network-order chunks, zero terminator,
  clean/infected parsing, 30-second timeout, malformed response failure, socket
  closure, and no payload in errors.
- [ ] **Step 4: Implement ClamAV adapter with Node `net`.** Add no npm
  dependency. Reject signatures longer than 200 display characters before
  persistence.
- [ ] **Step 5: Write worker RED tests.** Prove batches of 20, single-flight,
  clean publication, infected object deletion plus rejected tombstone, scanner
  failure retries at 1/5/15 minutes then remains rejected/unavailable, download
  denial throughout, and retention deletion exactly at closed+365d.
- [ ] **Step 6: Implement workers and MinIO integration.** Claim database work
  briefly, release transaction, call external dependency, then finalize with a
  guarded status/version update. Repeated object deletion is success.
- [ ] **Step 7: Extend API tests.** Assert one multipart file, 413/415 mappings,
  spoofed files, EICAR infected fixture, quarantine response, clean authorized
  streaming, content-disposition sanitization, and no public object access.
- [ ] **Step 8: Run GREEN.** Run focused unit tests, PostgreSQL/MinIO integration,
  API tests, typecheck, and `git diff --check`.
- [ ] **Step 9: Update `[Unreleased]` and commit.** Commit as
  `feat(support): add private scanned ticket attachments`.

### Task 7: ClamAV Environment, Docker Lifecycle, and Readiness

**Files:**

- Modify: `apps/api/src/shared/config/environment.ts`
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `.env.example`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/docker/README.md`
- Modify: `docs/dependencies.md`
- Modify: `docs/build-from-source.md`
- Modify: `Makefile`
- Modify: `CHANGELOG.md`

**Interfaces:** Produces validated `clamavHost`, `clamavPort`, scanner timeout,
worker intervals, `support-attachments` bucket configuration, and readiness
dependency status.

- [ ] **Step 1: Write environment RED tests.** Assert host non-empty, port
  1-65535, timeout 1-60 seconds, scan/escalation/retention intervals positive,
  private bucket distinct from product media, and fail-closed production
  requirements.
- [ ] **Step 2: Run RED, implement parser, run GREEN.** Use exact defaults:
  `clamav:3310`, 30-second timeout, 30-second scan/escalation ticks, and one-hour
  retention tick.
- [ ] **Step 3: Add pinned ClamAV service.** Use the exact digest in Global
  Constraints, persistent `opendx_clamav_signatures:/var/lib/clamav`, no host
  port, a `clamd` TCP health check, and API dependency on healthy ClamAV. Add
  idempotent MinIO bootstrap for private `support-attachments`.
- [ ] **Step 4: Extend API readiness.** Probe ClamAV with `zPING\0` and validate
  CRM/Support migration counts and both MinIO buckets without revealing
  credentials.
- [ ] **Step 5: Document operations.** Record initial signature-download time,
  approximately 4 GB recommended memory, update/restart behavior, quarantine
  failure semantics, and contributor commands. Add discoverable Make targets
  only as wrappers over Compose/pnpm.
- [ ] **Step 6: Validate Compose lifecycle.** Run `docker compose config`, then
  fresh `make down && make up`; prove ready scanner, persistent signatures,
  private bucket, and API fail-closed when ClamAV is stopped.
- [ ] **Step 7: Update `[Unreleased]` and commit.** Commit as
  `feat(infra): add clamav attachment scanning lifecycle`.

### Task 8: Reporting Queries and Aggregate API

**Files:**

- Create: `apps/api/src/modules/reporting/application/dtos/reporting.dto.ts`
- Create: `apps/api/src/modules/reporting/application/mappers/reporting.mapper.ts`
- Create: `apps/api/src/modules/reporting/application/repositories/interfaces/reporting.repository.ts`
- Create: `apps/api/src/modules/reporting/application/services/interfaces/reporting.service.ts`
- Create: `apps/api/src/modules/reporting/application/services/implementations/reporting.service.ts`
- Create: `apps/api/src/modules/reporting/application/services/implementations/reporting.service.test.ts`
- Create: `apps/api/src/modules/reporting/application/services/reporting-application.error.ts`
- Create: `apps/api/src/modules/reporting/infrastructure/repositories/implementations/postgresql-reporting.repository.ts`
- Create: `apps/api/src/modules/reporting/infrastructure/repositories/implementations/postgresql-reporting.repository.integration.test.ts`
- Create: `apps/api/src/modules/reporting/presentation/validators/reporting.validator.ts`
- Create: `apps/api/src/modules/reporting/presentation/controllers/reporting.controller.ts`
- Create: `apps/api/src/modules/reporting/presentation/routes/reporting.routes.ts`
- Create: `apps/api/src/modules/reporting/presentation/middleware/reporting-error.middleware.ts`
- Create: `apps/api/src/modules/reporting/tests/reporting.api.integration.test.ts`
- Create: `apps/api/src/modules/reporting/reporting.module.ts`
- Create: `apps/api/src/modules/reporting/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

**Interfaces:** Produces four authenticated aggregate endpoints under
`/v1/admin/reporting`; consumes PostgreSQL read-only session plus CRM/Support
summary readers where ownership makes direct SQL unnecessary.

```ts
export interface ReportingRange {
  readonly start: string; readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
}
export interface ReportingEnvelope<T> {
  readonly data: T; readonly refreshedAt: string;
  readonly range: ReportingRange;
}
```

- [ ] **Step 1: Write date/VND service RED tests.** Cover default previous 30
  local calendar days, max 366 days, start-before-end, DST-independent Vietnam
  boundaries, half-open edges, empty data zeros/empty arrays, safe integers,
  and half-up AOV (`revenue * 2 + count >= divisor` behavior without float).
- [ ] **Step 2: Write independent fixture RED integration tests.** Insert
  deterministic customers/orders/order-lines/payments/inventory/tickets/
  follow-ups on exact boundary instants. Independently assert gross paid
  revenue, paid count, AOV, created-order cohort conversion, payment statuses,
  paid SKU sales, current inventory, customer/repeat/LTV, open tickets, overdue
  follow-ups, and SLA breaches.
- [ ] **Step 3: Implement read-only SQL.** Parameterize every range, use
  `paid_at` for paid facts and `orders.created_at` for conversion cohort, parse
  bigint with safe-integer guards, and never select PII into Reporting DTOs.
- [ ] **Step 4: Write API RED tests.** Prove Admin/Executive 200; CRM, Support,
  and every existing role 403; invalid/oversized ranges 400; four endpoint
  schemas; no customer/ticket identifiers or contact fields; `refreshedAt`
  within 60 seconds.
- [ ] **Step 5: Implement API and composition.** Mount once at
  `/v1/admin/reporting`; use backend `now`, never browser calculation.
- [ ] **Step 6: Add scale query-plan contract.** Generate transaction-scoped
  fixtures representing 100,000 customers and 1,000,000 orders with
  `generate_series`, run `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, assert no
  accidental cross join and each endpoint completes under 5 seconds on the
  documented local PostgreSQL profile, then roll back the fixture transaction.
- [ ] **Step 7: Run GREEN and regressions.** Run all Reporting tests, API
  typecheck, full PostgreSQL integration, and repository audit.
- [ ] **Step 8: Update `[Unreleased]` and commit.** Commit as
  `feat(reporting): add authoritative commerce metrics`.

### Task 9: Customer and CRM Console Workspaces

**Files:**

- Create: `apps/console/src/features/customers/types/customer.types.ts`
- Create: `apps/console/src/features/customers/schemas/customer-api.schema.ts`
- Create: `apps/console/src/features/customers/mappers/customer.mapper.ts`
- Create: `apps/console/src/features/customers/api/customer-api.ts`
- Create: `apps/console/src/features/customers/hooks/use-customers.ts`
- Create: `apps/console/src/features/customers/components/customer-table.tsx`
- Create: `apps/console/src/features/customers/pages/customer-list-page.tsx`
- Create: `apps/console/src/features/customers/tests/customer-list-page.test.tsx`
- Create: `apps/console/src/features/customers/index.ts`
- Create: `apps/console/src/features/crm/types/crm.types.ts`
- Create: `apps/console/src/features/crm/schemas/crm-api.schema.ts`
- Create: `apps/console/src/features/crm/mappers/crm.mapper.ts`
- Create: `apps/console/src/features/crm/api/crm-api.ts`
- Create: `apps/console/src/features/crm/hooks/use-customer-360.ts`
- Create: `apps/console/src/features/crm/components/customer-summary.tsx`
- Create: `apps/console/src/features/crm/components/customer-timeline.tsx`
- Create: `apps/console/src/features/crm/components/followup-panel.tsx`
- Create: `apps/console/src/features/crm/pages/customer-detail-page.tsx`
- Create: `apps/console/src/features/crm/tests/customer-detail-page.test.tsx`
- Create: `apps/console/src/features/crm/index.ts`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:** Consumes CRM APIs only; no Customer Storefront mutation API.

- [ ] **Step 1: Write list-page RED tests.** Assert CRM/Admin route, Support/
  Executive/existing-role denial, URL-backed normalized search/segment/page,
  loading/empty/error/retry states, stable rows, and no edit action.
- [ ] **Step 2: Implement schemas/API/hooks/list UI GREEN.** Parse every response
  with Zod and cancel stale requests. Use compact table layout and existing
  dark tokens.
- [ ] **Step 3: Write detail RED tests.** Assert read-only profile/address,
  paid facts/order history, deterministic segment labels, immutable note plus
  correction link, follow-up queue/self-claim/version recovery, chronological
  timeline, and forbidden/404 states.
- [ ] **Step 4: Implement Customer 360 GREEN.** Keep orchestration in hooks and
  API layer; presentational components receive typed data/callbacks only.
- [ ] **Step 5: Add responsive/accessibility assertions.** At 390/768/1440,
  assert semantic `main`, labels, keyboard focus, no document overflow, reduced
  motion, and long Vietnamese customer data wrapping.
- [ ] **Step 6: Run Console tests/typecheck/build.** Also run auth routing
  regressions.
- [ ] **Step 7: Update `[Unreleased]` and commit.** Commit as
  `feat(console): add customer crm workspace`.

### Task 10: Support Console Workspace

**Files:**

- Create: `apps/console/src/features/support/types/support.types.ts`
- Create: `apps/console/src/features/support/schemas/support-api.schema.ts`
- Create: `apps/console/src/features/support/mappers/support.mapper.ts`
- Create: `apps/console/src/features/support/api/support-api.ts`
- Create: `apps/console/src/features/support/hooks/use-support-tickets.ts`
- Create: `apps/console/src/features/support/hooks/use-support-ticket.ts`
- Create: `apps/console/src/features/support/components/ticket-table.tsx`
- Create: `apps/console/src/features/support/components/ticket-context.tsx`
- Create: `apps/console/src/features/support/components/ticket-timeline.tsx`
- Create: `apps/console/src/features/support/components/attachment-panel.tsx`
- Create: `apps/console/src/features/support/pages/support-page.tsx`
- Create: `apps/console/src/features/support/pages/ticket-detail-page.tsx`
- Create: `apps/console/src/features/support/tests/support-page.test.tsx`
- Create: `apps/console/src/features/support/tests/ticket-detail-page.test.tsx`
- Create: `apps/console/src/features/support/index.ts`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:** Support/Admin use queue and operations; CRM/Admin may create and
view CRM-owned tickets, with role-specific controls derived from backend DTOs.

- [ ] **Step 1: Write queue RED tests.** Assert Support/Admin queue, CRM's own
  ticket list/create boundary, Executive/existing-role denial, URL-backed
  assignment/priority/status/SLA/page filters, loading/empty/error/stale states,
  and self-claim race recovery.
- [ ] **Step 2: Implement queue/create UI GREEN.** Never show a workflow control
  not advertised by the backend response's allowed actions.
- [ ] **Step 3: Write detail RED tests.** Assert minimal customer/order context,
  exact transition controls, append-only messages/events, optimistic version
  recovery, SLA consumed/paused/breached display, manual escalation, and no CRM
  note/segment data.
- [ ] **Step 4: Write attachment RED tests.** Assert one-file upload, allow-list
  copy, size/count/total copy, quarantined progress, clean download, infected/
  scan-failure/deleted tombstones, retry state, and CRM creator-only access.
- [ ] **Step 5: Implement detail/attachment UI GREEN.** Download through an
  authenticated API blob request, revoke browser object URLs after use, and do
  not render MinIO keys/public URLs.
- [ ] **Step 6: Add responsive/accessibility assertions.** Cover 390/768/1440,
  keyboard workflow, focus after mutation/error, status text beyond color, long
  filenames/messages, and no document overflow.
- [ ] **Step 7: Run Console tests/typecheck/build.** Include authentication and
  shell navigation regressions.
- [ ] **Step 8: Update `[Unreleased]` and commit.** Commit as
  `feat(console): add support ticket workspace`.

### Task 11: Executive Dashboard Console

**Files:**

- Create: `apps/console/src/features/dashboard/types/dashboard.types.ts`
- Create: `apps/console/src/features/dashboard/schemas/dashboard-api.schema.ts`
- Create: `apps/console/src/features/dashboard/mappers/dashboard.mapper.ts`
- Create: `apps/console/src/features/dashboard/api/dashboard-api.ts`
- Create: `apps/console/src/features/dashboard/hooks/use-dashboard.ts`
- Create: `apps/console/src/features/dashboard/components/metric-card.tsx`
- Create: `apps/console/src/features/dashboard/components/commerce-summary.tsx`
- Create: `apps/console/src/features/dashboard/components/product-performance.tsx`
- Create: `apps/console/src/features/dashboard/components/operations-summary.tsx`
- Create: `apps/console/src/features/dashboard/pages/dashboard-page.tsx`
- Create: `apps/console/src/features/dashboard/tests/dashboard-page.test.tsx`
- Create: `apps/console/src/features/dashboard/index.ts`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:** Consumes only aggregate Reporting DTOs. Produces `/dashboard`
for Administrator/Executive and makes Dashboard the Executive landing route.

- [ ] **Step 1: Write dashboard RED tests.** Assert Admin/Executive access,
  Executive-only navigation, all other roles forbidden, default 30-day range,
  max-range validation, VND/percentage/empty formatting, `refreshedAt` stale
  warning after 60 seconds, loading/partial-error/retry states, and absence of
  PII/customer drill-down links.
- [ ] **Step 2: Implement schemas/API/hook/page GREEN.** Keep backend values
  authoritative; frontend only formats integer values and date range.
- [ ] **Step 3: Add responsive/accessibility assertions.** Cover 390/768/1440,
  table-to-scroll-region behavior without document overflow, semantic headings,
  keyboard date controls, focus, contrast-safe existing tokens, and reduced
  motion.
- [ ] **Step 4: Run Console tests/typecheck/build.** Run complete Console suite
  because shell landing rules change.
- [ ] **Step 5: Update `[Unreleased]` and commit.** Commit as
  `feat(console): add executive commerce dashboard`.

### Task 12: Phase 7 Acceptance, Documentation, and Exit Gate

**Files:**

- Create: `scripts/dev/crm-support-dashboard-exit-check.mjs`
- Create: `docs/operations/crm-support-dashboard.md`
- Modify: `package.json`
- Modify: `Makefile`
- Modify: `README.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/dependencies.md`
- Modify: `infra/docker/README.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `docs/superpowers/plans/2026-08-04-novacommerce-commerce-platform.md`
- Modify: `docs/superpowers/plans/2026-08-10-crm-support-dashboard.md`
- Modify: `CHANGELOG.md`

**Interfaces:** Produces `pnpm check:crm-support-dashboard` and discoverable
`make check-crm-support-dashboard`; fixture records have a run UUID and cleanup
only that run.

- [x] **Step 1: Write the acceptance runner's failing preflight tests.** Assert
  test database/bucket guards, required healthy services, deterministic clock/
  fixture run ID, no credentials/PII in output, and ownership-scoped cleanup.
- [x] **Step 2: Implement deterministic fixture/setup.** Create threshold
  customers and paid orders, CRM notes/follow-ups, every ticket priority/SLA
  state, a clean attachment, an EICAR rejection, and reporting boundary facts;
  do not call or modify normal seed.
- [x] **Step 3: Exercise the full HTTP/browser chain.** Prove a paid order appears
  consistently in Customer 360, timeline, Support context, and Dashboard;
  prove role denials, self-claim race, automatic SLA escalation exactly once,
  quarantine-to-clean download, infected deletion, and no public MinIO access.
- [x] **Step 4: Prove persistence/lifecycle.** Restart the stack; verify ticket,
  CRM, reporting, attachment metadata, MinIO object, and ClamAV signatures;
  perform custom-format backup/restore; run Support/CRM rollback in reverse and
  migrate forward without touching earlier commerce truth.
- [x] **Step 5: Prove browser quality.** Run Chromium acceptance at 390x844,
  768x1024, and 1440x900 for Customer, Support, and Dashboard; assert no
  horizontal document overflow, keyboard focus, semantic landmarks, and all
  loading/empty/error/forbidden/stale states.
- [x] **Step 6: Run final source and container gates.** Run `pnpm check`, API full
  PostgreSQL/MinIO integration, Console production build, repository audit,
  `git diff --check`, Compose config, fresh `make down && make up`, and the new
  Phase 7 exit command. Record exact counts/evidence in roadmap.
- [x] **Step 7: Conduct independent review.** Review the complete Phase 7 commit
  range for spec compliance and code quality; resolve all Critical/Important
  findings and rerun affected plus full gates.
- [x] **Step 8: Document and close Phase 7.** Record role matrix, API/metric
  definitions, ClamAV operations, retention, backup/restore, failure recovery,
  resource expectations, and troubleshooting. Mark the focused plan and master
  Phase 7 checklist complete only after evidence exists.
- [x] **Step 9: Update `[Unreleased]` and commit.** Commit as
  `docs(crm): complete phase seven acceptance`.

## Completion Rule

Do not mark Phase 7 complete because files exist, unit tests pass, or a browser
screen renders. Completion requires Task 12's source, PostgreSQL/MinIO/ClamAV,
authorization, concurrency, responsive browser, restart, backup/restore,
migration-lifecycle, and independent-review evidence.
