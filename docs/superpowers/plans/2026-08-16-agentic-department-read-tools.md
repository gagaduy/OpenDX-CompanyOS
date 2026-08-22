<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agentic Department Read Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase C's 17 versioned, least-privilege, read-only Commerce tools for six Department Agents with bounded authoritative output, idempotency, audit, provenance, and zero-leakage evidence.

**Architecture:** The existing Agentic Tool Registry authorizes and reserves every invocation before dispatching through a fixed adapter map. Module-owned public application readers provide authoritative facts; a separately credentialed Reporting reader accesses only three purpose-specific aggregate views. The API stores bounded safe receipts and exposes one Agent-service-only internal endpoint; AI Runtime, models, browsers, and staff receive no database access.

**Tech Stack:** TypeScript 5, Node.js 22, Express 5, Zod 4, PostgreSQL 18, `node-pg-migrate`, Keycloak service accounts, Vitest, Docker Compose, existing OpenDX logger and metrics.

## Global Constraints

- Implement only Phase C. Do not add OpenRouter calls, model execution, file intake, AI CEO synthesis/memory, Agentic Console pages, Temporal UI, or Commerce mutations.
- Preserve all 17 names, version `1`, inputs, outputs, classifications, scopes, code sets, bounds, and sharing rules from the approved focused spec.
- Reject unknown fields, versions, scopes, classifications, cursors, stale grants, revoked grants, exhausted quota, and over-budget calls before Commerce retrieval.
- Use `Asia/Ho_Chi_Minh`, a maximum 90-day window, evidence limit `1..100` with default `25`, five-minute bound cursors, `statement_timeout = 750ms`, `lock_timeout = 100ms`, at most four statements, and a 256 KiB stored result limit.
- Never return or log customer name, email, phone, address, note body, ticket subject/description/message, provider payload/hash, provider invoice/order/transaction identifier, arbitrary SQL, or relation names.
- `opendx_agentic_reader` can select only the three approved Reporting views and cannot select base tables, mutate relations, create temporary tables, execute arbitrary functions, or receive future default grants.
- Commerce business interpretation remains in the owning public application reader. Agentic imports another module only through its `index.ts`.
- Use existing dependencies only. Any unavoidable new dependency requires a separate reviewed decision and `docs/dependencies.md` update before installation.
- Follow TDD for every behavior change and update `CHANGELOG.md` in each implementation commit.

## File Map

New Agentic files have one responsibility each:

- `application/tools/department-tool-contracts.ts`: framework-neutral names, inputs, envelopes, results, scopes, classifications, and error-safe shared types.
- `application/tools/department-tool-catalog.ts`: immutable version-one descriptor metadata and canonical schema digests.
- `application/services/interfaces/department-tool-adapter.ts`: fixed adapter dispatch port.
- `application/services/implementations/tool-sharing.service.ts`: strips evidence and denies non-shareable output.
- `infrastructure/tools/*-department-tool.adapter.ts`: six thin adapters over public Commerce readers.
- `infrastructure/tools/fixed-department-tool-adapter.registry.ts`: exact name/version dispatch map.
- `presentation/controllers/agentic-tool.controller.ts`: transport-to-application coordination only.
- `presentation/routes/agentic-tool.routes.ts`: Agent-service-authenticated internal route.

Each Commerce module adds one public `*-health-reader.ts` contract and one
PostgreSQL-backed implementation. Reporting additionally owns its three views,
restricted reader, and migration runner. No repository implementation is
exported from a module index.

---

### Task 1: Lock Version-One Contracts, Schema Digests, and Sharing

**Files:**
- Create: `apps/api/src/modules/agentic/application/tools/department-tool-contracts.ts`
- Create: `apps/api/src/modules/agentic/application/tools/department-tool-catalog.ts`
- Create: `apps/api/src/modules/agentic/application/tools/department-tool-catalog.test.ts`
- Create: `apps/api/src/modules/agentic/application/services/interfaces/department-tool-schema-registry.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/tool-sharing.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/tool-sharing.service.test.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/tools/zod-department-tool-schema.registry.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/tools/zod-department-tool-schema.registry.test.ts`
- Modify: `apps/api/src/modules/agentic/index.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `DepartmentToolName`, `DepartmentToolInvocationRequest`, `DepartmentToolResult<TSummary, TEvidence>`, `DepartmentToolDescriptor`, `DEPARTMENT_TOOL_CATALOG`, `findDepartmentToolDescriptor(name, version)`, `DepartmentToolSchemaRegistry`, `ZodDepartmentToolSchemaRegistry`, and `ToolSharingService.toExecutiveSummary(result)`.
- Consumes: existing `AgentKind`, SHA-256 helpers from `node:crypto`, and pinned Zod `4.4.3` in the infrastructure validator only; no Zod or Express types enter application contracts.

- [ ] **Step 1: Write failing catalog tests**

```ts
it("defines 17 unique immutable version-one descriptors", () => {
  expect(DEPARTMENT_TOOL_CATALOG).toHaveLength(17);
  expect(new Set(DEPARTMENT_TOOL_CATALOG.map((tool) => `${tool.name}@${tool.version}`)).size)
    .toBe(17);
  expect(DEPARTMENT_TOOL_CATALOG.every((tool) => tool.version === 1)).toBe(true);
});

it("binds every descriptor to one Agent, scope, classification, and digest", () => {
  for (const tool of DEPARTMENT_TOOL_CATALOG) {
    expect(tool.inputSchemaDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(tool.outputSchemaDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(tool.executionCostMicros).toBe(1);
    expect(tool.maximumAttempts).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run the focused tests and verify the missing-module failure**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/tools/department-tool-catalog.test.ts`

Expected: FAIL because the catalog module does not exist.

- [ ] **Step 3: Implement the exact pure contracts and descriptor catalog**

```ts
export interface DepartmentToolDescriptor {
  readonly name: DepartmentToolName;
  readonly version: 1;
  readonly agentKind: Exclude<AgentKind, "ai_ceo">;
  readonly purpose: "store_health_review";
  readonly dataScope: DepartmentToolScope;
  readonly classification: ToolClassification;
  readonly shareability: "executive_summary" | "department_only";
  readonly inputSchemaDigest: string;
  readonly outputSchemaDigest: string;
  readonly executionCostMicros: 1;
  readonly maximumInvocations: 5 | 10;
  readonly maximumAttempts: 2;
}
```

Define all common metadata and all 17 purpose-specific summary/evidence types
verbatim from the focused spec. Generate digests from canonical checked-in
schema objects, not from TypeScript type names or object insertion order. The
Zod registry implements `parseInput(name, version, value)`,
`parseOutput(name, version, value)`, and `schemaDigests(name, version)`; tests
compare all 34 runtime digests to the immutable descriptor constants.

- [ ] **Step 4: Write sharing tests before the sharing implementation**

```ts
expect(() => sharing.toExecutiveSummary(restrictedDepartmentOnlyResult))
  .toThrowError(expect.objectContaining({ code: "TOOL_SHARING_DENIED" }));
expect(sharing.toExecutiveSummary(catalogResult)).toEqual({
  source: catalogResult.source,
  sourceVersion: 1,
  retrievedAt: catalogResult.retrievedAt,
  window: null,
  freshness: catalogResult.freshness,
  classification: "internal",
  provenanceId: catalogResult.provenanceId,
  summary: catalogResult.summary,
});
expect(JSON.stringify(sharing.toExecutiveSummary(catalogResult))).not.toContain("evidence");
```

- [ ] **Step 5: Implement fail-closed sharing and run tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/tools/department-tool-catalog.test.ts src/modules/agentic/application/services/implementations/tool-sharing.service.test.ts`

Expected: PASS with 17 descriptors and evidence-free executive summaries.

- [ ] **Step 6: Commit the contract unit**

```bash
git add CHANGELOG.md apps/api/src/modules/agentic
git commit -m "feat(agentic): define department tool contracts"
```

### Task 2: Persist Idempotent Tool Invocation Receipts

**Files:**
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608160019_create_department_tool_execution.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `reserveToolInvocation`, `completeToolInvocation`, `failToolInvocation`, `findToolInvocation`, and immutable descriptor fields `execution_cost_micros`, `maximum_attempts`.
- Consumes: Task 1 descriptor names/digests and existing `DatabaseSession` transactions.

- [ ] **Step 1: Extend migration tests with failing receipt and immutability cases**

```ts
await pool.query(`INSERT INTO agentic_tool_invocations
  (id,task_id,agent_kind,tool_name,tool_version,idempotency_key,parameters_digest,status,
   attempt,correlation_id,causation_id,created_at,updated_at)
  VALUES($1,$2,'catalog','catalog.product_completeness',1,'same',$3,'reserved',1,'corr','cause',$4,$4)`,
  [invocationId, taskId, digest, at]);
await expect(pool.query(`INSERT INTO agentic_tool_invocations
  (id,task_id,agent_kind,tool_name,tool_version,idempotency_key,parameters_digest,status,
   attempt,correlation_id,causation_id,created_at,updated_at)
  VALUES($1,$2,'catalog','catalog.product_completeness',1,'same',$3,'reserved',1,'corr-2','cause-2',$4,$4)`,
  [secondInvocationId, taskId, digest, at])).rejects.toThrow(/unique/i);
await expect(pool.query("UPDATE agentic_tools SET execution_cost_micros=2"))
  .rejects.toThrow(/immutable/i);
```

- [ ] **Step 2: Run the migration test and verify the missing-table failure**

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`

Expected: FAIL because `agentic_tool_invocations` and descriptor bounds do not exist.

- [ ] **Step 3: Add the reversible schema**

Create a receipt table with status `reserved|completed|retryable_failed|failed`,
positive attempt/version, 64-hex input/result digests, bounded JSON result,
safe error code, timestamps, unique `(task_id,agent_kind,idempotency_key)`, and
foreign keys to the task, Agent, and tool descriptor. Add immutable descriptor
cost/attempt columns, all 17 descriptor rows, append-only completed receipts,
and rollback that removes only Phase C objects.

- [ ] **Step 4: Add repository lifecycle tests**

```ts
expect(await repository.reserveToolInvocation(session, request)).toEqual({ kind: "reserved", attempt: 1 });
expect(await repository.reserveToolInvocation(session, request)).toEqual({ kind: "in_progress" });
await repository.completeToolInvocation(session, completion);
expect(await repository.reserveToolInvocation(session, request)).toEqual({
  kind: "completed", result: completion.safeResult,
});
```

Also prove retryable compare-and-swap increments exactly once, nonretryable
failure replays, oversized JSON fails before storage, and concurrent reserve
has exactly one winner.

- [ ] **Step 5: Implement repository mapping and run integration tests**

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`

Expected: PASS including up/down/up and concurrency cases.

- [ ] **Step 6: Commit the persistence unit**

```bash
git add CHANGELOG.md apps/api/src/modules/agentic
git commit -m "feat(agentic): persist department tool receipts"
```

### Task 3: Execute Authorized Adapters Through the Tool Registry

**Files:**
- Create: `apps/api/src/modules/agentic/application/services/interfaces/department-tool-adapter.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/tool-registry.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/tool-registry.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/tool-registry.service.test.ts`
- Modify: `apps/api/src/modules/agentic/application/services/agentic-application.error.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `DepartmentToolAdapter.execute(context, parameters)`, `DepartmentToolAdapterRegistry.resolve(name, version)`, and `ToolRegistry.invoke(request)` returning a stored or fresh `DepartmentToolResult`.
- Consumes: Task 1 descriptors/sharing types and Task 2 receipt methods.

- [ ] **Step 1: Replace the Phase A unavailable expectation with failing execution tests**

```ts
const result = await registry.invoke(request);
expect(adapter.execute).toHaveBeenCalledOnce();
expect(result.output.summary).toEqual({ totalProducts: 12 });
expect(repository.completeToolInvocation).toHaveBeenCalledWith(
  expect.anything(), expect.objectContaining({ resultDigest: expect.stringMatching(/^[a-f0-9]{64}$/) }),
);
```

Add cases proving validation/auth runs before adapter resolution, cost comes
from the descriptor rather than the request, completed duplicates do not call
the adapter, output schema/size/freshness fail closed, and audit never receives
parameters or result bodies.

- [ ] **Step 2: Run and verify the former `TOOL_UNAVAILABLE` behavior fails**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/services/implementations/tool-registry.service.test.ts`

Expected: FAIL because `invoke` still always throws `TOOL_UNAVAILABLE`.

- [ ] **Step 3: Refactor into three bounded stages**

```ts
const reservation = await this.reserve(request, descriptor);
if (reservation.kind === "completed") return reservation.result;
const adapter = this.adapters.resolve(descriptor.name, descriptor.version);
try {
  const result = await adapter.execute(context, request.parameters);
  return await this.complete(request, reservation, descriptor, result);
} catch (error) {
  throw await this.fail(request, reservation, normalizeToolError(error));
}
```

Keep database transactions short, hash canonical JSON, validate the exact
output schema before completion, and map only lock/timeout/source failures as
retryable.

- [ ] **Step 4: Run focused service and policy tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/services/implementations/tool-registry.service.test.ts src/modules/agentic/application/services/implementations/policy.service.test.ts`

Expected: PASS; Phase A authorization behavior remains unchanged.

- [ ] **Step 5: Commit the registry unit**

```bash
git add CHANGELOG.md apps/api/src/modules/agentic/application
git commit -m "feat(agentic): execute authorized read tools"
```

### Task 4: Add Catalog Health Public Reads

**Files:**
- Create: `apps/api/src/modules/catalog/application/services/interfaces/catalog-health-reader.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/catalog-health-reader.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/catalog-health-reader.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-catalog-health.repository.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-catalog-health.repository.integration.test.ts`
- Create: `apps/api/src/shared/database/migrations/202608160020_add_catalog_health_indexes.ts`
- Modify: `apps/api/src/modules/catalog/catalog.module.ts`
- Modify: `apps/api/src/modules/catalog/index.ts`
- Modify: `apps/api/src/shared/database/migrations/catalog-migration.integration.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `CatalogHealthReader.productCompleteness(asOf)`, `.publicationReadiness(input)`, and `.merchandisingSummary(asOf)` with exact Task 1 result bodies.
- Consumes: existing Catalog tables and `TransactionRunner`; no Inventory, Order, or Agentic private import.

- [ ] **Step 1: Write failing pure interpretation tests**

Use fixtures covering every readiness code, multiple active variants, expired
and future prices, missing/duplicate primary media, archived records, category
top-25 truncation, stable cursor order, and safe integer totals.

```ts
expect(await reader.productCompleteness(at)).toMatchObject({
  totalProducts: 6,
  withoutCurrentPrice: 1,
  withoutPrimaryMedia: 1,
});
```

- [ ] **Step 2: Run and verify the reader is missing**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/application/services/implementations/catalog-health-reader.test.ts`

Expected: FAIL on the missing reader module.

- [ ] **Step 3: Implement the public application contract and repository**

Use parameterized SQL, `BEGIN READ ONLY`, stable keyset ordering, `limit + 1`,
and owner-side reason-code mapping. Do not return product title, slug,
description, attributes, media keys, or exact per-product price.

- [ ] **Step 4: Add migration and query-plan tests**

Assert the product status/update access path and any proven required partial
price/media indexes with `EXPLAIN (FORMAT JSON)`. Test migration up/down/up.

- [ ] **Step 5: Run Catalog unit and integration tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/application/services/implementations/catalog-health-reader.test.ts`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/shared/database/migrations/catalog-migration.integration.test.ts src/modules/catalog/infrastructure/repositories/implementations/postgresql-catalog-health.repository.integration.test.ts`

Expected: PASS with no forbidden fixture string in any result.

- [ ] **Step 6: Commit the Catalog unit**

```bash
git add CHANGELOG.md apps/api/src/modules/catalog apps/api/src/shared/database/migrations
git commit -m "feat(catalog): expose bounded health reads"
```

### Task 5: Add Restricted Reporting Views and Reader Role

**Files:**
- Create: `apps/api/src/modules/reporting/application/services/interfaces/agentic-analytics-reader.ts`
- Create: `apps/api/src/modules/reporting/infrastructure/database/migrations/202608160021_create_agentic_analytics_views.ts`
- Create: `apps/api/src/modules/reporting/infrastructure/database/run-reporting-migrations.ts`
- Create: `apps/api/src/modules/reporting/infrastructure/database/reporting-migration.integration.test.ts`
- Create: `apps/api/src/modules/reporting/infrastructure/repositories/implementations/postgresql-agentic-analytics.reader.ts`
- Create: `apps/api/src/modules/reporting/infrastructure/repositories/implementations/postgresql-agentic-analytics.reader.integration.test.ts`
- Modify: `apps/api/src/shared/database/run-migrations.ts`
- Modify: `apps/api/src/modules/reporting/index.ts`
- Modify: `apps/api/package.json`
- Modify: `infra/temporal/scripts/prepare-postgres-roles.sh`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `AgenticAnalyticsReader.getVariantSales(window)`, `.getCustomerSegmentSnapshot(asOf)`, and `.getCustomerActivity(window)` using only `opendx_agentic_reader`.
- Consumes: Task 1 window types and a separate `TransactionRunner` created from `AGENTIC_ANALYTICS_DATABASE_URL`.

- [ ] **Step 1: Write failing role and view tests**

```ts
await expect(agenticReader.query("SELECT * FROM reporting_agentic_variant_sales_v1 LIMIT 1"))
  .resolves.toBeDefined();
await expect(agenticReader.query("SELECT * FROM orders LIMIT 1")).rejects.toThrow(/permission denied/i);
await expect(agenticReader.query("UPDATE reporting_agentic_variant_sales_v1 SET paid_quantity=0"))
  .rejects.toThrow();
await expect(agenticReader.query("CREATE TEMP TABLE leak(value text)"))
  .rejects.toThrow();
```

Also deny all other base tables, views, sequences, functions, schema creation,
and future dummy relations; assert `PUBLIC` has no access.

- [ ] **Step 2: Run and verify the views and role are absent**

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/reporting/infrastructure/database/reporting-migration.integration.test.ts`

Expected: FAIL on missing Reporting migrations or role grants.

- [ ] **Step 3: Implement three explicit security-barrier views and migration order**

Create `reporting_agentic_variant_sales_v1` with validated current VND price,
`reporting_agentic_customer_segment_snapshot_v1`, and
`reporting_agentic_customer_activity_daily_v1` with only the approved columns.
Add reversible `db:migrate:reporting` and place it after Support and before
Agentic in migrate-all; reverse that order in rollback-all. The Reporting
migration grants `SELECT` on those exact views to the pre-created reader role.

- [ ] **Step 4: Reconcile the role without granting future access**

Extend the existing role script with required
`POSTGRES_AGENTIC_READER_USER/PASSWORD`, revoke database `TEMP`, revoke schema
`CREATE`, and revoke all relation/function defaults. It must not grant a base
table or wildcard relation privilege. Keep the admin/app/Temporal isolation
assertions.

- [ ] **Step 5: Implement bounded reader queries and explain-plan tests**

Set local transaction timeouts before each query and reject more than four
statements or 256 KiB mapped output. Seed sufficiently large fixtures and
assert time predicates reach indexed order/order-line paths.

- [ ] **Step 6: Run Reporting, role, Compose, and migration tests**

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/reporting/infrastructure/database/reporting-migration.integration.test.ts src/modules/reporting/infrastructure/repositories/implementations/postgresql-agentic-analytics.reader.integration.test.ts`

Run: `node --test scripts/dev/temporal-compose-check.test.mjs scripts/dev/agentic-production-compose-check.test.mjs`

Expected: PASS with exact-view-only authorization.

- [ ] **Step 7: Commit the Reporting boundary**

```bash
git add CHANGELOG.md apps/api infra
git commit -m "feat(reporting): isolate agentic analytics views"
```

### Task 6: Add Inventory Health Public Reads

**Files:**
- Create: `apps/api/src/modules/inventory/application/services/interfaces/inventory-health-reader.ts`
- Create: `apps/api/src/modules/inventory/application/services/implementations/inventory-health-reader.ts`
- Create: `apps/api/src/modules/inventory/application/services/implementations/inventory-health-reader.test.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory-health.repository.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory-health.repository.integration.test.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/database/migrations/202608160022_add_inventory_health_indexes.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`
- Modify: `apps/api/src/modules/inventory/index.ts`
- Modify: `apps/api/src/modules/inventory/infrastructure/database/inventory-migration.integration.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `InventoryHealthReader.stockRisk`, `.slowStock`, and `.reservationAnomalies`.
- Consumes: Task 5 `AgenticAnalyticsReader`, including validated current VND price, and Inventory-owned repository facts.

- [ ] **Step 1: Write failing velocity, slow-stock, anomaly, and leakage tests**

Cover exact boundary thresholds, zero-length rejection, floor rounding of
`dailyVelocityMilliunits`, null days cover, current prices, expired active
reservations, missing finalization timestamps, stale pending rows, stable
cursors, and excluded reference IDs.

- [ ] **Step 2: Verify failure, implement the reader, then run unit tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/inventory/application/services/implementations/inventory-health-reader.test.ts`

Expected before implementation: FAIL on missing module. Expected after the
minimal implementation: PASS with only the approved evidence fields.

- [ ] **Step 3: Add owner migration and repository plan tests**

Add the partial available-stock expression index and any reservation access
path proven by `EXPLAIN`. Do not add a generic reporting repository to
Inventory.

- [ ] **Step 4: Run Inventory integration and migration tests**

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/inventory/infrastructure/database/inventory-migration.integration.test.ts src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory-health.repository.integration.test.ts`

Expected: PASS under result, timeout, cursor, and concurrent-read bounds.

- [ ] **Step 5: Commit the Inventory unit**

```bash
git add CHANGELOG.md apps/api/src/modules/inventory
git commit -m "feat(inventory): expose bounded stock health reads"
```

### Task 7: Add Order Health and Support Context Reads

**Files:**
- Create: `apps/api/src/modules/order/application/services/interfaces/order-health-reader.ts`
- Create: `apps/api/src/modules/order/application/services/implementations/order-health-reader.ts`
- Create: `apps/api/src/modules/order/application/services/implementations/order-health-reader.test.ts`
- Create: `apps/api/src/modules/order/infrastructure/repositories/implementations/postgresql-order-health.repository.ts`
- Create: `apps/api/src/modules/order/infrastructure/repositories/implementations/postgresql-order-health.repository.integration.test.ts`
- Create: `apps/api/src/modules/order/infrastructure/database/migrations/202608160023_add_order_health_indexes.ts`
- Modify: `apps/api/src/modules/order/order.module.ts`
- Modify: `apps/api/src/modules/order/index.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `OrderHealthReader.stalledSummary`, `.invalidStateEvidence`, `.expiryRisk`, and `SupportOrderContextReader.getAuthorizedContext(orderId)`.
- Consumes: Order-owned state/history data only.

- [ ] **Step 1: Write failing state, transition, expiry, and leakage tests**

Assert every closed reason code, age/horizon edge, legal transition, stable
cursor, safe VND sum, and absence of customer ID, public number, contact,
address, lines, history actor, and payment/provider fields.

- [ ] **Step 2: Implement deterministic owner-side interpretation**

Reuse Order domain transition rules rather than copying a different state
machine into Agentic. `SupportOrderContextReader` returns only order ID, state,
created/expiry timestamps, total, and backend-confirmed paid status.

- [ ] **Step 3: Add indexes and explain-plan tests**

Add status/update, pending-payment expiry, paid-at, and history order/time paths
only where the seeded plan proves them necessary.

- [ ] **Step 4: Run Order unit and integration tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/order/application/services/implementations/order-health-reader.test.ts`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/order/infrastructure/repositories/implementations/postgresql-order-health.repository.integration.test.ts`

Expected: PASS with bounded keyset plans and zero PII.

- [ ] **Step 5: Commit the Order unit**

```bash
git add CHANGELOG.md apps/api/src/modules/order
git commit -m "feat(order): expose bounded operations health reads"
```

### Task 8: Add Finance Health Public Reads

**Files:**
- Create: `apps/api/src/modules/payment/application/services/interfaces/payment-health-reader.ts`
- Create: `apps/api/src/modules/payment/application/services/implementations/payment-health-reader.ts`
- Create: `apps/api/src/modules/payment/application/services/implementations/payment-health-reader.test.ts`
- Create: `apps/api/src/modules/payment/infrastructure/repositories/implementations/postgresql-payment-health.repository.ts`
- Create: `apps/api/src/modules/payment/infrastructure/repositories/implementations/postgresql-payment-health.repository.integration.test.ts`
- Create: `apps/api/src/modules/payment/infrastructure/database/migrations/202608160024_add_payment_health_indexes.ts`
- Modify: `apps/api/src/modules/payment/payment.module.ts`
- Modify: `apps/api/src/modules/payment/index.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `PaymentHealthReader.pendingPayments`, `.reconciliationDiscrepancies`, and `.providerEvidenceStatus`.
- Consumes: Payment-owned deterministic state and comparison semantics.

- [ ] **Step 1: Write failing amount, status-class, coverage, and leakage tests**

Include pending age-bucket boundaries, null provider amount, absolute mismatch
difference, authenticated/rejected/applied/review-required counts, zero
denominator coverage, and forbidden redacted response/hash/invoice/order/event
identifiers.

- [ ] **Step 2: Implement the reader without provider calls**

All totals use integer backend calculations. Map raw provider status into the
six closed `providerStatusClass` values before returning. Do not call SePay or
change sandbox/production configuration.

- [ ] **Step 3: Add indexes and bounded-plan integration tests**

Cover status/create, comparison/create, and event authentication/processing/
received paths, statement timeout, result size, and concurrent reads.

- [ ] **Step 4: Run Payment tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/payment/application/services/implementations/payment-health-reader.test.ts`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/payment/infrastructure/repositories/implementations/postgresql-payment-health.repository.integration.test.ts`

Expected: PASS with no provider payload or identifier leakage.

- [ ] **Step 5: Commit the Finance unit**

```bash
git add CHANGELOG.md apps/api/src/modules/payment
git commit -m "feat(payment): expose bounded finance health reads"
```

### Task 9: Add CRM Health Public Reads

**Files:**
- Create: `apps/api/src/modules/crm/application/services/interfaces/crm-health-reader.ts`
- Create: `apps/api/src/modules/crm/application/services/implementations/crm-health-reader.ts`
- Create: `apps/api/src/modules/crm/application/services/implementations/crm-health-reader.test.ts`
- Create: `apps/api/src/modules/crm/infrastructure/repositories/implementations/postgresql-crm-health.repository.ts`
- Create: `apps/api/src/modules/crm/infrastructure/repositories/implementations/postgresql-crm-health.repository.integration.test.ts`
- Modify: `apps/api/src/modules/crm/crm.module.ts`
- Modify: `apps/api/src/modules/crm/index.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `CrmHealthReader.segmentSummary` and `.followupOpportunities`.
- Consumes: Task 5 aggregate-only `AgenticAnalyticsReader` and CRM-owned follow-up counts; no customer-level analytics row.

- [ ] **Step 1: Write failing deterministic bucket and leakage tests**

Cover 5,000,000 and 50,000,000 VND boundaries, 30/90-day recency edges,
new/repeat/high-value/inactive segment precedence, overdue/unassigned counts,
and fixtures containing every forbidden customer/note/follow-up string.

- [ ] **Step 2: Implement fixed rules and aggregate composition**

Return only aggregate counts and paid revenue. Do not read CRM note bodies or
return customer, order, note, follow-up, assignee, or description identifiers.

- [ ] **Step 3: Run CRM unit and integration tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/crm/application/services/implementations/crm-health-reader.test.ts`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/crm/infrastructure/repositories/implementations/postgresql-crm-health.repository.integration.test.ts`

Expected: PASS with aggregate-only output and existing follow-up index use.

- [ ] **Step 4: Commit the CRM unit**

```bash
git add CHANGELOG.md apps/api/src/modules/crm
git commit -m "feat(crm): expose aggregate customer health reads"
```

### Task 10: Add Support Health and Bound Related-Order Reads

**Files:**
- Create: `apps/api/src/modules/support/application/services/interfaces/support-health-reader.ts`
- Create: `apps/api/src/modules/support/application/services/implementations/support-health-reader.ts`
- Create: `apps/api/src/modules/support/application/services/implementations/support-health-reader.test.ts`
- Create: `apps/api/src/modules/support/infrastructure/repositories/implementations/postgresql-support-health.repository.ts`
- Create: `apps/api/src/modules/support/infrastructure/repositories/implementations/postgresql-support-health.repository.integration.test.ts`
- Create: `apps/api/src/modules/support/infrastructure/database/migrations/202608160025_add_support_health_indexes.ts`
- Modify: `apps/api/src/modules/support/support.module.ts`
- Modify: `apps/api/src/modules/support/index.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `SupportHealthReader.slaRisk`, `.classificationSummary`, and `SupportOrderReferenceReader.findRelatedOrder(ticketId)`.
- Consumes: Task 7 `SupportOrderContextReader` only after Support proves the ticket relationship.

- [ ] **Step 1: Write failing SLA, classification, binding, and leakage tests**

Cover priority SLA durations, paused/stopped time, horizon boundaries, all six
operational classes, missing related order, arbitrary-order rejection, and
forbidden subject/description/message/customer/assignee/attachment content.

- [ ] **Step 2: Implement Support-owned calculations and bound composition**

The related-order use case accepts only `ticketId`; resolve the stored order ID
inside Support, then call Order's public purpose-limited projection. Never
accept or return a caller-selected order lookup.

- [ ] **Step 3: Add the SLA access path only after explain evidence**

Use the existing queue indexes unless the large fixture proves an additional
expression/partial index is needed. Test migration up/down/up either way.

- [ ] **Step 4: Run Support unit and integration tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/support/application/services/implementations/support-health-reader.test.ts`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/support/infrastructure/repositories/implementations/postgresql-support-health.repository.integration.test.ts`

Expected: PASS with exact ticket-to-order binding and no text/PII leakage.

- [ ] **Step 5: Commit the Support unit**

```bash
git add CHANGELOG.md apps/api/src/modules/support
git commit -m "feat(support): expose bounded service health reads"
```

### Task 11: Wire Six Fixed Agentic Adapters

**Files:**
- Create: `apps/api/src/modules/agentic/infrastructure/tools/catalog-department-tool.adapter.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/tools/inventory-department-tool.adapter.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/tools/order-department-tool.adapter.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/tools/finance-department-tool.adapter.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/tools/crm-department-tool.adapter.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/tools/support-department-tool.adapter.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/tools/fixed-department-tool-adapter.registry.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/tools/fixed-department-tool-adapter.registry.test.ts`
- Modify: `apps/api/src/modules/agentic/agentic.module.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: an exact 17-entry adapter map injected into `ToolRegistryService`.
- Consumes: only public exports from Tasks 4-10 and Task 3 adapter interfaces.

- [ ] **Step 1: Write failing exact-dispatch and architecture tests**

```ts
expect(registry.resolve("catalog.product_completeness", 1)).toBe(catalogAdapter);
expect(() => registry.resolve("catalog.product_completeness", 2))
  .toThrowError(expect.objectContaining({ code: "TOOL_UNAVAILABLE" }));
expect(() => registry.resolve("catalog.query", 1))
  .toThrowError(expect.objectContaining({ code: "TOOL_UNAVAILABLE" }));
```

Scan Agentic imports and fail on `/infrastructure/repositories/`, private
Commerce paths, SQL verbs, database clients, or mutation method names.

- [ ] **Step 2: Implement thin adapters with server-owned descriptor metadata**

Adapters switch only over their fixed names and call one public reader method.
They perform no SQL, financial arithmetic, state reinterpretation, PII
selection, or scope expansion.

- [ ] **Step 3: Compose readers and the analytics pool in `server.ts`**

Construct all public health readers from their module roots, pass the three
Reporting methods only to Inventory/CRM/Catalog consumers that need them, and
inject the fixed registry into Agentic. Close the analytics pool during normal
API shutdown alongside the primary pool.

- [ ] **Step 4: Run dispatch, module, lint, and typecheck tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/agentic/infrastructure/tools/fixed-department-tool-adapter.registry.test.ts`

Run: `pnpm --filter @opendx/api lint && pnpm --filter @opendx/api typecheck`

Expected: PASS with no private cross-module import.

- [ ] **Step 5: Commit the adapter unit**

```bash
git add CHANGELOG.md apps/api/src/modules apps/api/src/server.ts
git commit -m "feat(agentic): wire department read adapters"
```

### Task 12: Expose the Agent-Service-Only Tool Endpoint

**Files:**
- Create: `apps/api/src/modules/agentic/presentation/controllers/agentic-tool.controller.ts`
- Create: `apps/api/src/modules/agentic/presentation/routes/agentic-tool.routes.ts`
- Create: `apps/api/src/modules/agentic/presentation/validators/agentic-tool.validator.ts`
- Create: `apps/api/src/modules/agentic/tests/agentic-tool.api.test.ts`
- Create: `apps/api/src/modules/agentic/tests/agentic-tool.api.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/agentic.module.ts`
- Modify: `apps/api/src/modules/agentic/presentation/middleware/agent-service-auth.middleware.ts`
- Modify: `apps/api/src/modules/agentic/presentation/middleware/agentic-error.middleware.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `POST /v1/internal/agentic/tools/invoke` with the existing API success/error envelope.
- Consumes: Task 3 `ToolRegistry`, Task 1 strict schemas, and existing distinct Agent identity resolver.

- [ ] **Step 1: Write failing HTTP authorization and validation tests**

Test no token, staff token, worker token, wrong audience, inactive Agent,
payload-forged Agent kind, unknown field, wrong tool/version/scope/classification,
oversized body, invalid cursor/window, cross-Agent call, and one allowed call.

```ts
await request(app).post("/v1/internal/agentic/tools/invoke")
  .set("authorization", "Bearer catalog-agent-token")
  .send(validCatalogRequest)
  .expect(200);
await request(app).post("/v1/internal/agentic/tools/invoke")
  .set("authorization", "Bearer inventory-agent-token")
  .send(validCatalogRequest)
  .expect(403);
```

- [ ] **Step 2: Implement a strict route/controller boundary**

Use `authenticateAgentService` on this route only; keep Phase B workload routes
on `authenticateWorkload`. Resolve identity from verified token claims and the
database, never request body. Limit this request body to 16 KiB.

- [ ] **Step 3: Add PostgreSQL zero-leakage integration fixtures**

Insert unique canary names, emails, phones, addresses, CRM note bodies, ticket
text, provider IDs, hashes, and payloads. Invoke all 17 tools and assert no
unauthorized canary appears in response, audit, provenance, receipt safe JSON,
error, or logs.

- [ ] **Step 4: Run API and integration suites**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/agentic/tests/agentic-tool.api.test.ts`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/agentic/tests/agentic-tool.api.integration.test.ts`

Expected: PASS for all six identities and all denial paths.

- [ ] **Step 5: Commit the endpoint unit**

```bash
git add CHANGELOG.md apps/api/src/app.ts apps/api/src/modules/agentic
git commit -m "feat(agentic): expose governed department tools"
```

### Task 13: Reconcile Six Credentials and Production Configuration

**Files:**
- Modify: `infra/keycloak/realm-export.json`
- Modify: `infra/keycloak/realm-production.json`
- Modify: `infra/keycloak/reconcile-production-realm.sh`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `infra/deploy/.env.production.example`
- Modify: `.env.example`
- Modify: `apps/api/src/shared/config/environment.ts`
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Modify: `scripts/dev/agentic-production-compose-check.mjs`
- Modify: `scripts/dev/agentic-production-compose-check.test.mjs`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: six distinct required Agent client secrets and `AGENTIC_ANALYTICS_DATABASE_URL` with fail-closed production validation.
- Consumes: existing Keycloak reconciliation, PostgreSQL role setup, and production preflight patterns.

- [ ] **Step 1: Write failing environment and reconciliation tests**

Assert missing/duplicate/placeholder Agent secrets fail in production, the
analytics URL uses `opendx_agentic_reader`, no Agent secret equals worker,
control, app, admin, or another Agent secret, and reconciliation updates all
six clients without enabling browser/direct grants.

- [ ] **Step 2: Add exact environment fields and redacted validation**

Use `AGENT_CATALOG_CLIENT_SECRET`, `AGENT_INVENTORY_CLIENT_SECRET`,
`AGENT_ORDER_CLIENT_SECRET`, `AGENT_FINANCE_CLIENT_SECRET`,
`AGENT_CRM_CLIENT_SECRET`, `AGENT_SUPPORT_CLIENT_SECRET`, and
`AGENTIC_ANALYTICS_DATABASE_URL`. Never log parsed URLs with passwords.

- [ ] **Step 3: Reconcile local and production clients idempotently**

Preserve confidential service-account-only settings and exact API audience.
Do not place secrets in realm JSON defaults, image layers, docs examples,
workflow payloads, or Git-tracked evidence.

- [ ] **Step 4: Run configuration and production preflight tests**

Run: `pnpm --filter @opendx/api exec vitest run src/shared/config/environment.test.ts`

Run: `pnpm check:agentic-production-compose`

Expected: PASS with cross-secret and analytics-role validation.

- [ ] **Step 5: Commit the identity/configuration unit**

```bash
git add CHANGELOG.md .env.example apps/api infra scripts/dev
git commit -m "feat(infra): provision department agent identities"
```

### Task 14: Add Observability, Acceptance, Documentation, and Phase C Exit Gate

**Files:**
- Modify: `apps/api/src/shared/observability/metrics.ts`
- Modify: `apps/api/src/shared/observability/logger.ts`
- Create: `scripts/dev/agentic-department-tools-check.mjs`
- Create: `scripts/dev/agentic-department-tools-check.test.mjs`
- Create: `scripts/dev/agentic-phase-c-exit-check.mjs`
- Create: `scripts/dev/agentic-phase-c-exit-check.test.mjs`
- Modify: `scripts/dev/check.sh`
- Modify: `package.json`
- Modify: `Makefile`
- Modify: `docs/api/agentic.md`
- Modify: `docs/architecture/agentic-workflow-runtime.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/dependencies.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `docs/superpowers/plans/2026-08-14-post-commerce-agentic-workforce.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `pnpm check:agentic-department-tools`, `pnpm check:agentic-phase-c-exit`, and `make check-agentic-department-tools`.
- Consumes: all Tasks 1-13 and existing local/production Compose gates.

- [x] **Step 1: Write failing bounded observability tests**

Assert logs contain tool/version, department, outcome, safe error code,
correlation, causation, attempt, and duration, but never parameter/result
bodies or canaries. Assert metrics use only bounded tool/version/department/
outcome/error labels and active invocations decrement on every exit.

- [x] **Step 2: Implement metrics and structured events**

Instrument authorization denial, reservation, adapter completion, retryable
failure, terminal failure, duplicate replay, query duration, rows, and result
bytes without high-cardinality labels.

- [x] **Step 3: Write the static exit gate before its implementation**

The test mutates fixtures and proves the gate rejects a missing tool,
cross-Agent grant, private repository import, generic SQL tool, public internal
route, base-table grant, mutation method, missing leakage fixture, OpenRouter
call, Agentic Console page, or production SePay activation.

- [x] **Step 4: Implement the six-identity live acceptance check**

The check atomically owns the existing maintenance lock, creates its own task
and active configuration, obtains six credentials without printing them,
invokes every allowed tool, denies representative cross-department and AI CEO
calls, validates provenance and summary sharing, then removes only its own
records in `finally`. It must not alter Commerce records.

- [x] **Step 5: Update exact contracts and operator documentation**

Document all 17 request/result schemas, error/retry behavior, analytics role,
credentials, migrations, backup/restore impact, source build, local acceptance,
and production preflight. Mark Phase C complete only after every command below
passes; keep Phases D-H explicitly not started.

- [x] **Step 6: Run focused and complete validation**

```bash
pnpm install --frozen-lockfile
pnpm audit:env
pnpm audit:secrets
pnpm lint
pnpm typecheck
VITEST_MAX_WORKERS=1 pnpm test
pnpm --filter @opendx/api test:integration
PATH="/tmp/opendx-python313:$PATH" pnpm test:py
pnpm check:production-compose
pnpm check:agentic-production-compose
pnpm check:backup-restore
pnpm test:agentic-department-tools
pnpm test:agentic-phase-c-exit
make up
pnpm check:agentic-department-tools
pnpm check:agentic-workflow
pnpm check:agentic-workflow-recovery
pnpm check:agentic-phase-c-exit
PATH="/tmp/opendx-python313:$PATH" VITEST_MAX_WORKERS=1 pnpm check
git diff --check
git status --short
```

Expected: every command exits zero; 17 tools are allowed only to their six
owners; forbidden data/mutation surfaces remain zero; Phases D-H remain absent.

- [x] **Step 7: Perform final self-review and request independent review**

Review the focused spec line by line, run the Clean Architecture checklist,
inspect every public export and SQL grant, and resolve all Critical/Important
findings before completion.

- [x] **Step 8: Commit Phase C closure**

```bash
git add CHANGELOG.md Makefile package.json apps/api docs scripts
git commit -m "docs(agentic): close department read tools phase"
```

## Final Acceptance

- [x] Exactly 17 version-one tools exist and every descriptor/schema digest
  matches its runtime validator and migration row.
- [x] Each of six Agent identities can invoke only its own grants; AI CEO,
  staff, browser, worker, control, inactive, stale, revoked, and forged
  identities are denied before retrieval.
- [x] All output is bounded, fresh, provenance-backed, idempotent, auditable,
  safely observable, and free of prohibited PII/provider/text canaries.
- [x] The analytics role can select exactly three approved views and nothing
  else; Commerce public readers expose no repositories or mutation methods.
- [x] Duplicate, concurrent, timeout, retry, stale, oversized, invalid output,
  migration rollback, database restore, and service restart behavior converge.
- [x] No OpenRouter, model execution, file intake, AI CEO runtime, Agentic UI,
  generic SQL, Commerce mutation, or production SePay change is present.
- [x] Local and production-candidate Compose, build-from-source, backup/restore,
  repository audit, and full test gates pass from committed source.
