<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Product Shortcut Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Storefront discovery shortcuts use authoritative catalog, order, inventory, and price-history data instead of placeholder catalog scroll links.

**Architecture:** Keep public product discovery owned by the Catalog module. Extend the existing public catalog query contract with `sort=best_selling` and `discountStatus=on_sale`; implement ranking/filtering in the PostgreSQL public catalog repository; keep Storefront as a thin query-parameter client.

**Tech Stack:** TypeScript, Express, Zod, PostgreSQL, Vitest, Testing Library, React, React Router, Vite.

## Global Constraints

- Scope is limited to the public Storefront product discovery path.
- Storefront taskbar links and filter/sort options are in scope.
- Public Catalog API query validation and DTO typing are in scope.
- Public Catalog application/repository behavior is in scope.
- PostgreSQL-backed product list queries are in scope.
- Tests and changelog updates are in scope.
- Admin catalog editing UX is out of scope.
- Checkout/order/payment state machines are out of scope.
- New promotion-code behavior is out of scope.
- Shipping, refunds, returns, marketplace, and multi-warehouse behavior are out of scope.
- Do not calculate sales ranking in frontend code.
- `Sản phẩm mới` must use `products.created_at DESC, products.id`.
- `Bán chạy` must use all-time paid/successful order-line quantities.
- `Đang giảm` must use real product price history, not promotion codes.
- Update `CHANGELOG.md` under `[Unreleased]`.

---

## File Structure

- Modify `apps/api/src/modules/catalog/application/dtos/requests/public-catalog-request.dto.ts`
  - Extends the public product list query type.
- Modify `apps/api/src/modules/catalog/presentation/validators/public-catalog.validator.ts`
  - Parses and rejects new query values at the HTTP boundary.
- Modify `apps/api/src/modules/catalog/tests/public-catalog.api.test.ts`
  - Covers public API validation/forwarding for new query values.
- Modify `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`
  - Owns authoritative SQL for newest, best-selling, and on-sale discovery.
- Modify `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts`
  - Covers PostgreSQL ordering/filter semantics.
- Modify `apps/storefront/src/app/storefront-shell.tsx`
  - Changes taskbar links for `Bán chạy` and `Đang giảm`.
- Modify `apps/storefront/src/app/storefront-shell.test.tsx`
  - Covers taskbar query targets.
- Modify `apps/storefront/src/features/catalog/components/catalog-filters.tsx`
  - Adds `Bán chạy` sort option and `Đang giảm` filter option.
- Modify `apps/storefront/src/features/catalog/components/discovery-sidebar.tsx`
  - No route behavior changes expected; it reuses `CatalogFilters`. Inspect only unless tests prove otherwise.
- Modify `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`
  - Covers filter form emits `sort=best_selling` and `discountStatus=on_sale`.
- Modify `CHANGELOG.md`
  - Records the user-visible behavior change.

No new dependencies and no new directories.

---

### Task 1: Public Catalog query contract

**Files:**
- Modify: `apps/api/src/modules/catalog/application/dtos/requests/public-catalog-request.dto.ts`
- Modify: `apps/api/src/modules/catalog/presentation/validators/public-catalog.validator.ts`
- Modify: `apps/api/src/modules/catalog/tests/public-catalog.api.test.ts`

**Interfaces:**
- Consumes:
  - Existing `parsePublicProductList(value: unknown): PublicProductListQuery`.
  - Existing public endpoint `GET /v1/storefront/products`.
- Produces:
  - `PublicProductListQuery["sort"]` includes `"best_selling"`.
  - `PublicProductListQuery` includes optional `discountStatus?: "on_sale"`.
  - HTTP query parser accepts `sort=best_selling&discountStatus=on_sale`.

- [ ] **Step 1: Write failing API validator test**

In `apps/api/src/modules/catalog/tests/public-catalog.api.test.ts`, update the first test to call the new query values:

```ts
await request(app)
  .get("/v1/storefront/products?query=phone&category=phones&minPriceVnd=1000000&maxPriceVnd=20000000&stockStatus=in_stock&sort=best_selling&discountStatus=on_sale&page=2&pageSize=12")
  .expect(200);
expect(service.listProducts).toHaveBeenCalledWith({
  query: "phone",
  category: "phones",
  minPriceVnd: 1_000_000,
  maxPriceVnd: 20_000_000,
  stockStatus: "in_stock",
  sort: "best_selling",
  discountStatus: "on_sale",
  page: 2,
  pageSize: 12,
});
```

Keep the existing invalid sort assertion and add:

```ts
await request(app)
  .get("/v1/storefront/products?discountStatus=clearance")
  .expect(400);
```

- [ ] **Step 2: Run focused API test to verify RED**

Run:

```bash
pnpm --filter @opendx/api test -- public-catalog.api.test.ts
```

Expected: FAIL because `best_selling` and `discountStatus` are not accepted/forwarded.

- [ ] **Step 3: Extend query DTO**

In `apps/api/src/modules/catalog/application/dtos/requests/public-catalog-request.dto.ts`, change:

```ts
readonly sort?: "newest" | "price_asc" | "price_desc" | "name_asc";
```

to:

```ts
readonly discountStatus?: "on_sale";
readonly sort?: "newest" | "best_selling" | "price_asc" | "price_desc" | "name_asc";
```

- [ ] **Step 4: Extend Zod validator**

In `apps/api/src/modules/catalog/presentation/validators/public-catalog.validator.ts`, add `discountStatus` and `best_selling`:

```ts
discountStatus: z.enum(["on_sale"]).optional(),
sort: z.enum(["newest", "best_selling", "price_asc", "price_desc", "name_asc"]).default("newest"),
```

- [ ] **Step 5: Run focused API test GREEN**

Run:

```bash
pnpm --filter @opendx/api test -- public-catalog.api.test.ts
pnpm --filter @opendx/api typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add apps/api/src/modules/catalog/application/dtos/requests/public-catalog-request.dto.ts apps/api/src/modules/catalog/presentation/validators/public-catalog.validator.ts apps/api/src/modules/catalog/tests/public-catalog.api.test.ts
git commit -m "feat(catalog): accept storefront shortcut queries"
```

---

### Task 2: PostgreSQL public catalog ranking and discount filtering

**Files:**
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts`

**Interfaces:**
- Consumes:
  - `PublicProductListQuery.discountStatus?: "on_sale"`.
  - `PublicProductListQuery.sort?: "best_selling" | "newest" | "price_asc" | "price_desc" | "name_asc"`.
  - Existing PostgreSQL tables: `products`, `product_variants`, `product_prices`, `orders`, `order_lines`.
- Produces:
  - `newest` order uses `p.created_at DESC, p.id`.
  - `best_selling` order uses all-time paid/successful order-line quantity.
  - `discountStatus=on_sale` filters to products with at least one active variant whose current price is lower than its immediately previous price.

- [ ] **Step 1: Write failing newest integration test**

In `postgresql-public-catalog.repository.integration.test.ts`, add a test that inserts a second complete published product with older `created_at` but newer `updated_at`, then expects `sort:newest` to return the newly created product first.

Use deterministic IDs:

```ts
const newestIds = {
  oldProduct: "e2000000-0000-4000-8000-000000000010",
  newProduct: "e2000000-0000-4000-8000-000000000011",
  oldVariant: "e3000000-0000-4000-8000-000000000010",
  newVariant: "e3000000-0000-4000-8000-000000000011",
  oldPrice: "e4000000-0000-4000-8000-000000000010",
  newPrice: "e4000000-0000-4000-8000-000000000011",
  oldMedia: "e5000000-0000-4000-8000-000000000010",
  newMedia: "e5000000-0000-4000-8000-000000000011",
};
```

Insert both products with:

- old product: `created_at='2026-08-01T00:00:00.000Z'`, `updated_at='2026-08-10T00:00:00.000Z'`
- new product: `created_at='2026-08-09T00:00:00.000Z'`, `updated_at='2026-08-09T00:00:00.000Z'`

Run:

```ts
const page = await transactions.runReadOnly((session) =>
  repository.listProducts(session, { page: 1, pageSize: 10, sort: "newest" }),
);
expect(page.items.map((item) => item.id).indexOf(newestIds.newProduct))
  .toBeLessThan(page.items.map((item) => item.id).indexOf(newestIds.oldProduct));
```

- [ ] **Step 2: Write failing best-selling integration test**

In the same file, add a test that creates three complete products:

- Product A sold quantity 5 on qualifying `paid` order.
- Product B sold quantity 2 on qualifying `completed` order and quantity 99 on `canceled` order.
- Product C sold quantity 0.

Insert orders directly into `orders` and `order_lines` with valid required columns following `apps/api/src/modules/order/infrastructure/database/migrations/202608060009_create_order.ts`.

Assert:

```ts
const page = await transactions.runReadOnly((session) =>
  repository.listProducts(session, { page: 1, pageSize: 10, sort: "best_selling" }),
);
const ids = page.items.map((item) => item.id);
expect(ids.indexOf(productA)).toBeLessThan(ids.indexOf(productB));
expect(ids.indexOf(productB)).toBeLessThan(ids.indexOf(productC));
```

- [ ] **Step 3: Write failing on-sale integration test**

In the same file, add a test with two complete products:

- Sale product:
  - Previous price row for variant: `amount_minor=10_000_000`, `valid_from='2026-08-01T00:00:00.000Z'`, `valid_to='2026-08-05T00:00:00.000Z'`.
  - Current price row for same variant: `amount_minor=8_000_000`, `valid_from='2026-08-05T00:00:00.000Z'`, `valid_to=NULL`.
- Non-sale product:
  - Previous price row: `amount_minor=8_000_000`.
  - Current price row: `amount_minor=9_000_000`.

Assert:

```ts
const page = await transactions.runReadOnly((session) =>
  repository.listProducts(session, {
    page: 1,
    pageSize: 10,
    discountStatus: "on_sale",
  }),
);
expect(page.items.map((item) => item.id)).toContain(saleProduct);
expect(page.items.map((item) => item.id)).not.toContain(nonSaleProduct);
```

- [ ] **Step 4: Run integration tests to verify RED**

Run:

```bash
TEST_DATABASE_URL="${TEST_DATABASE_URL:?}" pnpm --filter @opendx/api test -- postgresql-public-catalog.repository.integration.test.ts
```

Expected: FAIL because `newest` still uses `updated_at`, `best_selling` is not implemented, and `discountStatus` is ignored.

- [ ] **Step 5: Implement SQL helpers in repository**

In `postgresql-public-catalog.repository.ts`, add SQL snippets near `completePublishedProduct`:

```ts
const qualifyingSalesStatuses = "('paid', 'processing', 'ready_for_fulfillment', 'completed')";

const currentPricePredicate = `current_price.valid_from <= NOW()
  AND (current_price.valid_to IS NULL OR current_price.valid_to > NOW())`;

const onSaleProductPredicate = `EXISTS (
  SELECT 1
  FROM product_variants sale_variant
  JOIN LATERAL (
    SELECT current_price.amount_minor, current_price.valid_from
    FROM product_prices current_price
    WHERE current_price.variant_id = sale_variant.id
      AND ${currentPricePredicate}
    ORDER BY current_price.valid_from DESC, current_price.id DESC
    LIMIT 1
  ) current_sale_price ON true
  JOIN LATERAL (
    SELECT previous_price.amount_minor
    FROM product_prices previous_price
    WHERE previous_price.variant_id = sale_variant.id
      AND previous_price.valid_from < current_sale_price.valid_from
    ORDER BY previous_price.valid_from DESC, previous_price.id DESC
    LIMIT 1
  ) previous_sale_price ON true
  WHERE sale_variant.product_id = p.id
    AND sale_variant.status = 'active'
    AND current_sale_price.amount_minor < previous_sale_price.amount_minor
)`;
```

- [ ] **Step 6: Apply on-sale filter**

Inside `listProducts`, after category/price filters, add:

```ts
if (query.discountStatus === "on_sale") {
  filters.push(onSaleProductPredicate);
}
```

- [ ] **Step 7: Implement authoritative order-by clauses**

Change `orderBy` in `listProducts` to:

```ts
const bestSellingQuantity = `COALESCE((
  SELECT sum(best_line.quantity)::bigint
  FROM order_lines best_line
  JOIN orders best_order ON best_order.id = best_line.order_id
  JOIN product_variants best_variant ON best_variant.id = best_line.variant_id
  WHERE best_variant.product_id = p.id
    AND best_order.status IN ${qualifyingSalesStatuses}
), 0)`;

const orderBy = query.sort === "price_asc"
  ? "minimum_price ASC, p.id"
  : query.sort === "price_desc"
    ? "minimum_price DESC, p.id"
    : query.sort === "name_asc"
      ? "lower(p.name) ASC, p.id"
      : query.sort === "best_selling"
        ? `${bestSellingQuantity} DESC, p.created_at DESC, p.id`
        : "p.created_at DESC, p.id";
```

Do not include untrusted user input in SQL fragments.

- [ ] **Step 8: Run integration tests GREEN**

Run:

```bash
TEST_DATABASE_URL="${TEST_DATABASE_URL:?}" pnpm --filter @opendx/api test -- postgresql-public-catalog.repository.integration.test.ts
pnpm --filter @opendx/api typecheck
```

Expected: both commands exit 0.

- [ ] **Step 9: Commit Task 2**

Run:

```bash
git add apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts
git commit -m "feat(catalog): rank storefront product shortcuts"
```

---

### Task 3: Storefront shortcut and filter UI

**Files:**
- Modify: `apps/storefront/src/app/storefront-shell.tsx`
- Modify: `apps/storefront/src/app/storefront-shell.test.tsx`
- Modify: `apps/storefront/src/features/catalog/components/catalog-filters.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes:
  - Public Catalog query values `sort=best_selling` and `discountStatus=on_sale`.
- Produces:
  - Taskbar links:
    - `Sản phẩm mới` -> `/?sort=newest#catalog`
    - `Bán chạy` -> `/?sort=best_selling#catalog`
    - `Đang giảm` -> `/?discountStatus=on_sale#catalog`
    - `Còn hàng` -> `/?stockStatus=in_stock#catalog`
  - Catalog filters can submit `sort=best_selling` and `discountStatus=on_sale`.

- [ ] **Step 1: Write failing Storefront shell test**

In `apps/storefront/src/app/storefront-shell.test.tsx`, change expected links:

```ts
expect(
  within(taskbar).getByRole("link", { name: "Bán chạy" }),
).toHaveAttribute("href", "/?sort=best_selling#catalog");
expect(
  within(taskbar).getByRole("link", { name: "Đang giảm" }),
).toHaveAttribute("href", "/?discountStatus=on_sale#catalog");
```

- [ ] **Step 2: Write failing catalog filter test**

In `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`, in the sidebar test after opening the sidebar, add:

```ts
await userEvent.selectOptions(
  within(sidebar).getByLabelText("Sắp xếp"),
  "best_selling",
);
await userEvent.selectOptions(
  within(sidebar).getByLabelText("Ưu đãi"),
  "on_sale",
);
await userEvent.click(
  within(sidebar).getByRole("button", { name: "Áp dụng" }),
);

await waitFor(() => expect(products).toHaveBeenCalledTimes(2));
const submitted = products.mock.calls[1]?.[0] as URLSearchParams;
expect(submitted.get("sort")).toBe("best_selling");
expect(submitted.get("discountStatus")).toBe("on_sale");
```

If this replaces the existing `stockStatus` assertion, keep a separate assertion in the first catalog test for `stockStatus` so current coverage remains.

- [ ] **Step 3: Run Storefront focused tests RED**

Run:

```bash
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx catalog-discovery.test.tsx
```

Expected: FAIL because links/options do not exist yet.

- [ ] **Step 4: Update taskbar links**

In `apps/storefront/src/app/storefront-shell.tsx`, change:

```tsx
<Link to="/#catalog" title="Sắp có dữ liệu bán chạy">
  Bán chạy
</Link>
<Link to="/#catalog" title="Sắp có dữ liệu khuyến mãi">
  Đang giảm
</Link>
```

to:

```tsx
<Link to="/?sort=best_selling#catalog">Bán chạy</Link>
<Link to="/?discountStatus=on_sale#catalog">Đang giảm</Link>
```

- [ ] **Step 5: Update CatalogFilters form**

In `apps/storefront/src/features/catalog/components/catalog-filters.tsx`, include `discountStatus` in the submitted keys:

```ts
for (const key of [
  "query",
  "category",
  "minPriceVnd",
  "maxPriceVnd",
  "stockStatus",
  "discountStatus",
  "sort",
  "pageSize",
]) {
```

Add an offer filter before `Sắp xếp`:

```tsx
<label>
  Ưu đãi
  <select
    name="discountStatus"
    defaultValue={parameters.get("discountStatus") ?? ""}
  >
    <option value="">Tất cả</option>
    <option value="on_sale">Đang giảm</option>
  </select>
</label>
```

Add the best-selling sort option:

```tsx
<option value="best_selling">Bán chạy</option>
```

- [ ] **Step 6: Update changelog**

Under `[Unreleased]`, add:

```markdown
- Back Storefront `Sản phẩm mới`, `Bán chạy`, and `Đang giảm` shortcuts with authoritative catalog, order, and price-history queries.
```

- [ ] **Step 7: Run Storefront focused tests GREEN**

Run:

```bash
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx catalog-discovery.test.tsx
pnpm --filter @opendx/storefront typecheck
```

Expected: both commands exit 0.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add apps/storefront/src/app/storefront-shell.tsx apps/storefront/src/app/storefront-shell.test.tsx apps/storefront/src/features/catalog/components/catalog-filters.tsx apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx CHANGELOG.md
git commit -m "feat(storefront): wire product shortcut filters"
```

---

### Task 4: Full validation and runtime check

**Files:**
- Inspect: files changed by Tasks 1-3.
- Possible modify: only files changed by Tasks 1-3 if validation exposes a concrete regression.

**Interfaces:**
- Consumes:
  - API query contract and SQL behavior from Tasks 1-2.
  - Storefront query links/forms from Task 3.
- Produces:
  - Verified branch with local stack rebuilt and browser checks passed.

- [ ] **Step 1: Run focused combined checks**

Run:

```bash
pnpm --filter @opendx/api test -- public-catalog.api.test.ts postgresql-public-catalog.repository.integration.test.ts
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx catalog-discovery.test.tsx
```

Expected: both commands exit 0.

- [ ] **Step 2: Run workspace build/type checks**

Run:

```bash
pnpm --filter @opendx/api typecheck
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
```

Expected: all commands exit 0.

- [ ] **Step 3: Rebuild and run local stack**

Run:

```bash
make up
```

Expected: Docker Compose exits 0 and reports API, Console, and Storefront healthy.

- [ ] **Step 4: Run Storefront browser check**

Run:

```bash
pnpm check:storefront-browser
```

Expected:

- `hasMain` is `true`.
- `alertText` is `null`.
- Product count is non-zero.
- No viewport has `documentWidth` greater than `viewportWidth`.

- [ ] **Step 5: Run repository final checks**

Run:

```bash
git diff --check
pnpm audit:repo
pnpm check
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit validation fix only if needed**

If Task 4 required code changes after earlier commits, stage only the concrete
files changed by the validation fix and commit. The allowed files for this
feature are:

- `apps/api/src/modules/catalog/application/dtos/requests/public-catalog-request.dto.ts`
- `apps/api/src/modules/catalog/presentation/validators/public-catalog.validator.ts`
- `apps/api/src/modules/catalog/tests/public-catalog.api.test.ts`
- `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`
- `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts`
- `apps/storefront/src/app/storefront-shell.tsx`
- `apps/storefront/src/app/storefront-shell.test.tsx`
- `apps/storefront/src/features/catalog/components/catalog-filters.tsx`
- `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`
- `CHANGELOG.md`

Example command when the validation fix changes only CSS-free Storefront form
behavior:

```bash
git add apps/storefront/src/features/catalog/components/catalog-filters.tsx apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx
git commit -m "fix(storefront): stabilize product shortcut discovery"
```

If no files changed, do not create an empty commit.
