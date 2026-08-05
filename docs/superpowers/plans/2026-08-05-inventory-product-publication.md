<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Inventory and Product Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase 4 one-location PostgreSQL inventory, oversell-safe 15-minute reservations, product publication, anonymous public catalog contracts, technology seed data, and the governed Inventory console workspace.

**Architecture:** Add an `inventory` module beside `catalog` using the repository's feature-first Clean Architecture. Inventory owns balances, append-only movements, reservation lifecycle, expiry, and public availability ports; Catalog owns publication state and public product projections and consumes only Inventory's exported availability contract. PostgreSQL transactions and row locks enforce stock truth while the API and console expose purpose-specific DTOs.

**Tech Stack:** Node.js 22+, TypeScript strict mode, Express 5, React 19 + Vite, PostgreSQL 18, `pg`, `node-pg-migrate`, Zod 4, Keycloak 26, MinIO, Vitest, Testing Library, Supertest, Docker Compose, and pnpm 11.

## Global Constraints

- Work on branch `phuong`, which is based on `develop`; do not edit `main`.
- Keep NovaCommerce single-company, B2C, single-store, physical-goods, one implicit inventory location, and VND-only.
- PostgreSQL is the sole runtime source of truth; do not add an in-memory runtime database.
- Preserve existing feature-first Clean Architecture and import other modules only through their public `index.ts` contracts.
- Do not move existing code, create empty directory trees, add a DI framework, or add a new runtime infrastructure service.
- Keep `available = onHand - reserved`, with `onHand >= 0`, `reserved >= 0`, and `available >= 0`.
- Classify `available = 0` as `out_of_stock`, `available = 1..5` as `low`, and `available >= 6` as `healthy`; keep this deterministic backend rule out of environment configuration.
- Fix reservation TTL at 15 minutes on the backend; never accept TTL from browser input.
- A sold-out published product remains publicly visible with `purchasable: false`.
- Backend code authoritatively enforces publication, inventory, authorization, and audit rules.
- Use TDD for every behavior change and add SPDX headers to every new license-capable file.
- Use existing dependencies only. If implementation proves a new dependency unavoidable, stop and obtain a separately reviewed dependency decision before modifying manifests.
- Update `CHANGELOG.md` under `[Unreleased]` in every repository-changing commit.
- Do not begin Phase 5 until this plan's acceptance chain and full validation pass.
- Host-side PostgreSQL test commands use `${POSTGRES_PORT:-5432}` so contributors can honor the documented port override without editing source.

---

## File Map

### Inventory backend ownership

- `apps/api/src/modules/inventory/domain/entities/inventory-item.ts`: immutable inventory balance shape and available-quantity invariant.
- `apps/api/src/modules/inventory/domain/entities/inventory-reservation.ts`: reservation state and terminal-transition rules.
- `apps/api/src/modules/inventory/domain/entities/stock-movement.ts`: append-only movement types and signed deltas.
- `apps/api/src/modules/inventory/domain/exceptions/inventory-domain.error.ts`: stable domain invariant errors.
- `apps/api/src/modules/inventory/domain/services/inventory-rules.ts`: pure receive, adjustment, reservation, release, expiry, and consume calculations.
- `apps/api/src/modules/inventory/application/dtos/inventory.dto.ts`: staff command/query and response DTOs.
- `apps/api/src/modules/inventory/application/repositories/interfaces/inventory.repository.ts`: persistence operations required by balance and reservation use cases.
- `apps/api/src/modules/inventory/application/repositories/interfaces/inventory-audit.repository.ts`: inventory-owned audit append port over the existing audit table.
- `apps/api/src/modules/inventory/application/services/interfaces/inventory.service.ts`: staff inventory use-case contract.
- `apps/api/src/modules/inventory/application/services/interfaces/inventory-availability.ts`: public cross-module availability query contract.
- `apps/api/src/modules/inventory/application/services/interfaces/inventory-reservations.ts`: reserve/release/expire/consume contract for Phase 6.
- `apps/api/src/modules/inventory/application/services/inventory-application.error.ts`: stable application error mapping.
- `apps/api/src/modules/inventory/application/services/implementations/inventory.service.ts`: staff receive/adjust/read orchestration.
- `apps/api/src/modules/inventory/application/services/implementations/inventory-reservation.service.ts`: row-locked reservation orchestration.
- `apps/api/src/modules/inventory/infrastructure/database/migrations/202608050004_create_inventory.ts`: inventory tables, checks, foreign keys, and indexes.
- `apps/api/src/modules/inventory/infrastructure/database/run-inventory-migrations.ts`: module-local migration runner using `inventory_migrations`.
- `apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory.repository.ts`: PostgreSQL balance, movement, and reservation adapter.
- `apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory-audit.repository.ts`: adapter for inventory audit events.
- `apps/api/src/modules/inventory/infrastructure/seeds/inventory.seed.ts`: idempotent technology stock and movement fixtures.
- `apps/api/src/modules/inventory/infrastructure/seeds/run-inventory-seed.ts`: direct seed entry point.
- `apps/api/src/modules/inventory/infrastructure/workers/reservation-expiry.worker.ts`: bounded idempotent expiry loop.
- `apps/api/src/modules/inventory/presentation/validators/inventory.validator.ts`: Zod parsing for params, filters, receipts, and adjustments.
- `apps/api/src/modules/inventory/presentation/controllers/inventory.controller.ts`: staff HTTP orchestration only.
- `apps/api/src/modules/inventory/presentation/routes/inventory.routes.ts`: authenticated role-scoped routes.
- `apps/api/src/modules/inventory/inventory.module.ts`: explicit composition root returning router, availability, reservation, worker, and cleanup contracts.
- `apps/api/src/modules/inventory/index.ts`: intentional public exports only.

### Catalog extensions

- `apps/api/src/shared/database/migrations/202608050003_add_product_publication.ts`: add and roll back the `published` product status.
- `apps/api/src/modules/catalog/application/services/interfaces/catalog-variant-reader.ts`: transaction-scoped active-variant summary contract exported for Inventory.
- `apps/api/src/modules/catalog/application/services/implementations/catalog-variant-reader.ts`: implementation backed by the existing Variant repository.
- `apps/api/src/modules/catalog/application/services/interfaces/product-publication.service.ts`: publish/unpublish contract.
- `apps/api/src/modules/catalog/application/services/interfaces/public-catalog.service.ts`: anonymous list/detail/category contract.
- `apps/api/src/modules/catalog/application/repositories/interfaces/public-catalog.repository.ts`: catalog-only public projection reads.
- `apps/api/src/modules/catalog/application/dtos/requests/public-catalog-request.dto.ts`: public query DTO.
- `apps/api/src/modules/catalog/application/dtos/responses/public-catalog-response.dto.ts`: safe public response types.
- `apps/api/src/modules/catalog/application/services/implementations/product-publication.service.ts`: readiness validation and status transition.
- `apps/api/src/modules/catalog/application/services/implementations/public-catalog.service.ts`: catalog projection plus inventory availability enrichment.
- `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`: published catalog SQL without inventory-table access.
- `apps/api/src/modules/catalog/presentation/validators/public-catalog.validator.ts`: anonymous list/detail parsing.
- `apps/api/src/modules/catalog/presentation/controllers/product-publication.controller.ts`: staff publication transport orchestration.
- `apps/api/src/modules/catalog/presentation/controllers/public-catalog.controller.ts`: anonymous public transport orchestration.
- `apps/api/src/modules/catalog/presentation/routes/product-publication.routes.ts`: authorized publish/unpublish routes.
- `apps/api/src/modules/catalog/presentation/routes/public-catalog.routes.ts`: `/v1/storefront` routes and public media content validation.
- Existing Product domain, DTO, mapper, repository, service, module, and tests gain `published` support without structural migration.

### Console and operations

- `apps/console/src/features/inventory/`: API, schemas, mappers, types, hooks, components, page, and tests created only with their first real behavior.
- Existing Catalog types, schemas, API, product table/editor page, hooks, and tests gain publication readiness and actions.
- Existing app router, shell, auth role types, and global stylesheet gain Inventory navigation and responsive operational states.
- API configuration, server/app composition, package scripts, Keycloak realm, Docker environment, seed order, docs, roadmap, and changelog are modified in the owning tasks.

---

### Task 1: Publication and Inventory Schema plus Domain Invariants

**Files:**

- Create: `apps/api/src/shared/database/migrations/202608050003_add_product_publication.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/database/migrations/202608050004_create_inventory.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/database/run-inventory-migrations.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/database/inventory-migration.integration.test.ts`
- Modify: `apps/api/src/shared/database/migrations/catalog-migration.integration.test.ts`
- Create: `apps/api/src/modules/inventory/domain/entities/inventory-item.ts`
- Create: `apps/api/src/modules/inventory/domain/entities/inventory-reservation.ts`
- Create: `apps/api/src/modules/inventory/domain/entities/stock-movement.ts`
- Create: `apps/api/src/modules/inventory/domain/exceptions/inventory-domain.error.ts`
- Create: `apps/api/src/modules/inventory/domain/services/inventory-rules.ts`
- Create: `apps/api/src/modules/inventory/domain/services/inventory-rules.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces: `InventoryItem`, `InventoryReservation`, `StockMovement`, `availableQuantity(item)`, `applyReceipt(item, quantity)`, `applyAdjustment(item, delta)`, `applyReservation(item, quantity)`, `applyRelease(item, quantity)`, and `applyConsume(item, quantity)`.
- Produces: `runInventoryMigrations(databaseUrl, direction, count?)` using migration table `inventory_migrations`.
- Database contract: `inventory_items`, `inventory_reservations`, and `stock_movements`; `products.status` accepts `draft | published | archived`.

- [x] **Step 1: Write failing domain invariant tests**

```ts
it("computes availability and rejects oversell", () => {
  const item = inventoryItem({ onHand: 5, reserved: 2 });
  expect(availableQuantity(item)).toBe(3);
  expect(() => applyReservation(item, 4)).toThrowError(
    expect.objectContaining({ code: "INSUFFICIENT_STOCK" }),
  );
});

it("consumes held stock without changing availability twice", () => {
  expect(applyConsume(inventoryItem({ onHand: 5, reserved: 2 }), 2)).toMatchObject({
    onHand: 3,
    reserved: 0,
  });
});

it("allows only active reservations to finalize", () => {
  expect(finalizeReservation(reservation({ status: "active" }), "expired", NOW)).toMatchObject({
    status: "expired",
    finalizedAt: NOW,
  });
  expect(() => finalizeReservation(reservation({ status: "released" }), "consumed", NOW))
    .toThrowError(expect.objectContaining({ code: "RESERVATION_ALREADY_FINALIZED" }));
});
```

- [x] **Step 2: Run the domain test and verify the missing-module failure**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/inventory/domain/services/inventory-rules.test.ts`

Expected: FAIL because the Inventory domain files do not exist.

- [x] **Step 3: Implement the pure domain types and calculations**

```ts
export interface InventoryItem {
  readonly id: string;
  readonly variantId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function availableQuantity(item: InventoryItem): number {
  const available = item.onHand - item.reserved;
  if (!Number.isSafeInteger(available) || available < 0) {
    throw new InventoryDomainError("INVALID_INVENTORY_BALANCE", "Inventory balance is invalid");
  }
  return available;
}
```

Implement all deltas as safe integers, reject non-positive receipts/reservations,
reject zero adjustments, and keep reservation terminal states immutable.

- [x] **Step 4: Write failing migration coverage**

```ts
it("creates inventory constraints and rolls them back", async () => {
  await runCatalogMigrations(databaseUrl!, "up");
  await runInventoryMigrations(databaseUrl!, "up");
  const constraints = await pool.query<{ constraint_name: string }>(
    `SELECT constraint_name FROM information_schema.table_constraints
     WHERE table_name = 'inventory_items' ORDER BY constraint_name`,
  );
  expect(constraints.rows.map(({ constraint_name }) => constraint_name)).toEqual(
    expect.arrayContaining([
      "inventory_items_variant_id_key",
      "inventory_items_on_hand_check",
      "inventory_items_reserved_check",
      "inventory_items_available_check",
    ]),
  );
  await runInventoryMigrations(databaseUrl!, "down", 1);
  expect((await pool.query("SELECT to_regclass('public.inventory_items') AS name")).rows[0])
    .toEqual({ name: null });
});
```

- [x] **Step 5: Run the migration test and verify it fails**

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:${POSTGRES_PORT:-5432}/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/inventory/infrastructure/database/inventory-migration.integration.test.ts`

Expected: FAIL because the Inventory migration runner and tables are absent.

- [x] **Step 6: Implement exact schema constraints and rollback order**

```ts
pgm.createTable("inventory_items", {
  id: { type: "uuid", primaryKey: true },
  variant_id: { type: "uuid", notNull: true, unique: true, references: "product_variants", onDelete: "RESTRICT" },
  on_hand: { type: "integer", notNull: true, default: 0, check: "on_hand >= 0" },
  reserved: { type: "integer", notNull: true, default: 0, check: "reserved >= 0" },
  version: { type: "integer", notNull: true, default: 1, check: "version > 0" },
  created_at: { type: "timestamptz", notNull: true },
  updated_at: { type: "timestamptz", notNull: true },
});
pgm.addConstraint("inventory_items", "inventory_items_available_check", {
  check: "on_hand - reserved >= 0",
});
```

Create reservations with positive quantity, the four-state check, one
`(reference_type, reference_id, variant_id)` unique constraint, and expiry/status
indexes. Create movements with signed deltas, `reason_code` limited to 64
characters, optional `reason_note` limited to 500 characters, actor and
correlation values limited to 200 characters, and nullable `idempotency_key`
limited to 128 characters with a partial unique index for staff receipt retries.
Drop movements, reservations, then items in `down`. The publication migration
replaces the Product status check in `up` and restores it only after converting
published rows to draft in `down`.

- [x] **Step 7: Run focused tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/inventory/domain/services/inventory-rules.test.ts`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:${POSTGRES_PORT:-5432}/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/inventory/infrastructure/database/inventory-migration.integration.test.ts src/shared/database/migrations/catalog-migration.integration.test.ts`

Expected: PASS.

- [x] **Step 8: Commit the schema and domain unit**

```bash
git add apps/api/src/shared/database/migrations apps/api/src/modules/inventory CHANGELOG.md
git commit -m "feat(inventory): add stock schema and domain invariants"
```

### Task 2: Staff Balance, Movement, and Audit Use Cases

**Files:**

- Create: `apps/api/src/modules/inventory/application/dtos/inventory.dto.ts`
- Create: `apps/api/src/modules/inventory/application/repositories/interfaces/inventory.repository.ts`
- Create: `apps/api/src/modules/inventory/application/repositories/interfaces/inventory-audit.repository.ts`
- Create: `apps/api/src/modules/inventory/application/services/interfaces/inventory.service.ts`
- Create: `apps/api/src/modules/inventory/application/services/interfaces/inventory-availability.ts`
- Create: `apps/api/src/modules/inventory/application/services/inventory-application.error.ts`
- Create: `apps/api/src/modules/inventory/application/services/implementations/inventory.service.ts`
- Create: `apps/api/src/modules/inventory/application/services/implementations/inventory.service.test.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory.repository.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory.repository.integration.test.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory-audit.repository.ts`
- Create: `apps/api/src/modules/catalog/application/services/interfaces/catalog-variant-reader.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/catalog-variant-reader.ts`
- Modify: `apps/api/src/modules/catalog/index.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces: `InventoryServiceContract.list`, `.get`, `.receive`, `.adjust`, and `.listMovements`.
- Produces: `InventoryAvailabilityReader.getByVariantIds(variantIds)` returning a map with absent items represented as zero and `initialized: false`.
- Produces: Catalog's exported `CatalogVariantReader.findById(session, variantId)` returning `{ id, sku, status }` without exposing a Catalog entity or repository.
- Consumes: Task 1 domain functions and schema.

- [x] **Step 1: Write failing service tests for first receipt, retry, adjustment, and audit**

```ts
it("creates the first balance and movement atomically", async () => {
  const result = await service.receive(
    { variantId: VARIANT_ID, quantity: 8, idempotencyKey: "receipt-001" },
    staffContext,
  );
  expect(result).toMatchObject({ variantId: VARIANT_ID, onHand: 8, reserved: 0, available: 8 });
  expect(repository.appendMovement).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ movementType: "receive", onHandDelta: 8, idempotencyKey: "receipt-001" }),
  );
  expect(audit.append).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ action: "inventory.stock.received", actorId: "staff-1" }),
  );
});

it("returns the original receipt without applying it twice", async () => {
  repository.findMovementByIdempotencyKey.mockResolvedValue(existingReceipt);
  await expect(service.receive(receiptRequest, staffContext)).resolves.toEqual(existingReceiptResult);
  expect(repository.updateBalance).not.toHaveBeenCalled();
});

it("rejects an adjustment below reserved stock", async () => {
  repository.lockById.mockResolvedValue(item({ onHand: 5, reserved: 4 }));
  await expect(service.adjust(ITEM_ID, { delta: -2, reasonCode: "STOCK_COUNT", note: "Cycle count", version: 1 }, staffContext))
    .rejects.toMatchObject({ code: "INVALID_STOCK_ADJUSTMENT" });
});
```

- [x] **Step 2: Run the service tests and verify they fail**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/inventory/application/services/implementations/inventory.service.test.ts`

Expected: FAIL because service contracts and implementations are absent.

- [x] **Step 3: Define repository and service signatures before implementation**

```ts
export interface InventoryRepository {
  list(session: DatabaseSession, query: InventoryListQuery): Promise<InventoryListResult>;
  findById(session: DatabaseSession, id: string): Promise<InventoryItem | undefined>;
  lockById(session: DatabaseSession, id: string): Promise<InventoryItem | undefined>;
  lockByVariantId(session: DatabaseSession, variantId: string): Promise<InventoryItem | undefined>;
  create(session: DatabaseSession, item: InventoryItem): Promise<void>;
  updateBalance(session: DatabaseSession, item: InventoryItem, expectedVersion: number): Promise<boolean>;
  appendMovement(session: DatabaseSession, movement: StockMovement): Promise<void>;
  findMovementByIdempotencyKey(session: DatabaseSession, key: string): Promise<StockMovement | undefined>;
  listMovements(session: DatabaseSession, itemId: string, page: number, pageSize: number): Promise<MovementListResult>;
  getAvailabilityByVariantIds(session: DatabaseSession, variantIds: readonly string[]): Promise<ReadonlyMap<string, InventoryAvailability>>;
}

export interface CatalogVariantReader {
  findById(
    session: DatabaseSession,
    variantId: string,
  ): Promise<{ readonly id: string; readonly sku: string; readonly status: "active" | "archived" } | undefined>;
}
```

Use `SELECT ... FOR UPDATE` only in write transactions. Validate that the
variant exists and is active through the Catalog module's exported
`CatalogVariantReader`, passed to the service constructor; do not import a
Catalog repository. Export a `createCatalogVariantReader()` factory
from Catalog's `index.ts` so `server.ts` can construct this public read contract
before composing Inventory.

- [x] **Step 4: Implement receive, adjust, queries, mapping, and audit atomically**

For receipt, check the idempotency key first, lock or create the variant's item,
apply the positive quantity, append one `receive` movement, and append one audit
event inside `transactions.run`. Catch the unique idempotency race, reload its
existing movement, and return the resulting projection without another delta.

For adjustment, require `reasonCode`, trim the optional note, compare the
request version, apply a non-zero signed delta, append one `adjustment` movement,
and return `STALE_VERSION` or `INVALID_STOCK_ADJUSTMENT` deterministically.

- [x] **Step 5: Write PostgreSQL adapter tests**

```ts
it("persists an explanatory movement with every balance change", async () => {
  await service.receive({ variantId: VARIANT_ID, quantity: 7, idempotencyKey: "receive-7" }, context);
  await service.adjust(ITEM_ID, { delta: -2, reasonCode: "STOCK_COUNT", version: 2 }, context);
  const rows = await pool.query(
    "SELECT movement_type, on_hand_delta, reserved_delta FROM stock_movements ORDER BY occurred_at, id",
  );
  expect(rows.rows).toEqual([
    expect.objectContaining({ movement_type: "receive", on_hand_delta: 7, reserved_delta: 0 }),
    expect.objectContaining({ movement_type: "adjustment", on_hand_delta: -2, reserved_delta: 0 }),
  ]);
});
```

- [x] **Step 6: Run unit and PostgreSQL tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/inventory/application/services/implementations/inventory.service.test.ts`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:${POSTGRES_PORT:-5432}/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory.repository.integration.test.ts`

Expected: PASS.

- [x] **Step 7: Commit the staff inventory application slice**

```bash
git add apps/api/src/modules/inventory apps/api/src/modules/catalog/application/services apps/api/src/modules/catalog/index.ts CHANGELOG.md
git commit -m "feat(inventory): add stock balance operations"
```

### Task 3: Reservation Lifecycle, Expiry, and No-Oversell Proof

**Files:**

- Create: `apps/api/src/modules/inventory/application/services/interfaces/inventory-reservations.ts`
- Create: `apps/api/src/modules/inventory/application/services/implementations/inventory-reservation.service.ts`
- Create: `apps/api/src/modules/inventory/application/services/implementations/inventory-reservation.service.test.ts`
- Modify: `apps/api/src/modules/inventory/application/repositories/interfaces/inventory.repository.ts`
- Modify: `apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory.repository.ts`
- Create: `apps/api/src/modules/inventory/tests/inventory-reservation.integration.test.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/workers/reservation-expiry.worker.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/workers/reservation-expiry.worker.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces: `InventoryReservationPort.reserve(request, context)`, `.release(reference, context)`, `.consume(reference, context)`, and `.expireDue(limit, context)`.
- Reservation input: `{ referenceType: "checkout" | "order"; referenceId: string; lines: readonly { variantId: string; quantity: number }[] }`.
- Reservation output: `{ referenceType; referenceId; status; expiresAt; lines: readonly ReservationLineDto[] }`.
- Produces: `ReservationExpiryWorker.start()` and `.stop()`; its batch callback invokes `expireDue(100, systemContext)`.

- [x] **Step 1: Write failing reservation state and idempotency tests**

```ts
it("uses a backend-owned fifteen-minute expiry", async () => {
  const result = await service.reserve(
    { referenceType: "checkout", referenceId: "checkout-1", lines: [{ variantId: VARIANT_ID, quantity: 2 }] },
    systemContext,
  );
  expect(result.expiresAt).toBe("2026-08-05T00:15:00.000Z");
});

it.each(["released", "expired", "consumed"] as const)(
  "does not apply a second delta after %s",
  async (terminalStatus) => {
    repository.findReservationGroup.mockResolvedValue(group({ status: terminalStatus }));
    await expect(service.release(reference, systemContext)).resolves.toMatchObject({ status: terminalStatus });
    expect(repository.updateBalance).not.toHaveBeenCalled();
  },
);
```

- [x] **Step 2: Run unit tests and verify failure**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/inventory/application/services/implementations/inventory-reservation.service.test.ts`

Expected: FAIL because reservation application code is absent.

- [x] **Step 3: Implement deterministic multi-line reservation orchestration**

Sort unique variant IDs before locking so concurrent multi-line reservations use
one lock order. Reject duplicate variant lines, non-positive quantities, inactive
variants, or missing balances. Calculate `expiresAt` from the injected clock plus
exactly `15 * 60 * 1000`. Within one transaction, create each line, update every
balance, append movements, and append one audit entry per affected inventory
item. A repeated reference returns the existing group only when the requested
variant quantities match; otherwise return `CONFLICT`.

Release/expire decrement `reserved`; consume decrements both `onHand` and
`reserved`. Lock reservation rows then inventory rows in stable UUID order and
finalize all lines atomically.

- [x] **Step 4: Write the required concurrent PostgreSQL proof**

```ts
it("never reserves more units than one SKU has available", async () => {
  await receive(10);
  const attempts = await Promise.allSettled(
    Array.from({ length: 20 }, (_, index) =>
      reserve({ referenceId: `checkout-${index}`, quantity: 1 }),
    ),
  );
  expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(10);
  expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(10);
  const balance = await pool.query("SELECT on_hand, reserved FROM inventory_items WHERE variant_id = $1", [VARIANT_ID]);
  expect(balance.rows[0]).toEqual({ on_hand: 10, reserved: 10 });
  expect(await movementCount("reservation")).toBe(10);
});
```

Also test two expiry workers racing for the same due reservation and assert one
`expiry` movement, one terminal state, and `reserved = 0`.

- [x] **Step 5: Run the reservation and concurrency tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/inventory/application/services/implementations/inventory-reservation.service.test.ts src/modules/inventory/infrastructure/workers/reservation-expiry.worker.test.ts`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:${POSTGRES_PORT:-5432}/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/inventory/tests/inventory-reservation.integration.test.ts`

Expected: PASS with exactly ten successful reservations and no negative
availability.

- [x] **Step 6: Commit the reservation lifecycle**

```bash
git add apps/api/src/modules/inventory CHANGELOG.md
git commit -m "feat(inventory): add oversell-safe reservations"
```

### Task 4: Product Publication and Anonymous Public Catalog

**Files:**

- Modify: `apps/api/src/modules/catalog/domain/entities/product.ts`
- Modify: `apps/api/src/modules/catalog/domain/services/catalog-rules.ts`
- Modify: `apps/api/src/modules/catalog/domain/services/catalog-rules.test.ts`
- Modify: `apps/api/src/modules/catalog/application/dtos/requests/product-request.dto.ts`
- Modify: `apps/api/src/modules/catalog/application/dtos/responses/product-response.dto.ts`
- Modify: `apps/api/src/modules/catalog/application/mappers/product.mapper.ts`
- Modify: `apps/api/src/modules/catalog/application/repositories/interfaces/product.repository.ts`
- Create: `apps/api/src/modules/catalog/application/repositories/interfaces/public-catalog.repository.ts`
- Create: `apps/api/src/modules/catalog/application/dtos/requests/public-catalog-request.dto.ts`
- Create: `apps/api/src/modules/catalog/application/dtos/responses/public-catalog-response.dto.ts`
- Create: `apps/api/src/modules/catalog/application/services/interfaces/product-publication.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/interfaces/public-catalog.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/product-publication.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/product-publication.service.test.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/public-catalog.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/public-catalog.service.test.ts`
- Modify: `apps/api/src/modules/catalog/application/services/implementations/product.service.ts`
- Modify: `apps/api/src/modules/catalog/application/services/implementations/product.service.test.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-product.repository.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: `InventoryAvailabilityReader` and `CatalogVariantReader` from the Inventory/Catalog public boundaries created in Task 2.
- Produces: `ProductPublicationServiceContract.checkReadiness`, `.publish`, and `.unpublish`.
- Produces: `PublicCatalogServiceContract.listCategories`, `.listProducts`, `.getProductBySlug`, and `.getMediaContentAuthorization`.
- Public variant fields: `id`, `sku`, `title`, `optionValues`, current VND price, `availableQuantity`, and `purchasable`.
- Admin product-list items gain `availabilitySummary: { totalAvailable, purchasableVariantCount }` so the existing Catalog table can distinguish `Published` from `Published · Out of stock` without browser-side inventory calculations.

- [x] **Step 1: Write failing publication-policy tests**

```ts
it("returns every missing publication requirement", async () => {
  readinessRepository.inspect.mockResolvedValue({
    categoryActive: false,
    primaryImageCount: 0,
    activeVariants: [{ variantId: VARIANT_ID, hasCurrentPrice: false }],
  });
  availability.getByVariantIds.mockResolvedValue(new Map());
  await expect(service.checkReadiness(PRODUCT_ID)).resolves.toEqual({
    ready: false,
    missing: ["ACTIVE_CATEGORY", "CURRENT_PRICE", "PRIMARY_IMAGE", "INVENTORY_ITEM"],
  });
});

it("publishes an initialized zero-stock product", async () => {
  availability.getByVariantIds.mockResolvedValue(
    new Map([[VARIANT_ID, { initialized: true, onHand: 0, reserved: 0, available: 0 }]]),
  );
  await expect(service.publish(PRODUCT_ID, { version: 2 }, staffContext))
    .resolves.toMatchObject({ status: "published", version: 3 });
});
```

- [x] **Step 2: Run publication tests and verify failure**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/application/services/implementations/product-publication.service.test.ts`

Expected: FAIL because publication contracts are absent.

- [x] **Step 3: Implement publication without weakening archived/mutation rules**

Extend `ProductStatus` and all exhaustive row/DTO/schema mappings to include
`published`. Allow product metadata edits while published only if existing
Catalog rules and optimistic version checks still pass; archiving a published
product remains an explicit action that removes it from public reads. Publish
validates active category, at least one active variant, current positive VND
price for each exposed active variant, exactly one primary image with alt text,
and initialized inventory for each exposed active variant. Stock quantity may be
zero. Publish/unpublish and `catalog.product.published` or
`catalog.product.unpublished` audit append commit together.

- [x] **Step 4: Write failing public-projection tests**

```ts
it("keeps a sold-out published product discoverable", async () => {
  catalog.listProducts.mockResolvedValue(pageOf(publishedProduct([VARIANT_ID])));
  availability.getByVariantIds.mockResolvedValue(
    new Map([[VARIANT_ID, { initialized: true, onHand: 4, reserved: 4, available: 0 }]]),
  );
  const result = await service.listProducts({ page: 1, pageSize: 20, stockStatus: "out_of_stock" });
  expect(result.items[0]?.variants[0]).toMatchObject({ availableQuantity: 0, purchasable: false });
});

it("does not return draft or archived products", async () => {
  await expect(repository.listProducts({ page: 1, pageSize: 20 })).resolves
    .toEqual(expect.objectContaining({ items: [] }));
});
```

- [x] **Step 5: Implement public catalog repository and enrichment**

The PostgreSQL public repository reads only Catalog tables and requires
`p.status = 'published'`, `category.status = 'active'`, active variants, current
VND prices, and primary media. The service gathers unique variant IDs, makes one
`getByVariantIds` call, adds availability, filters by `stockStatus`, and maps safe
DTOs. It never imports Inventory SQL or repository types and never exposes
`object_key`, optimistic versions, movement data, or audit data.

Extend the existing Product list service with the same one-call availability
enrichment to produce `availabilitySummary`; do not issue one availability
query per product or variant.

- [x] **Step 6: Run unit and PostgreSQL public-catalog tests**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/domain/services/catalog-rules.test.ts src/modules/catalog/application/services/implementations/product-publication.service.test.ts src/modules/catalog/application/services/implementations/public-catalog.service.test.ts`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:${POSTGRES_PORT:-5432}/opendx_test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts`

Expected: PASS.

- [x] **Step 7: Commit publication and public read contracts**

```bash
git add apps/api/src/modules/catalog CHANGELOG.md
git commit -m "feat(catalog): add publication and public reads"
```

### Task 5: HTTP Contracts, Authorization, Composition, and Expiry Runtime

**Files:**

- Create: `apps/api/src/modules/inventory/presentation/validators/inventory.validator.ts`
- Create: `apps/api/src/modules/inventory/presentation/controllers/inventory.controller.ts`
- Create: `apps/api/src/modules/inventory/presentation/routes/inventory.routes.ts`
- Create: `apps/api/src/modules/inventory/inventory.module.ts`
- Create: `apps/api/src/modules/inventory/index.ts`
- Create: `apps/api/src/modules/inventory/tests/inventory.api.test.ts`
- Create: `apps/api/src/modules/inventory/tests/inventory.api.integration.test.ts`
- Create: `apps/api/src/modules/catalog/presentation/validators/public-catalog.validator.ts`
- Create: `apps/api/src/modules/catalog/presentation/controllers/product-publication.controller.ts`
- Create: `apps/api/src/modules/catalog/presentation/controllers/public-catalog.controller.ts`
- Create: `apps/api/src/modules/catalog/presentation/routes/product-publication.routes.ts`
- Create: `apps/api/src/modules/catalog/presentation/routes/public-catalog.routes.ts`
- Create: `apps/api/src/modules/catalog/tests/public-catalog.api.test.ts`
- Modify: `apps/api/src/modules/catalog/catalog.module.ts`
- Modify: `apps/api/src/modules/catalog/index.ts`
- Modify: `apps/api/src/shared/auth/staff-principal.ts`
- Create: `apps/api/src/shared/auth/audited-role-guard.middleware.ts`
- Create: `apps/api/src/shared/auth/audited-role-guard.middleware.test.ts`
- Modify: `apps/api/src/shared/auth/require-role.middleware.test.ts`
- Modify: `apps/api/src/shared/config/environment.ts`
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Staff inventory routes exactly match the approved spec under `/v1/admin/inventory`.
- Publication routes mount under `/v1/admin/catalog`, including
  `GET /products/:productId/publication-readiness`,
  `POST /products/:productId/publish`, and
  `POST /products/:productId/unpublish`.
- Anonymous public routes mount under `/v1/storefront`.
- Public media content mounts at
  `GET /v1/storefront/products/:productId/media/:mediaId/content` and verifies
  that the product is published and the media belongs to it before reading MinIO.
- `createInventoryModule` returns `{ router, availability, reservations, expiryWorker }`.
- `createCatalogModule` returns `{ adminRouter, publicRouter }` and consumes `availability` plus the existing media dependencies.

- [x] **Step 1: Write failing HTTP authorization and validation tests**

```ts
it.each([
  [undefined, 401],
  [tokenFor(["catalog_manager"]), 403],
])("protects stock receipt", async (token, status) => {
  const call = request(app).post("/v1/admin/inventory/receipts");
  if (token !== undefined) call.set("authorization", `Bearer ${token}`);
  await call.send({ variantId: VARIANT_ID, quantity: 5, idempotencyKey: "receipt-5" }).expect(status);
  expect(inventory.receive).not.toHaveBeenCalled();
});

it("allows inventory_manager to receive stock", async () => {
  await request(app)
    .post("/v1/admin/inventory/receipts")
    .set("authorization", `Bearer ${inventoryManagerToken}`)
    .send({ variantId: VARIANT_ID, quantity: 5, idempotencyKey: "receipt-5" })
    .expect(201);
});

it("serves a sold-out product anonymously", async () => {
  const response = await request(app).get("/v1/storefront/products/phone-x").expect(200);
  expect(response.body.data.variants[0]).toMatchObject({ availableQuantity: 0, purchasable: false });
});
```

- [x] **Step 2: Run HTTP tests and verify failure**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/inventory/tests/inventory.api.test.ts src/modules/catalog/tests/public-catalog.api.test.ts`

Expected: FAIL because the routes and module composition are absent.

- [x] **Step 3: Implement validators, thin controllers, routes, and stable errors**

Use Zod to require UUIDs, safe integer quantities, non-empty bounded
idempotency keys, non-zero adjustment deltas, reason codes, current versions,
page defaults `1` and `20`, and maximum page size `100`. Controllers pass
verified `staffPrincipal.subject`, verified roles, and
`response.locals.correlationId` into application contexts. Inventory and
Publication services recheck the allowed role before mutation so direct service
calls cannot bypass policy. Map Inventory errors through the existing
centralized error middleware without leaking infrastructure messages.

Role matrix:

```ts
export type StaffRole = "administrator" | "catalog_manager" | "inventory_manager";

const inventoryReaders = ["administrator", "catalog_manager", "inventory_manager"] as const;
const inventoryWriters = ["administrator", "inventory_manager"] as const;
const publishers = ["administrator", "catalog_manager"] as const;
```

Implement `createAuditedRoleGuard({ allowedRoles, action, appendDenied })` as a
shared transport helper. Missing authentication remains `401` without inventing
an actor. An authenticated forbidden request invokes the injected module-owned
`appendDenied({ actorId, action, resourceId, correlationId })`, waits for that
audit write, then returns `403`; the mutation service is not called. Add an
integration assertion that a forbidden receipt creates one `outcome = 'denied'`
audit row and no Inventory balance or movement.

- [x] **Step 4: Compose modules without private imports or duplicate infrastructure instances**

Create `variantReader = createCatalogVariantReader(transactions)` first, create
Inventory with that public contract, then create Catalog with Inventory's
exported `availability`. This construction order avoids a circular dependency
without setters, private imports, or a new composition directory. Mount admin
and public routers separately in `createApiApp`.

Validate these new environment values:

```text
INVENTORY_RESERVATION_TTL_SECONDS=900
INVENTORY_EXPIRY_INTERVAL_SECONDS=30
```

Require TTL to equal `900`; bound expiry interval from `5` through `300`.
Start the expiry worker after the HTTP server starts and call `stop()` before
closing the PostgreSQL pool on SIGINT/SIGTERM.

- [x] **Step 5: Run API unit and full PostgreSQL/MinIO integration tests**

Run: `pnpm --filter @opendx/api test`

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:${POSTGRES_PORT:-5432}/opendx_test MINIO_ENDPOINT=http://localhost:9000 MINIO_ACCESS_KEY=opendx_minio MINIO_SECRET_KEY=opendx_minio_password MINIO_BUCKET=product-media-test pnpm --filter @opendx/api test:integration`

Expected: PASS, including anonymous public reads, role isolation, audit writes,
and no protected field leakage.

- [x] **Step 6: Commit the API vertical slice**

```bash
git add apps/api/src CHANGELOG.md
git commit -m "feat(api): expose inventory and publication workflows"
```

### Task 6: Technology Seed, Keycloak Role, Migration Order, and Docker Operations

**Files:**

- Modify: `apps/api/src/modules/catalog/infrastructure/seeds/catalog.seed.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/seeds/catalog.seed.integration.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/laptop-pro.png`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/laptop-air.png`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/phone-pro.png`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/phone-lite.png`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/tablet-pro.png`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/smart-watch.png`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/graphics-card.png`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/solid-state-drive.png`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/mechanical-keyboard.png`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/wireless-mouse.png`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/usb-c-hub.png`
- Reuse: `apps/api/src/modules/catalog/infrastructure/seeds/assets/over-ear-headphones.png`
- Delete after fixture references are migrated: the eleven superseded non-technology PNG files in `apps/api/src/modules/catalog/infrastructure/seeds/assets/`; verify the exact tracked paths with `git ls-files` before removing them.
- Create: `apps/api/src/modules/inventory/infrastructure/seeds/inventory.seed.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/seeds/inventory.seed.integration.test.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/seeds/run-inventory-seed.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/server.ts`
- Modify: `.env.example`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/keycloak/realm-export.json`
- Modify: `Makefile`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces: `seedInventory(transactions)` and `pnpm --filter @opendx/api db:seed:inventory`.
- Migration order: Catalog, Company Core, Inventory; rollback order: Inventory, Company Core, Catalog.
- Seed order: Company Core, Catalog, Inventory.
- Local Inventory Manager: `inventory@novacommerce.example` with the local-only temporary realm password `opendx_inventory_change_me`; `.env.example` names it as `KEYCLOAK_DEV_INVENTORY_PASSWORD` for contributor discovery.

- [x] **Step 1: Write failing deterministic seed tests**

```ts
it("seeds a technology assortment and explanatory inventory exactly once", async () => {
  await seedCatalog(transactions, storage);
  await seedInventory(transactions);
  await seedCatalog(transactions, storage);
  await seedInventory(transactions);
  const categories = await pool.query("SELECT slug FROM categories WHERE status = 'active' ORDER BY slug");
  expect(categories.rows.map(({ slug }) => slug)).toEqual([
    "accessories", "computer-components", "laptops", "phones", "smart-watches", "tablets",
  ]);
  expect(Number((await pool.query("SELECT count(*) FROM inventory_items")).rows[0].count)).toBeGreaterThanOrEqual(12);
  expect(Number((await pool.query("SELECT count(*) FROM stock_movements WHERE movement_type = 'receive'")).rows[0].count))
    .toBe(Number((await pool.query("SELECT count(*) FROM inventory_items")).rows[0].count));
  expect(Number((await pool.query("SELECT count(*) FROM products WHERE status = 'published'")).rows[0].count)).toBeGreaterThan(0);
});
```

- [x] **Step 2: Run seed tests and verify failure**

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:${POSTGRES_PORT:-5432}/opendx_test MINIO_ENDPOINT=http://localhost:9000 MINIO_ACCESS_KEY=opendx_minio MINIO_SECRET_KEY=opendx_minio_password MINIO_BUCKET=product-media-test pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts src/modules/catalog/infrastructure/seeds/catalog.seed.integration.test.ts src/modules/inventory/infrastructure/seeds/inventory.seed.integration.test.ts`

Expected: FAIL because technology and Inventory fixtures are absent.

- [x] **Step 3: Implement deterministic technology fixtures without deleting user data**

Use stable UUIDs and repository-owned or generated technology images. On fresh
databases seed the six approved categories and at least twelve products with
active variants, VND prices, primary media, initialized inventory, and mixed
healthy/low/sold-out quantities. Upsert only known fixture IDs; archive legacy
general-merchandise fixture IDs only when their seed marker is present. Never
delete or overwrite rows outside the deterministic fixture ID set. Use stable
movement idempotency keys such as `seed:inventory:<variant-id>` and publish only
fixture products that meet the backend publication policy.

- [x] **Step 4: Wire migration, rollback, seed, health, and role fixtures**

Add module-local scripts:

```json
{
  "db:migrate:inventory": "node-pg-migrate up -j ts -m src/modules/inventory/infrastructure/database/migrations -t inventory_migrations --check-order",
  "db:rollback:inventory": "node-pg-migrate down 1 -j ts -m src/modules/inventory/infrastructure/database/migrations -t inventory_migrations --check-order",
  "db:seed:inventory": "tsx src/modules/inventory/infrastructure/seeds/run-inventory-seed.ts"
}
```

Update aggregate scripts with the exact dependency order. Make API readiness
require at least two Catalog migrations, one Company Core migration, and one
Inventory migration. Add the Inventory environment values to the Compose API
anchor and `.env.example`. Add `inventory_manager` and its local user to the
Keycloak realm. Keep the current Make target names and make `db-rollback`
delegate to the corrected aggregate rollback.

- [x] **Step 5: Validate repeat seed and Compose configuration**

Run: `pnpm --filter @opendx/api test:integration`

Run: `docker compose -f infra/docker/docker-compose.yml config --quiet`

Run twice: `make db-seed`

Expected: all tests and Compose validation pass; the second seed reports no
duplicate-key failure and leaves fixture counts unchanged.

- [x] **Step 6: Commit seed and operations wiring**

```bash
git add apps/api .env.example infra/docker/docker-compose.yml infra/keycloak/realm-export.json Makefile CHANGELOG.md
git commit -m "feat(inventory): seed technology stock fixtures"
```

### Task 7: Inventory Console Workspace

**Files:**

- Create: `apps/console/src/features/inventory/types/inventory.types.ts`
- Create: `apps/console/src/features/inventory/schemas/inventory-api.schema.ts`
- Create: `apps/console/src/features/inventory/mappers/inventory.mapper.ts`
- Create: `apps/console/src/features/inventory/api/inventory-api.ts`
- Create: `apps/console/src/features/inventory/hooks/use-inventory.ts`
- Create: `apps/console/src/features/inventory/components/inventory-table.tsx`
- Create: `apps/console/src/features/inventory/components/inventory-detail-panel.tsx`
- Create: `apps/console/src/features/inventory/components/stock-mutation-dialog.tsx`
- Create: `apps/console/src/features/inventory/pages/inventory-page.tsx`
- Create: `apps/console/src/features/inventory/tests/inventory-page.test.tsx`
- Create: `apps/console/src/features/inventory/index.ts`
- Modify: `apps/console/src/features/authentication/api/oidc-manager.ts`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/app/console-shell.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces: `InventoryApi.listItems`, `.getItem`, `.receive`, `.adjust`, and `.listMovements` with runtime-validated response schemas.
- Produces: `/inventory` protected console route and role-aware navigation.
- Consumes: Phase 4 staff inventory HTTP DTOs from Task 5, mapped into frontend-owned view models.

- [x] **Step 1: Write failing page tests for every user-visible state**

```tsx
it("shows balances and opens movement history", async () => {
  const client = inventoryApi({ listItems: vi.fn(async () => pageOf(item({ onHand: 8, reserved: 3, available: 5 }))) });
  render(<InventoryPage api={client} roles={["inventory_manager"]} />);
  expect(await screen.findByText("TECH-PHONE-BLACK")).toBeVisible();
  expect(screen.getByText("5 available")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /view tech-phone-black/i }));
  expect(await screen.findByRole("heading", { name: /movement history/i })).toBeVisible();
});

it("requires a reason and preserves entered values after a recoverable error", async () => {
  const client = inventoryApi({ adjust: vi.fn(async () => { throw new InventoryApiError("STALE_VERSION", "Refresh required"); }) });
  render(<InventoryPage api={client} roles={["inventory_manager"]} />);
  await openAdjustment();
  await userEvent.type(screen.getByLabelText("Quantity change"), "-2");
  await userEvent.click(screen.getByRole("button", { name: /save adjustment/i }));
  expect(screen.getByText(/reason is required/i)).toBeVisible();
});
```

Add explicit tests for loading, empty, network error with retry, low stock,
sold out, forbidden mutation controls, receipt success, adjustment success,
pagination, and filter URL state.

- [x] **Step 2: Run the console test and verify failure**

Run: `pnpm --filter @opendx/console exec vitest run src/features/inventory/tests/inventory-page.test.tsx src/app/console-shell.test.tsx`

Expected: FAIL because the Inventory feature and navigation do not exist.

- [x] **Step 3: Implement the validated API boundary and feature state**

Define exact frontend view models:

```ts
export interface InventoryItemView {
  readonly id: string;
  readonly variantId: string;
  readonly productName: string;
  readonly variantTitle: string;
  readonly sku: string;
  readonly primaryMediaUrl?: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly stockStatus: "healthy" | "low" | "out_of_stock";
  readonly version: number;
}
```

Parse every response with Zod before mapping. Keep fetch calls outside
components. The hook owns query/filter/pagination, aborts stale requests, and
reloads after successful mutations. Do not add a state library.

- [x] **Step 4: Implement the dense responsive workspace**

Add an Inventory link with a `Boxes` Lucide icon. Show the approved compact
table at desktop widths and labeled stacked rows below the existing mobile
breakpoint. Use a side panel for balance and paginated movements. Receipt and
adjustment dialogs use existing buttons, inputs, surfaces, hairlines, focus
rings, and no gradients. Status always includes visible text or icon plus an
accessible label; success and error messages use `role="status"` or
`role="alert"`.

- [x] **Step 5: Run console tests, typecheck, and build**

Run: `pnpm --filter @opendx/console test`

Run: `pnpm --filter @opendx/console typecheck`

Run: `pnpm --filter @opendx/console build`

Expected: PASS.

- [x] **Step 6: Commit the Inventory console feature**

```bash
git add apps/console/src CHANGELOG.md
git commit -m "feat(console): add inventory workspace"
```

### Task 8: Catalog Publication Controls in the Existing Editor

**Files:**

- Modify: `apps/console/src/features/catalog/types/catalog.types.ts`
- Modify: `apps/console/src/features/catalog/schemas/catalog-api.schema.ts`
- Modify: `apps/console/src/features/catalog/mappers/catalog.mapper.ts`
- Modify: `apps/console/src/features/catalog/api/catalog-api.ts`
- Modify: `apps/console/src/features/catalog/hooks/use-product-editor.ts`
- Create: `apps/console/src/features/catalog/components/publication-panel.tsx`
- Create: `apps/console/src/features/catalog/tests/publication-panel.test.tsx`
- Modify: `apps/console/src/features/catalog/components/product-table.tsx`
- Modify: `apps/console/src/features/catalog/pages/product-editor-page.tsx`
- Modify: `apps/console/src/features/catalog/tests/product-editor-page.test.tsx`
- Modify: `apps/console/src/features/catalog/tests/product-list-page.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Extends product status to `draft | published | archived`.
- Produces: `CatalogApi.checkPublicationReadiness(id)`, `.publishProduct(id, version)`, and `.unpublishProduct(id, version)`.
- Readiness fields: `{ ready: boolean; missing: readonly PublicationRequirement[] }` where requirements are `ACTIVE_CATEGORY | ACTIVE_VARIANT | CURRENT_PRICE | PRIMARY_IMAGE | INVENTORY_ITEM`.

- [ ] **Step 1: Write failing publication component tests**

```tsx
it("lists every missing publication requirement", async () => {
  render(<PublicationPanel product={draftProduct} readiness={{
    ready: false,
    missing: ["CURRENT_PRICE", "PRIMARY_IMAGE", "INVENTORY_ITEM"],
  }} canPublish={true} onPublish={vi.fn()} onUnpublish={vi.fn()} />);
  expect(screen.getByText("Current VND price")).toBeVisible();
  expect(screen.getByText("Primary image with alt text")).toBeVisible();
  expect(screen.getByText("Initialized inventory")).toBeVisible();
  expect(screen.getByRole("button", { name: "Publish product" })).toBeDisabled();
});

it("shows published sold-out state without unpublishing", () => {
  render(<ProductStatus status="published" available={0} />);
  expect(screen.getByText("Published · Out of stock")).toBeVisible();
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @opendx/console exec vitest run src/features/catalog/tests/publication-panel.test.tsx src/features/catalog/tests/product-editor-page.test.tsx src/features/catalog/tests/product-list-page.test.tsx`

Expected: FAIL because publication UI contracts are absent.

- [ ] **Step 3: Extend validated Catalog transport and editor state**

Add Zod schemas for `published`, readiness, availability summary, and the
publish/unpublish response envelopes. Map API errors to stable messages without
showing backend details. Load readiness after product, variants, prices, and
media; reload it after any editor mutation. Send the current product version on
publish/unpublish and handle `STALE_VERSION` with the existing refresh copy.

- [ ] **Step 4: Implement publication UI using existing Catalog layout**

Add Publication as one focused editor panel or tab, not a new page hierarchy.
Show a checklist with passed/missing labels, one primary Publish action, and a
confirmed Unpublish action. Product tables show `Draft`, `Published`, and
`Published · Out of stock`; search/filter state accepts the new published
status. Hide mutation controls for roles outside `administrator` and
`catalog_manager`, while backend enforcement remains authoritative.

- [ ] **Step 5: Run all console checks**

Run: `pnpm --filter @opendx/console test`

Run: `pnpm --filter @opendx/console typecheck`

Run: `pnpm --filter @opendx/console build`

Expected: PASS.

- [ ] **Step 6: Commit publication controls**

```bash
git add apps/console/src CHANGELOG.md
git commit -m "feat(console): add product publication controls"
```

### Task 9: API, Operations, Architecture, and Roadmap Documentation

**Files:**

- Create: `docs/api/inventory.md`
- Create: `docs/api/storefront-catalog.md`
- Modify: `docs/api/catalog.md`
- Modify: `docs/development/catalog-local-environment.md`
- Modify: `docs/development/database-operations.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `infra/docker/README.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Documents the exact implemented routes, roles, environment values, migration
  order, seed/reset behavior, expiry worker, health checks, errors, and direct
  command equivalents.
- Changes Phase 4 status only after Task 10 proves the exit gate.

- [ ] **Step 1: Write the API contracts from implemented validators and DTOs**

Document receipt, adjustment, inventory list/detail/movements, publication,
public categories/list/detail/media, pagination, role matrix, success examples,
and each stable error. Include a sold-out example:

```json
{
  "id": "variant-phone-black",
  "sku": "TECH-PHONE-BLACK",
  "price": { "amountMinor": 19990000, "currency": "VND" },
  "availableQuantity": 0,
  "purchasable": false
}
```

- [ ] **Step 2: Document operations with exact direct commands**

Record Catalog → Company Core → Inventory migration order, inverse rollback,
Company Core → Catalog → Inventory seed order, 900-second TTL, 30-second expiry
scan, Inventory Manager local login, PostgreSQL-only runtime, backup/restore
coverage, and Docker health behavior. Remove the stale `TEMPORAL_ADDRESS` sample
from `.env.example` if it remains unused after Task 6; do not add Temporal to
Compose.

- [ ] **Step 3: Update architecture and project structure to implemented facts**

Record the Inventory module and console feature only after their source exists.
Document Catalog-to-Inventory public port direction and anonymous storefront
read boundary. Do not document `apps/storefront` as implemented.

- [ ] **Step 4: Run documentation governance checks**

Run: `git diff --check`

Run: `pnpm audit:repo`

Expected: PASS.

- [ ] **Step 5: Commit contributor documentation**

```bash
git add README.md docs infra/docker/README.md CHANGELOG.md
git commit -m "docs(inventory): document phase 4 operations"
```

### Task 10: Full Acceptance, Review, and Phase Exit

**Files:**

- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`
- Modify only if a failure proves necessary: files already owned by Tasks 1-9

**Interfaces:**

- Consumes every Phase 4 capability.
- Produces final clean-checkout evidence and the Phase 4 exit decision.

- [ ] **Step 1: Run repository and workspace validation**

Run: `git diff --check`

Run: `pnpm check`

Expected: TypeScript lint/typecheck, unit tests, console production build,
Python test, repository audit, and Docker Compose configuration all PASS.

- [ ] **Step 2: Run the isolated infrastructure matrix**

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:${POSTGRES_PORT:-5432}/opendx_test MINIO_ENDPOINT=http://localhost:9000 MINIO_ACCESS_KEY=opendx_minio MINIO_SECRET_KEY=opendx_minio_password MINIO_BUCKET=product-media-test pnpm --filter @opendx/api test:integration`

Expected: migration up/down, repository, seed, API, MinIO, expiry race, and
reservation concurrency tests PASS; the no-oversell assertion records exactly
the available quantity as successful.

- [ ] **Step 3: Demonstrate full-container behavior from source**

Run: `make check`

Run: `make up`

Run: `docker compose -f infra/docker/docker-compose.yml ps`

Expected: PostgreSQL, Keycloak, MinIO, API, and console are healthy; migrate,
MinIO bootstrap, and seed jobs completed successfully.

- [ ] **Step 4: Execute the acceptance chain through real HTTP and console**

Verify all 15 spec acceptance steps: Inventory Manager login, receipt,
reasoned adjustment, audit/movement explanation, publication readiness,
publication, anonymous public read, concurrent reservations, one-time
release/expiry/consume, sold-out visibility, automatic purchasability after
restock, backup/restore, responsive desktop/mobile UI, and volume-preserving
shutdown. Save command counts and observed HTTP status/error codes in the
roadmap evidence; never record access tokens or passwords.

- [ ] **Step 5: Request code review and address only verified findings**

Use `superpowers:requesting-code-review` with the spec path, this plan path,
commit range from `125e987` to `HEAD`, risk areas (row locking, idempotency,
authorization, public-field leakage, expiry races), and the exact validation
commands. Apply accepted findings through focused failing tests and atomic fix
commits.

- [ ] **Step 6: Mark Phase 4 complete only after all evidence passes**

Change the roadmap table to:

```text
Phase 4: Inventory and Product Publication | Complete |
docs/superpowers/specs/2026-08-05-inventory-product-publication-design.md |
docs/superpowers/plans/2026-08-05-inventory-product-publication.md |
Complete after oversell, publication, public-read, Docker, and full validation
```

Add the exact test counts and acceptance evidence under Latest Validation
Evidence. If any required command is unavailable or failing, leave Phase 4 in
progress and record the unresolved risk instead of claiming completion.

- [ ] **Step 7: Commit the verified phase exit**

```bash
git add docs/roadmap/mvp-status.md CHANGELOG.md
git commit -m "docs(roadmap): record phase 4 completion"
```

- [ ] **Step 8: Stop the local stack without deleting volumes**

Run: `make down`

Expected: containers stop; named PostgreSQL and MinIO volumes remain present.

---

## Phase 4 Completion Gate

Do not start Phase 5 brainstorming until all of these statements have fresh
evidence:

- Authorized staff can initialize, receive, adjust, inspect, publish, and
  unpublish through PostgreSQL-backed API and console workflows.
- Every balance change has exactly one explanatory movement and required audit.
- Parallel reservation tests cannot oversell one SKU.
- Fifteen-minute expiry, release, and consumption are atomic and idempotent.
- Anonymous public reads expose published technology products and safe fields.
- Sold-out published products remain visible and cannot be purchased.
- Restock changes purchasability without republishing.
- Migrations roll back, seeds repeat, backup/restore preserves Inventory data,
  full-container health succeeds, and `pnpm check` plus `make check` pass.
