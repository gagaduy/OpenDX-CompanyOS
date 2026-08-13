<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Dashboard Demo Time-Series Design

**Date:** 2026-08-13

**Status:** Approved

**Area:** NovaCommerce Reporting and Operations Console

## 1. Purpose

The Operations Console dashboard currently shows authoritative aggregate
metrics, but its revenue-trend and order-volume panels are placeholders because
the Reporting API does not expose time-series facts. A newly restored local
database may also contain too little recent commerce activity to demonstrate
the dashboard.

This change adds a deterministic PostgreSQL demo dataset and extends the
existing Reporting API with current-period, previous-period, and daily facts.
The dashboard will render real charts from those facts. It will not fabricate
business data in React, add a separate analytics service, or weaken the rule
that PostgreSQL and the backend are authoritative.

## 2. Goals

- Provide enough recent local demo activity to exercise the dashboard after
  `make up`.
- Show Revenue, Paid Orders, Average Order Value, and Customers KPI cards with
  truthful comparisons and compact sparklines.
- Replace the placeholder revenue panel with a daily revenue chart.
- Replace the unsupported channel chart with daily paid-order volume because
  the current order model has no Web/App/Partner channel truth.
- Preserve the existing Top Products by Revenue, conversion, repeat-customer,
  payment-status, inventory, and operational metrics.
- Keep the seed repeatable without deleting or modifying user-created data.
- Keep the existing Reporting module and Console feature boundaries.

## 3. Non-goals

This change does not add:

- production data generation or a production seed;
- an analytics database, event warehouse, cache, or new service;
- sales-channel attribution;
- forecast, synthetic growth, or AI-generated insights;
- a charting dependency;
- changes to checkout, inventory reservation, order, or payment state-machine
  behavior;
- deletion, truncation, or replacement of user-created records.

## 4. Demo Dataset

### 4.1 Scope and ownership

The dataset is development-only and is invoked by the existing
`db:seed:all` composition path used by `make up`. A seed orchestrator may
coordinate the minimum Customer, Cart, Checkout, Order, Order Line, and Payment
rows needed for a coherent reporting fixture, but it is not imported by
business modules and exposes no runtime API.

The seed must follow database foreign-key order and use the existing published
NovaCommerce SKUs. It must not publish draft products or create new catalog
truth. It represents historical reporting fixtures, so it does not replay
checkout commands or decrement live inventory during each seed run.

### 4.2 Volume and time windows

Each run anchors its dates to the current time in `Asia/Ho_Chi_Minh` and
materializes:

- 120 orders distributed across the latest 30 local calendar days; and
- 80 orders distributed across the immediately preceding 30 local calendar
  days.

The pattern is deterministic rather than random. It varies daily volume,
product mix, quantities, and outcomes sufficiently to make the charts and Top
Products table visibly useful. Most orders are successfully paid; a bounded
minority are pending, cancelled, or have non-success payment states so the
existing payment and conversion panels remain testable.

Only successfully paid order truth contributes to revenue, paid-order volume,
average order value, customer purchase totals, or product rankings.

### 4.3 Idempotency and isolation

All demo entities use a documented deterministic UUID namespace and recognizable
demo public references. Rerunning the seed updates those exact demo records to
the newly anchored windows and inserts any missing demo records. It never
matches rows by mutable names or emails.

The seed must:

- run in one PostgreSQL transaction and roll back completely on failure;
- use conflict-safe inserts or updates limited to deterministic demo IDs;
- never issue an unscoped `DELETE`, `TRUNCATE`, or table-wide update;
- never alter a row outside the demo namespace;
- preserve referential integrity and safe-integer VND amounts; and
- produce the same logical dataset for the same anchor date.

The development seed account/customer identities must be visibly marked as
demo data. No secret or real credential is stored in source control.

## 5. Reporting Contract

### 5.1 Existing endpoints

The design extends the existing commerce and customer reporting responses.
Products and operations remain separate existing reports. No new dashboard or
analytics endpoint is introduced.

The reporting application keeps the public range envelope and
`Asia/Ho_Chi_Minh` timezone. User-selected inclusive calendar dates continue
to be normalized by the backend into safe half-open timestamp intervals.

### 5.2 Commerce additions

The commerce report adds:

- current and previous values for gross paid revenue, paid-order count, and
  average order value;
- backend-calculated change values in basis points for those three metrics; and
- one daily point per requested local date containing gross paid revenue and
  paid-order count.

The previous interval has exactly the same duration as the selected interval
and ends where the current interval begins. A missing date is returned as an
explicit zero-valued point, generated in PostgreSQL rather than inferred by the
browser.

The conceptual additions are:

```ts
interface CommerceComparisonDto {
  readonly previousGrossPaidRevenueVnd: number;
  readonly previousPaidOrderCount: number;
  readonly previousAverageOrderValueVnd: number;
  readonly grossPaidRevenueChangeBasisPoints: number | null;
  readonly paidOrderCountChangeBasisPoints: number | null;
  readonly averageOrderValueChangeBasisPoints: number | null;
}

interface CommerceDailyPointDto {
  readonly date: string; // YYYY-MM-DD in Asia/Ho_Chi_Minh
  readonly grossPaidRevenueVnd: number;
  readonly paidOrderCount: number;
}
```

These are added to `CommerceReportDto` as purpose-specific nested values while
the existing fields remain backward compatible.

### 5.3 Customer additions

The existing `totalRegisteredCustomers` remains the Customers headline value.
Its comparison caption and sparkline represent newly registered customers in
the selected interval, matching the meaning shown in the approved dashboard
reference. The customer report adds:

- `newCustomersInRange`;
- `previousNewCustomersInRange`;
- `newCustomersChangeBasisPoints`; and
- one `dailyNewCustomers` point for every selected local date.

This avoids presenting growth of a lifetime total as though it were comparable
period acquisition. The Console labels the comparison as “New customers.”

### 5.4 Percentage semantics

The backend calculates all comparison values. The Console only formats them.

- When the previous value is positive, change basis points are
  `(current - previous) / previous * 10_000`, rounded according to the existing
  integer DTO convention.
- When both values are zero, change is `0`.
- When the previous value is zero and the current value is positive, change is
  `null`; the Console displays “New in period” instead of an infinite or false
  percentage.
- Average order value is zero when there are no successfully paid orders.

### 5.5 Query rules

The PostgreSQL Reporting repository remains read-only. It uses bounded queries,
`generate_series` for local calendar completeness, and aggregate joins over
approved commerce tables. It must avoid one query per day and avoid page-then-
filter behavior. Monetary sums must be checked before conversion to JavaScript
numbers.

The repository returns facts to the Reporting application service. DTO mapping,
comparison rules, and safe division remain application responsibilities rather
than route, controller, or React responsibilities.

## 6. Console Dashboard

### 6.1 KPI row

The primary row follows the approved Stitch hierarchy:

1. Revenue
2. Paid Orders
3. Average Order Value
4. Customers

Each card displays its authoritative headline, the current-versus-previous
comparison, a clear comparison label, and a compact SVG sparkline. Positive,
negative, neutral, and undefined comparisons use semantic text as well as color.

Conversion and Repeat Customers remain available as secondary metrics so this
change does not remove current reporting value merely to match the reference.

### 6.2 Performance charts

- **Revenue Trend** renders daily gross paid revenue as an SVG line with a
  restrained area fill.
- **Paid Order Volume** renders daily successfully paid orders as SVG bars.
- **Top Products by Revenue** keeps its existing authoritative product ranking.

The charts share the current dashboard design tokens and adapt to light and
dark modes. They do not require a new dependency. Values, axes, and summaries
must remain legible at the supported breakpoints.

### 6.3 Accessibility and responsive behavior

Each chart has an accessible name and a visually hidden tabular representation
of its dates and values. Meaning is not encoded by color alone. Keyboard users
do not need to hover to discover the series values.

At desktop widths the performance panels use the approved dense layout. At
tablet and mobile widths they stack into one column without horizontal page
overflow. SVG content scales to its container without clipping labels.

If every daily paid value is zero, the panel displays “No paid activity in this
range” instead of a misleading flat performance chart. Loading, error, and
permission states continue to use the Console's existing system-state patterns.

## 7. Data Flow

```text
make up
  -> db:seed:all
  -> transactional deterministic demo seed
  -> PostgreSQL customers / carts / checkouts / orders / order lines / payments

Console date range
  -> existing Reporting HTTP endpoints
  -> Reporting application service
  -> read-only PostgreSQL aggregates and daily series
  -> validated purpose-specific DTOs
  -> KPI cards, SVG charts, and accessible tables
```

The browser never treats the demo seed, URL state, or visual chart as proof of
payment. Payment and order states stored by the backend remain the only source
of reporting truth.

## 8. Error Handling and Safety

- Invalid or oversized ranges continue to fail through existing reporting
  validation; the daily query cannot silently expand beyond the approved
  maximum range.
- A seed failure leaves no partial fixture because the whole run is
  transactional.
- Reporting failures render the existing dashboard error state and do not fall
  back to hard-coded sample metrics.
- Empty datasets return valid zero aggregates and complete zero-valued daily
  points.
- No response exposes customer identity, email, address, order identifiers, or
  other PII to `executive_viewer`.
- Backend role enforcement remains unchanged; chart visibility is not an
  authorization boundary.

## 9. Testing and Validation

Implementation follows red-green-refactor and includes:

### 9.1 Seed tests

- a real PostgreSQL test proving the expected demo counts and valid foreign
  keys;
- a second seed run proving idempotency;
- a non-demo sentinel row proving user-created data is preserved;
- a forced-failure test proving transaction rollback; and
- deterministic-window assertions for current and previous periods.

### 9.2 Reporting tests

- repository integration tests for daily zero filling, paid-only revenue,
  local timezone boundaries, previous-period alignment, and safe monetary
  totals;
- application tests for average order value and all percentage edge cases;
- controller/route contract tests for the extended DTOs and unchanged role
  enforcement; and
- schema validation tests in the Console.

### 9.3 Console tests

- KPI comparison and `null` comparison rendering;
- revenue line, order bars, and customer sparklines using API fixtures;
- zero-activity empty state;
- accessible chart names and hidden data tables;
- dark/light rendering and responsive layout without horizontal overflow; and
- regression coverage for existing dashboard metrics and system states.

### 9.4 Completion gates

Run the focused API and Console suites, real PostgreSQL integration tests,
typechecks, builds, repository audit, `git diff --check`, and the documented
root validation command. Rebuild the Compose stack, wait for health, and verify
the dashboard against the seeded database at supported desktop, tablet, and
mobile widths in both themes.

## 10. Acceptance Criteria

The change is complete when:

1. `make up` leaves a healthy stack and refreshes only the deterministic local
   demo fixture.
2. The latest 30-day view contains 120 demo orders and the preceding equivalent
   period contains 80, without deleting or modifying user data.
3. Revenue, Paid Orders, AOV, and Customers show backend-derived comparisons
   and sparklines.
4. Revenue Trend and Paid Order Volume render daily authoritative series, with
   missing dates explicitly zero-filled.
5. Top Products and all retained dashboard metrics continue to use PostgreSQL
   reporting truth.
6. Undefined comparison percentages are represented honestly and empty paid
   activity is not rendered as fake performance.
7. The dashboard remains accessible, responsive, and visually consistent with
   the approved Obsidian Flux redesign in light and dark themes.
8. All focused and repository-wide validation gates pass.
