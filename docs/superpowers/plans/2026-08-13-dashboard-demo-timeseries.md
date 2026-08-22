<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Dashboard Demo Time-Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate PostgreSQL with a safe deterministic local commerce fixture and replace the Console dashboard chart placeholders with authoritative period comparisons and daily charts.

**Architecture:** A development-only seed orchestrator in Reporting infrastructure inserts a coherent Customer → Cart → Checkout → Order → Payment fixture through one transaction and deterministic IDs. The existing Reporting repository gains read-only current/previous/daily facts, application mappers calculate safe comparison DTOs, and the Dashboard validates and renders those DTOs with native React SVG. Existing reporting endpoints, roles, module boundaries, and backend payment truth remain unchanged.

**Tech Stack:** TypeScript 7, Node.js 22, PostgreSQL 18 with `pg`, Express, React 19, Zod 4, Vitest, Testing Library, native SVG, Docker Compose.

## Global Constraints

- Implement the approved spec at `docs/superpowers/specs/2026-08-13-dashboard-demo-timeseries-design.md`.
- Work only on `phuong` or another feature branch based on `develop`; do not edit `main`.
- Keep PostgreSQL authoritative. Do not add hard-coded dashboard business results or fallback metrics in React.
- Keep the existing `/v1/admin/reporting/{commerce,products,customers,operations}` endpoints; do not add an analytics endpoint or service.
- Keep Reporting runtime persistence read-only. Only the development seed orchestrator may write cross-module fixture rows.
- Seed exactly 120 orders in the latest 30 local calendar days and 80 in the immediately preceding 30 days, anchored in `Asia/Ho_Chi_Minh`.
- Use deterministic demo UUIDs and upserts scoped to those IDs. Never delete, truncate, or update user-created rows.
- Run the whole demo seed in one PostgreSQL transaction and preserve safe-integer VND values.
- Count revenue and paid volume only from orders whose backend status and `paid_at` establish successful payment truth.
- Return explicit zero points for missing local dates; do not fill gaps in the browser.
- Return comparison changes in basis points; return `null` when the previous value is zero and current is positive, and `0` when both are zero.
- Use `Asia/Ho_Chi_Minh` calendar boundaries and an immediately preceding comparison range of equal length.
- Use native React SVG and existing dependencies only; do not add a chart library or change `docs/dependencies.md`.
- Preserve Administrator/Executive backend authorization and PII-free reporting DTOs.
- Preserve existing light/night themes, responsive breakpoints, accessible names, and non-color-only meaning.
- Add SPDX headers to every new license-capable file.
- Update `CHANGELOG.md` under `[Unreleased]` in the same unit as each implementation change.
- Follow red-green-refactor. Record the expected failure before implementation and run focused tests after each green step.

---

### Task 1: Deterministic PostgreSQL Dashboard Demo Seed

**Files:**
- Create: `apps/api/src/modules/reporting/infrastructure/seeds/dashboard-demo.seed.ts`
- Create: `apps/api/src/modules/reporting/infrastructure/seeds/run-dashboard-demo-seed.ts`
- Create: `apps/api/src/modules/reporting/infrastructure/seeds/dashboard-demo.seed.integration.test.ts`
- Modify: `apps/api/package.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `TransactionRunner` and `DatabaseSession` from `apps/api/src/shared/database/transaction.ts`; existing Catalog fixture variants and their current VND prices; existing migrated Customer, Cart, Checkout, Order, and Payment tables.
- Produces: `seedDashboardDemo(transactions: TransactionRunner, now?: () => Date): Promise<void>` and the `db:seed:dashboard-demo` package script. `db:seed:all` invokes it after Company Core, Catalog, Inventory, and Promotion seeds.

- [ ] **Step 1: Write the failing real-PostgreSQL seed contract**

Create `dashboard-demo.seed.integration.test.ts`. Apply the full migration chain in `beforeAll`, insert one published catalog product/variant/current VND price fixture when the existing Catalog seed is not used, and clean only IDs from the dashboard-demo namespace in `afterEach`.

The first test must call the seed twice at the same injected instant and assert exact namespaced counts:

```ts
const anchor = new Date("2026-08-13T05:00:00.000Z");

await seedDashboardDemo(transactions, () => anchor);
await seedDashboardDemo(transactions, () => anchor);

const counts = await pool.query<{
  customers: string;
  carts: string;
  checkouts: string;
  orders: string;
  lines: string;
  payments: string;
}>(`
  SELECT
    (SELECT count(*) FROM customers WHERE id::text LIKE 'da100000-0000-4000-8000-%')::text AS customers,
    (SELECT count(*) FROM carts WHERE id::text LIKE 'da200000-0000-4000-8000-%')::text AS carts,
    (SELECT count(*) FROM checkout_sessions WHERE id::text LIKE 'da300000-0000-4000-8000-%')::text AS checkouts,
    (SELECT count(*) FROM orders WHERE id::text LIKE 'da400000-0000-4000-8000-%')::text AS orders,
    (SELECT count(*) FROM order_lines WHERE id::text LIKE 'da500000-0000-4000-8000-%')::text AS lines,
    (SELECT count(*) FROM payments WHERE id::text LIKE 'da600000-0000-4000-8000-%')::text AS payments
`);

expect(counts.rows[0]).toEqual({
  customers: "40",
  carts: "200",
  checkouts: "200",
  orders: "200",
  lines: "200",
  payments: "200",
});
```

Assert 120 demo orders fall in `[2026-07-14T17:00:00Z, 2026-08-13T17:00:00Z)` and 80 in the immediately preceding interval. Assert every demo order has one line and one payment, paid payments agree with paid order status/timestamp, public numbers satisfy the database constraint, and all amounts are safe positive VND integers.

- [ ] **Step 2: Add preservation and rollback regressions**

Insert a sentinel customer/order using IDs outside `da*`, run the seed twice with different anchor dates, and assert the sentinel values are byte-for-byte unchanged while namespaced timestamps move into the new windows.

For rollback, install a test-only PostgreSQL trigger that raises on insertion of a chosen `da600000-*` payment, call the seed, and assert rejection plus zero rows in every `da*` namespace. Drop the trigger in `finally` so the test never contaminates another case.

```ts
await expect(seedDashboardDemo(transactions, () => anchor)).rejects.toThrow();
expect(await demoRowCounts(pool)).toEqual({
  customers: 0,
  carts: 0,
  checkouts: 0,
  orders: 0,
  lines: 0,
  payments: 0,
});
```

- [ ] **Step 3: Run the seed test and confirm RED**

Run:

```bash
TEST_DATABASE_URL="${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to the disposable PostgreSQL test database}" pnpm --filter @opendx/api exec vitest run src/modules/reporting/infrastructure/seeds/dashboard-demo.seed.integration.test.ts
```

Expected: FAIL because `dashboard-demo.seed.ts` and `seedDashboardDemo` do not exist.

- [ ] **Step 4: Implement the deterministic fixture builder**

In `dashboard-demo.seed.ts`, expose constants only where tests need them and keep generation private:

```ts
export const DASHBOARD_DEMO_COUNTS = {
  customers: 40,
  currentOrders: 120,
  previousOrders: 80,
} as const;

export async function seedDashboardDemo(
  transactions: TransactionRunner,
  now: () => Date = () => new Date(),
): Promise<void> {
  const windows = resolveVietnamDemoWindows(now());
  await transactions.run(async (session) => {
    const variants = await loadPublishedVariants(session);
    if (variants.length === 0) {
      throw new Error("Dashboard demo seed requires a published priced Catalog variant");
    }
    await upsertCustomers(session, windows);
    await upsertOrders(session, variants, windows);
  });
}
```

Generate IDs by entity prefix plus a zero-padded sequence. Create 40 visibly named demo customers, with 24 `created_at` values in the current period and 16 in the previous period. Generate 200 deterministic records in dependency order:

1. customer;
2. one non-active `checkout_ready` cart per order;
3. checkout session and one checkout line;
4. order and one order line;
5. payment.

Use the order sequence to select customer, published variant, day offset, and
quantity. Distribute current orders with `sequence % 30` and previous orders
with `sequence % 30`, then use this exact ten-item outcome cycle:

```ts
const outcomes = [
  ["completed", "paid"],
  ["paid", "paid"],
  ["processing", "paid"],
  ["ready_for_fulfillment", "paid"],
  ["paid", "paid"],
  ["completed", "paid"],
  ["processing", "paid"],
  ["pending_payment", "pending_provider"],
  ["canceled", "canceled"],
  ["expired", "expired"],
] as const;
```

This yields 84 successfully paid current orders and 56 successfully paid prior
orders while retaining payment-state examples. Use noon local time plus a
bounded deterministic minute offset so timestamps never cross a local day. Set
`paid_at` only for successful paid truth.

Because Checkout and Order have a deliberate circular relationship, initially
upsert each checkout with `order_id = NULL`, insert/upsert its order using the
checkout ID, then update that same namespaced checkout by primary key to the
order ID. Keep the checkout status consistent with the outcome (`completed`
for paid truth, `order_created` for pending, and `canceled` or `expired` for
the matching terminal outcome).

Every `INSERT ... ON CONFLICT (id) DO UPDATE` must update only the deterministic
row addressed by the primary key. Do not use `ON CONFLICT` on customer email or
order public number. Never issue `DELETE` or `TRUNCATE` in production seed code.

- [ ] **Step 5: Add the runner and seed-chain script**

Create `run-dashboard-demo-seed.ts` following existing seed runners:

```ts
const environment = parseApiEnvironment(process.env);
const pool = createPostgresPool(environment);

try {
  await seedDashboardDemo(new PostgresTransactionRunner(pool));
  console.info("NovaCommerce dashboard demo seed completed.");
} finally {
  await pool.end();
}
```

Modify `apps/api/package.json`:

```json
"db:seed:dashboard-demo": "tsx src/modules/reporting/infrastructure/seeds/run-dashboard-demo-seed.ts",
"db:seed:all": "pnpm db:seed:company-core && pnpm db:seed:catalog && pnpm db:seed:inventory && pnpm db:seed:promotion && pnpm db:seed:dashboard-demo"
```

Add an `[Unreleased]` bullet to `CHANGELOG.md` describing the transaction-safe,
idempotent local dashboard fixture.

- [ ] **Step 6: Run GREEN and focused safety checks**

Run:

```bash
TEST_DATABASE_URL="${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to the disposable PostgreSQL test database}" pnpm --filter @opendx/api exec vitest run src/modules/reporting/infrastructure/seeds/dashboard-demo.seed.integration.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
pnpm audit:repo
```

Expected: seed integration tests PASS, API typecheck PASS, diff check clean, audit PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/api/src/modules/reporting/infrastructure/seeds apps/api/package.json CHANGELOG.md
git commit -m "feat(reporting): seed dashboard commerce activity"
```

---

### Task 2: Authoritative Period Comparisons and Daily Reporting Facts

**Files:**
- Modify: `apps/api/src/modules/reporting/application/dtos/reporting.dto.ts`
- Modify: `apps/api/src/modules/reporting/application/repositories/interfaces/reporting.repository.ts`
- Modify: `apps/api/src/modules/reporting/application/mappers/reporting.mapper.ts`
- Modify: `apps/api/src/modules/reporting/application/services/implementations/reporting.service.ts`
- Modify: `apps/api/src/modules/reporting/application/services/implementations/reporting.service.test.ts`
- Modify: `apps/api/src/modules/reporting/infrastructure/repositories/implementations/postgresql-reporting.repository.ts`
- Modify: `apps/api/src/modules/reporting/infrastructure/repositories/implementations/postgresql-reporting.repository.integration.test.ts`
- Modify: `apps/api/src/modules/reporting/tests/reporting.api.integration.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing `ReportingQueryRange`, current report endpoints, PostgreSQL orders/payments/customers, and the Task 1 fixture.
- Produces: extended `CommerceReportDto`, `CustomerReportDto`, `CommerceReportFacts`, and new `CustomerReportFacts`; unchanged service method names and endpoint paths.

- [ ] **Step 1: Define failing mapper/service expectations**

Extend the service fixture facts in `reporting.service.test.ts` and add tests for:

```ts
expect(result.data.comparison).toEqual({
  previousGrossPaidRevenueVnd: 80_000,
  previousPaidOrderCount: 8,
  previousAverageOrderValueVnd: 10_000,
  grossPaidRevenueChangeBasisPoints: 2500,
  paidOrderCountChangeBasisPoints: 2500,
  averageOrderValueChangeBasisPoints: 0,
});
expect(result.data.daily).toEqual([
  { date: "2026-08-01", grossPaidRevenueVnd: 0, paidOrderCount: 0 },
]);
```

Add the two zero-denominator cases: `(0, 0) -> 0` and `(positive, 0) -> null`.
Add a negative comparison case and assert it remains a safe signed integer.
For Customers, assert total lifetime count remains the headline while
`newCustomersInRange`, previous acquisition, change basis points, and daily
new-customer points are mapped.

- [ ] **Step 2: Run application tests and confirm RED**

Run:

```bash
pnpm --filter @opendx/api exec vitest run src/modules/reporting/application/services/implementations/reporting.service.test.ts
```

Expected: FAIL because comparison/daily facts and customer mapping do not exist.

- [ ] **Step 3: Extend DTO and inward repository contracts**

Add these exact public shapes in `reporting.dto.ts`:

```ts
export interface CommerceComparisonDto {
  readonly previousGrossPaidRevenueVnd: number;
  readonly previousPaidOrderCount: number;
  readonly previousAverageOrderValueVnd: number;
  readonly grossPaidRevenueChangeBasisPoints: number | null;
  readonly paidOrderCountChangeBasisPoints: number | null;
  readonly averageOrderValueChangeBasisPoints: number | null;
}

export interface CommerceDailyPointDto {
  readonly date: string;
  readonly grossPaidRevenueVnd: number;
  readonly paidOrderCount: number;
}

export interface CustomerDailyPointDto {
  readonly date: string;
  readonly newCustomerCount: number;
}
```

Extend `CommerceReportDto` with `comparison` and `daily`. Extend
`CustomerReportDto` with `newCustomersInRange`,
`previousNewCustomersInRange`, `newCustomersChangeBasisPoints`, and
`dailyNewCustomers`.

In `reporting.repository.ts`, keep current facts and add previous/daily facts:

```ts
export interface CommerceReportFacts {
  readonly grossPaidRevenueVnd: number;
  readonly paidOrderCount: number;
  readonly createdOrderCount: number;
  readonly paidCreatedOrderCount: number;
  readonly previousGrossPaidRevenueVnd: number;
  readonly previousPaidOrderCount: number;
  readonly daily: readonly CommerceDailyPointDto[];
  readonly paymentStatuses: readonly PaymentStatusCountDto[];
}

export interface CustomerReportFacts {
  readonly totalRegisteredCustomers: number;
  readonly repeatCustomers: number;
  readonly lifetimeValueVnd: number;
  readonly lifetimeValueBuckets: readonly LifetimeValueBucketDto[];
  readonly newCustomersInRange: number;
  readonly previousNewCustomersInRange: number;
  readonly dailyNewCustomers: readonly CustomerDailyPointDto[];
}
```

Change `getCustomers` to return `Promise<CustomerReportFacts>`.

- [ ] **Step 4: Implement safe application mapping**

Export `mapCustomerReport` beside `mapCommerceReport`. Add one signed comparison helper:

```ts
function changeBasisPoints(current: number, previous: number): number | null {
  assertNonNegativeSafeInteger(current);
  assertNonNegativeSafeInteger(previous);
  if (previous === 0) return current === 0 ? 0 : null;
  const numerator = BigInt(current - previous) * 10_000n;
  const rounded = divideSignedHalfAwayFromZero(numerator, BigInt(previous));
  const value = Number(rounded);
  assertSignedSafeInteger(value);
  return value;
}
```

Calculate both current and previous AOV with existing integer half-up division.
Validate every fact, date string, count, and monetary total before producing
DTOs. Do not pass negative comparisons through the existing non-negative
recursive validator. Update `ReportingService.getCustomers` to call
`mapCustomerReport`; Products and Operations retain `assertReportingDtoSafe`.

- [ ] **Step 5: Run application GREEN**

Run the Task 2 service test again. Expected: PASS, including positive, negative,
zero, null, safe-integer, and customer-acquisition cases.

- [ ] **Step 6: Write failing PostgreSQL daily/previous-period tests**

Extend `postgresql-reporting.repository.integration.test.ts` with rows on both
sides of Vietnam-local midnight and with gaps between paid days. Query a
three-day half-open current range and assert:

```ts
expect(commerce.daily).toEqual([
  { date: "2026-08-01", grossPaidRevenueVnd: 32_990_000, paidOrderCount: 1 },
  { date: "2026-08-02", grossPaidRevenueVnd: 0, paidOrderCount: 0 },
  { date: "2026-08-03", grossPaidRevenueVnd: 9_990_000, paidOrderCount: 1 },
]);
expect(commerce.previousGrossPaidRevenueVnd).toBe(expectedPreviousRevenue);
expect(commerce.previousPaidOrderCount).toBe(expectedPreviousPaidOrders);
```

Add customer assertions for exact current/prior `created_at` boundaries and
zero-filled daily acquisition. Include pending/failed payments and unpaid
orders and prove they never enter paid revenue or volume. Retain the existing
million-row query-plan protection and include the new daily queries in its
bounded plan checks.

- [ ] **Step 7: Run repository tests and confirm RED**

Run:

```bash
TEST_DATABASE_URL="${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to the disposable PostgreSQL test database}" pnpm --filter @opendx/api exec vitest run src/modules/reporting/infrastructure/repositories/implementations/postgresql-reporting.repository.integration.test.ts
```

Expected: FAIL because the repository returns neither previous-period nor daily facts.

- [ ] **Step 8: Implement bounded PostgreSQL aggregation**

Derive the previous range in SQL from the two current instant parameters:

```sql
$1::timestamptz - ($2::timestamptz - $1::timestamptz)
```

Use one `generate_series` CTE per daily query:

```sql
WITH days AS (
  SELECT generate_series(
    ($1::timestamptz AT TIME ZONE $3)::date,
    (($2::timestamptz AT TIME ZONE $3)::date - 1),
    interval '1 day'
  )::date AS day
), paid AS (
  SELECT (paid_at AT TIME ZONE $3)::date AS day,
         COALESCE(SUM(total_vnd), 0)::text AS revenue,
         COUNT(*)::text AS count
  FROM orders
  WHERE paid_at >= $1 AND paid_at < $2
    AND status IN ('paid','processing','ready_for_fulfillment','completed')
  GROUP BY 1
)
SELECT days.day::text AS date,
       COALESCE(paid.revenue, '0') AS revenue,
       COALESCE(paid.count, '0') AS count
FROM days LEFT JOIN paid USING (day)
ORDER BY days.day
```

Pass `range.timezone` as `$3`; do not interpolate it into SQL. Add equivalent
zero-filled customer registration aggregation. Parse all PostgreSQL `bigint`
text through `parseSafeInteger`. Keep the method bounded to a constant number
of queries independent of day count.

- [ ] **Step 9: Extend API contract tests**

Update reporting service fakes in `reporting.api.integration.test.ts` and assert
the unchanged `/v1/admin/reporting/commerce` and `/customers` routes serialize
the nested comparison/daily fields for Administrator and Executive roles.
Retain tests proving unauthorized roles invoke no reporting service and receive
no records or PII.

- [ ] **Step 10: Run Task 2 GREEN and commit**

Add an `[Unreleased]` changelog bullet for authoritative prior-period and daily
reporting. Then run:

```bash
pnpm --filter @opendx/api exec vitest run src/modules/reporting/application/services/implementations/reporting.service.test.ts src/modules/reporting/tests/reporting.api.integration.test.ts
TEST_DATABASE_URL="${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to the disposable PostgreSQL test database}" pnpm --filter @opendx/api exec vitest run src/modules/reporting/infrastructure/repositories/implementations/postgresql-reporting.repository.integration.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
pnpm audit:repo
git add apps/api/src/modules/reporting CHANGELOG.md
git commit -m "feat(reporting): expose dashboard time series"
```

Expected: focused unit/API/PostgreSQL suites PASS, typecheck/audit PASS, clean diff check, atomic commit created.

---

### Task 3: Dashboard KPI Trends and Native SVG Charts

**Files:**
- Create: `apps/console/src/features/dashboard/components/metric-sparkline.tsx`
- Create: `apps/console/src/features/dashboard/components/revenue-trend-chart.tsx`
- Create: `apps/console/src/features/dashboard/components/paid-order-volume-chart.tsx`
- Modify: `apps/console/src/features/dashboard/components/metric-card.tsx`
- Modify: `apps/console/src/features/dashboard/components/commerce-summary.tsx`
- Modify: `apps/console/src/features/dashboard/pages/dashboard-page.tsx`
- Modify: `apps/console/src/features/dashboard/types/dashboard.types.ts`
- Modify: `apps/console/src/features/dashboard/schemas/dashboard-api.schema.ts`
- Modify: `apps/console/src/features/dashboard/mappers/dashboard.mapper.ts`
- Modify: `apps/console/src/features/dashboard/tests/dashboard-page.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 2 `CommerceReportDto` and `CustomerReportDto` response shapes through the existing Dashboard API.
- Produces: validated `CommerceReportView`/`CustomerReportView`, `MetricSparkline`, `RevenueTrendChart`, and `PaidOrderVolumeChart`; `DashboardPage` no longer uses chart placeholders.

- [ ] **Step 1: Extend the frontend fixture and write RED schema/UI tests**

Extend `view` in `dashboard-page.test.tsx` with exact comparison and daily data:

```ts
comparison: {
  previousGrossPaidRevenueVnd: 48_000_000,
  previousPaidOrderCount: 2,
  previousAverageOrderValueVnd: 24_000_000,
  grossPaidRevenueChangeBasisPoints: 3333,
  paidOrderCountChangeBasisPoints: 5000,
  averageOrderValueChangeBasisPoints: -1111,
},
daily: [
  { date: "2026-08-07", grossPaidRevenueVnd: 0, paidOrderCount: 0 },
  { date: "2026-08-08", grossPaidRevenueVnd: 32_000_000, paidOrderCount: 1 },
  { date: "2026-08-09", grossPaidRevenueVnd: 64_000_000, paidOrderCount: 2 },
],
```

Add customer acquisition facts and assert:

```ts
expect(screen.getByRole("img", { name: "Revenue trend" })).toBeVisible();
expect(screen.getByRole("img", { name: "Paid order volume" })).toBeVisible();
expect(screen.getByRole("table", { name: "Revenue trend data" })).toBeInTheDocument();
expect(screen.getByRole("table", { name: "Paid order volume data" })).toBeInTheDocument();
expect(screen.getByText("+33,33%")).toBeVisible();
expect(screen.getByText("-11,11%")).toBeVisible();
expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
expect(screen.queryByText("Order volume by channel")).not.toBeInTheDocument();
```

Add cases for `null` rendering as “New in period,” all-zero daily paid values
rendering “No paid activity in this range,” and an invalid/missing daily API
shape producing `INVALID_RESPONSE` in `dashboard-api` behavior.

- [ ] **Step 2: Run Console tests and confirm RED**

Run:

```bash
pnpm --filter @opendx/console exec vitest run src/features/dashboard/tests/dashboard-page.test.tsx
```

Expected: FAIL because schemas/types/components do not expose the approved series.

- [ ] **Step 3: Extend runtime schemas, view types, and mapper copies**

Add the Task 2 field names exactly to `dashboard.types.ts` and
`dashboard-api.schema.ts`. Change-basis-point schemas are
`z.number().int().nullable()`. Daily dates use a strict `YYYY-MM-DD` regex and
all counts/money use non-negative safe integers.

Update `mapDashboard` to defensively copy `commerce.comparison`,
`commerce.daily`, and `customers.dailyNewCustomers`; do not calculate totals,
fill dates, or derive percentages there.

- [ ] **Step 4: Implement accessible metric trends**

Extend `MetricCard` with these props:

```ts
interface MetricCardProps {
  readonly label: string;
  readonly value: string | number;
  readonly meta?: string;
  readonly changeBasisPoints?: number | null;
  readonly changeLabel?: string;
  readonly sparklineValues?: readonly number[];
}
```

`MetricSparkline` renders a bounded `viewBox="0 0 120 36"` polyline. Normalize
within the component, handle constant and single-point arrays without `NaN`,
mark the decorative sparkline `aria-hidden="true"`, and accompany change color
with `+`, `-`, “No change,” or “New in period” text.

`CommerceSummary` renders four primary cards in the approved order: Revenue,
Paid Orders, Average Order Value, Customers. Revenue and orders use commerce
daily values; AOV uses each day's safe `revenue / count` with zero for an empty
day; Customers uses `dailyNewCustomers`. Keep Conversion and Repeat Customers
in a secondary metric row.

- [ ] **Step 5: Implement `RevenueTrendChart`**

Render an SVG line/area chart from backend points. Use fixed internal dimensions
and pure helpers that map indexes and safe integer values to coordinates. The
SVG itself is named:

```tsx
<svg role="img" aria-label="Revenue trend" viewBox="0 0 640 240">
  <title>Revenue trend</title>
  <path className="dashboardChartArea" d={areaPath} />
  <polyline className="dashboardChartLine" points={linePoints} />
</svg>
```

Below it, render a table named `Revenue trend data` inside the existing
visually-hidden utility class, with Date and Revenue columns. When every point
is zero, render the approved empty message and still expose the data table.

- [ ] **Step 6: Implement `PaidOrderVolumeChart`**

Render one SVG bar per backend point with `role="img"` and accessible name
`Paid order volume`. Scale against the maximum value, keep a visible minimum
height only for positive values, and render zero values at height zero. Add a
visually hidden table named `Paid order volume data` with Date and Paid orders
columns. Use “No paid activity in this range” when all values are zero.

- [ ] **Step 7: Replace Dashboard placeholders and style the charts**

Remove the `ComingSoonControl` import and render:

```tsx
<div className="dashboardPerformanceGrid">
  <RevenueTrendChart points={data.commerce.daily} />
  <PaidOrderVolumeChart points={data.commerce.daily} />
  <ProductPerformance products={data.products} />
</div>
```

In `globals.css`, preserve token-only surfaces and the scarce `#5e6ad2`
accent. Give charts stable minimum heights, crisp hairline grids, semantic
positive/negative change classes, and `overflow: hidden` inside cards. Use the
existing one-column mobile media rule and add a two-column tablet layout only
if it does not introduce horizontal overflow. Do not add gradients, hover-only
data, or fixed page widths.

- [ ] **Step 8: Run Console GREEN and commit**

Add an `[Unreleased]` bullet describing the real comparison KPIs and accessible
daily charts. Run:

```bash
pnpm --filter @opendx/console exec vitest run src/features/dashboard/tests/dashboard-page.test.tsx
pnpm --filter @opendx/console typecheck
pnpm --filter @opendx/console build
git diff --check
pnpm audit:repo
git add apps/console/src/features/dashboard apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): render dashboard performance charts"
```

Expected: focused Dashboard tests PASS, Console typecheck/build PASS, repository audit PASS.

---

### Task 4: Full-Stack Dashboard Acceptance and Final Validation

**Files:**
- Modify: `scripts/dev/crm-support-dashboard-browser-check.mjs`
- Modify: `docs/build-from-source.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1–3 seed script, reporting DTOs, and Dashboard chart landmarks.
- Produces: deterministic browser evidence proving chart presence, theme behavior, responsiveness, accessibility, and removal of placeholders; contributor documentation for refreshing the demo fixture.

- [ ] **Step 1: Update the browser fixture contract and assertions**

Extend `/v1/admin/reporting/commerce` and `/customers` fixtures in
`crm-support-dashboard-browser-check.mjs` with the exact Task 2 fields. Add a
dashboard-specific probe:

```js
dashboardCharts: [...document.querySelectorAll('svg[role="img"]')]
  .map((chart) => chart.getAttribute('aria-label')),
dashboardDataTables: [...document.querySelectorAll('table')]
  .map((table) => table.getAttribute('aria-label'))
  .filter(Boolean),
```

Replace the obsolete `comingSoonPanels >= 2` assertion with exact assertions
that both chart names and both hidden data-table names are present and that the
dashboard contains zero `.comingSoonPanel` elements. Retain role denial, focus,
overlap, horizontal-overflow, theme, mobile drawer, tablet rail, and desktop
sidebar checks.

- [ ] **Step 2: Run browser-check source tests or syntax validation and confirm RED where applicable**

Run:

```bash
node --check scripts/dev/crm-support-dashboard-browser-check.mjs
```

Before updating the fixture, the actual Dashboard should fail the old placeholder
assertion once Task 3 is present. After updating, syntax validation must PASS.

- [ ] **Step 3: Document local fixture refresh**

In `docs/build-from-source.md`, add a short subsection stating:

```bash
pnpm --filter @opendx/api db:seed:dashboard-demo
```

Explain that `make up` invokes it automatically, reruns refresh the deterministic
60-day local window, and only namespaced demo rows are updated. State explicitly
that it is development-only and does not delete contributor-created data.

Add a final `[Unreleased]` bullet for expanded Dashboard browser evidence.

- [ ] **Step 4: Run focused full-stack validation against Compose**

Rebuild through the documented contributor entry point:

```bash
make down
make up
docker compose --env-file .env -f infra/docker/docker-compose.yml ps
```

Wait for PostgreSQL, Keycloak, MinIO, ClamAV, API, Console, and Storefront health
checks to settle. Then run:

```bash
pnpm check:crm-support-dashboard-browser
```

Expected: Dashboard browser evidence passes at 390x844, 768x1024, and 1440x900
in both light and night themes; no overflow, control overlap, browser exception,
placeholder panel, or unauthorized API call is reported.

- [ ] **Step 5: Verify real seeded data through PostgreSQL and HTTP**

Query only the deterministic namespace and assert the expected current/prior
counts. Authenticate with the existing local Executive test flow and verify the
commerce/customer endpoint responses contain 30 daily points for the default
range, comparison objects, no PII, and non-zero seeded activity. Do not paste
tokens or credentials into logs or documentation.

- [ ] **Step 6: Run repository-wide completion gates**

Run:

```bash
pnpm check
git diff --check
pnpm audit:repo
git status --short
```

Expected: API, Console, Storefront, packages, Python, builds, audits, and Compose
validation all PASS; diff check is clean; status lists only Task 4 intended files.

- [ ] **Step 7: Commit Task 4**

```bash
git add scripts/dev/crm-support-dashboard-browser-check.mjs docs/build-from-source.md CHANGELOG.md
git commit -m "test(console): verify dashboard time series"
```

- [ ] **Step 8: Perform final clean-architecture and security review**

Confirm all of the following before declaring completion:

- runtime Reporting repository performs no writes;
- seed code is unreachable from API routes and runs only from explicit seed composition;
- no frontend file contains authoritative sample revenue/order/customer constants;
- endpoint role middleware and PII-minimized DTOs are unchanged or strengthened;
- all demo mutations are primary-key scoped to `da*` IDs;
- no new dependency or directory outside the approved feature/module structure exists;
- all four task commits are atomic Conventional Commits; and
- `git status --short --branch` is clean except for known user-owned changes, if any.
