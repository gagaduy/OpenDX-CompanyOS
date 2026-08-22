<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Console Obsidian Flux Fidelity Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the existing NovaCommerce Console closer to the approved Stitch Obsidian Flux hierarchy without changing routes, feature ownership, backend contracts, authorization, or truthful commerce behavior.

**Architecture:** Keep the existing page → hook → API flow unchanged. Refine semantic composition inside the owning Console features and use the existing global semantic tokens for shared visual density; add one presentation-only Support SLA monitor that reports unavailable timing because the current detail DTO has no SLA deadline fields.

**Tech Stack:** React 19, TypeScript 7, semantic CSS, Lucide React, Vitest, Testing Library, Vite, Chrome DevTools Protocol browser checks.

## Global Constraints

- Work on branch `phuong`; keep commits atomic and Conventional Commits.
- Update `CHANGELOG.md` under `[Unreleased]` with every repository-changing task.
- Do not add dependencies, directories unrelated to an approved source file, API fields, database changes, or Storefront changes.
- Keep NovaCommerce, Keycloak, SePay, VND, single-store, and single-inventory-location truth intact.
- Never copy Stitch Tailwind, Material Symbols, CDN assets, remote fonts, invented data, Stripe/card facts, shipping controls, or fake charts.
- Existing feature hooks and API adapters remain the data boundary.
- Every behavior or semantic-composition change follows a witnessed RED → GREEN test cycle.
- Final browser evidence covers all 17 routes at 390x844, 768x1024, and 1440x900 in night and light themes.

---

### Task 1: Obsidian Flux shell density and technical typography

**Files:**
- Modify: `apps/console/src/app/console-shell.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `scripts/dev/console-browser-check.mjs`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing `.consoleSidebar`, `.consoleLayout`, `.operationsTable`, `.productTable`, `.inventoryTable`, and semantic theme tokens.
- Produces: `.technicalText` utility plus computed browser contracts for the active navigation indicator and dense desktop table rows.

- [ ] **Step 1: Write the failing shell/browser contracts**

Extend the shell test to require `aria-current="page"` on the active Products link. Extend the browser probe for desktop Products to return the active link border-left width and first product-row height, then require a two-pixel indicator and a row height no greater than 44 pixels.

```ts
expect(within(navigation).getByRole("link", { name: "Products" }))
  .toHaveAttribute("aria-current", "page");
```

```js
if (surface.name === "products" && viewport.name === "desktop" &&
    (result.activeBorderLeft < 2 || result.firstRowHeight > 44)) {
  throw new Error("Products does not meet the Obsidian Flux density contract");
}
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @opendx/console test -- src/app/console-shell.test.tsx
pnpm check:console-browser
```

Expected: the semantic shell assertion passes if already present, while the browser check fails because the active navigation has no left indicator and desktop product rows exceed 44 pixels.

- [ ] **Step 3: Implement the minimal shared refinement**

In `globals.css`:

- add the two-pixel primary active-navigation border without changing link width;
- reduce desktop product, inventory, and operations rows toward 40 pixels while retaining mobile record-card overrides;
- add a local/system monospace `.technicalText` stack;
- align radii and spacing to the approved four-pixel grid;
- keep current light/night tokens and focus outlines.

- [ ] **Step 4: Run GREEN and regression checks**

```bash
pnpm --filter @opendx/console test -- src/app/console-shell.test.tsx
pnpm check:console-browser
pnpm --filter @opendx/console typecheck
git diff --check
```

- [ ] **Step 5: Update changelog and commit**

```bash
git add apps/console/src/app/console-shell.test.tsx apps/console/src/shared/styles/globals.css scripts/dev/console-browser-check.mjs CHANGELOG.md
git commit -m "style(console): refine operational density"
```

---

### Task 2: Stitch-aligned Product Editor composition

**Files:**
- Modify: `apps/console/src/features/catalog/tests/product-editor-page.test.tsx`
- Modify: `apps/console/src/features/catalog/components/product-form.tsx`
- Modify: `apps/console/src/features/catalog/pages/product-editor-page.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: unchanged `Product`, `Category`, `ProductInput`, `ProductForm`, `useProductEditor`, and five editor tabs.
- Produces: labeled Basic Details, Classification, and Description and Attributes regions with unchanged form submission behavior.

- [ ] **Step 1: Write the failing semantic composition test**

Add assertions to the create-route test:

```ts
expect(screen.getByRole("group", { name: "Basic details" })).toBeVisible();
expect(screen.getByRole("group", { name: "Classification" })).toBeVisible();
expect(screen.getByRole("group", { name: "Description and attributes" })).toBeVisible();
expect(screen.getByRole("complementary", { name: "Product setup progress" }))
  .toHaveTextContent("25%");
```

Retain all existing create, validation, save, navigation, and five-tab assertions.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @opendx/console test -- src/features/catalog/tests/product-editor-page.test.tsx
```

Expected: FAIL because the three named groups and complementary setup landmark do not yet exist.

- [ ] **Step 3: Implement the minimal editor hierarchy**

Refactor only the `ProductForm` JSX into three fieldset/panel groups. Preserve every controlled input, accessible label, validation message, slug behavior, attribute addition, and `onSave` payload. Give the setup rail an explicit `role="complementary"` and `aria-label="Product setup progress"`. Add feature-scoped CSS for the Stitch card rhythm and side rail; do not move hook or transport logic.

- [ ] **Step 4: Run GREEN and feature regressions**

```bash
pnpm --filter @opendx/console test -- src/features/catalog/tests/product-editor-page.test.tsx src/features/catalog/tests/variant-editor.test.tsx src/features/catalog/tests/media-manager.test.tsx src/features/catalog/tests/publication-panel.test.tsx src/features/catalog/tests/catalog-audit-timeline.test.tsx
pnpm --filter @opendx/console typecheck
git diff --check
```

- [ ] **Step 5: Update changelog and commit**

```bash
git add apps/console/src/features/catalog/tests/product-editor-page.test.tsx apps/console/src/features/catalog/components/product-form.tsx apps/console/src/features/catalog/pages/product-editor-page.tsx apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "style(console): refine product editor hierarchy"
```

---

### Task 3: Truthful Stitch executive dashboard hierarchy

**Files:**
- Modify: `apps/console/src/features/dashboard/tests/dashboard-page.test.tsx`
- Modify: `apps/console/src/features/dashboard/pages/dashboard-page.tsx`
- Modify: `apps/console/src/features/dashboard/components/commerce-summary.tsx`
- Modify: `apps/console/src/features/dashboard/components/operations-summary.tsx`
- Modify: `apps/console/src/features/dashboard/components/product-performance.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: unchanged `DashboardView` authoritative commerce, customer, product, and operations aggregates.
- Produces: named `Executive metrics`, `Operational focus`, and `Performance overview` regions; no new metric or request.

- [ ] **Step 1: Write the failing Dashboard hierarchy test**

Require the three Stitch-aligned regions and verify real metrics stay inside them:

```ts
const executive = screen.getByRole("region", { name: "Executive metrics" });
expect(within(executive).getByText("Gross paid revenue")).toBeVisible();
expect(within(executive).getByText("Registered customers")).toBeVisible();
expect(screen.getByRole("region", { name: "Operational focus" })).toBeVisible();
expect(screen.getByRole("region", { name: "Performance overview" })).toBeVisible();
expect(screen.queryByText(/Fraud risk|Shipping delay|Web|App|Partner/i))
  .not.toBeInTheDocument();
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @opendx/console test -- src/features/dashboard/tests/dashboard-page.test.tsx
```

Expected: FAIL because the authoritative customer cards and performance panels are not grouped under the new named regions.

- [ ] **Step 3: Implement the minimal Dashboard composition**

Compose the existing commerce and customer aggregates into one executive KPI section. Render OperationsSummary as the left Operational Focus column. Wrap the two disabled chart placeholders and real ProductPerformance in Performance Overview. Use CSS grid only; preserve date validation, stale notice, loading/error/retry, current formatting, and Coming Soon behavior.

- [ ] **Step 4: Run GREEN and verify no synthetic data**

```bash
pnpm --filter @opendx/console test -- src/features/dashboard/tests/dashboard-page.test.tsx
pnpm --filter @opendx/console typecheck
git diff --check
```

- [ ] **Step 5: Update changelog and commit**

```bash
git add apps/console/src/features/dashboard apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "style(console): refine executive dashboard hierarchy"
```

---

### Task 4: Stitch-aligned Support header, SLA monitor, and evidence rail

**Files:**
- Create: `apps/console/src/features/support/components/support-sla-monitor.tsx`
- Modify: `apps/console/src/features/support/tests/ticket-detail-page.test.tsx`
- Modify: `apps/console/src/features/support/pages/ticket-detail-page.tsx`
- Modify: `apps/console/src/features/support/components/ticket-timeline.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `SupportTicketView` fields `id`, `status`, `priority`, `version`, `createdAt`, and `updatedAt`; no new DTO fields.
- Produces: `SupportSlaMonitor({ ticket }: { readonly ticket: SupportTicketView })` and named side-rail SLA landmark.

- [ ] **Step 1: Write the failing Support fidelity test**

Add semantic assertions:

```ts
expect(screen.getByText("high", { selector: "[data-ticket-priority]" })).toBeVisible();
expect(screen.getByText("assigned", { selector: "[data-ticket-status]" })).toBeVisible();
const sla = screen.getByRole("region", { name: "SLA monitor" });
expect(sla).toHaveTextContent("SLA timing unavailable");
expect(sla).not.toHaveTextContent(/remaining|breach at/i);
```

The unavailable assertion is deliberate: the current Support detail contract contains no SLA target, pause duration, breach timestamp, or remaining-time field.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @opendx/console test -- src/features/support/tests/ticket-detail-page.test.tsx
```

Expected: FAIL because priority/status metadata and the SLA Monitor region are not rendered in the approved hierarchy.

- [ ] **Step 3: Implement the truthful Support hierarchy**

Create a presentation-only `SupportSlaMonitor` that shows priority and the explicit unavailable-timing message. Add status and priority metadata to the header, keep legal transition buttons unchanged, and reorder the desktop grid so the timeline/composer form the primary column while context, attachments, and SLA form the side rail. Apply `.technicalText` to ticket IDs and timestamps. Do not derive a client-side SLA deadline from priority or creation time.

- [ ] **Step 4: Run GREEN and Support regressions**

```bash
pnpm --filter @opendx/console test -- src/features/support/tests/ticket-detail-page.test.tsx src/features/support/tests/support-page.test.tsx
pnpm --filter @opendx/console typecheck
git diff --check
```

- [ ] **Step 5: Update changelog and commit**

```bash
git add apps/console/src/features/support apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "style(console): refine support ticket workspace"
```

---

### Task 5: Payment evidence typography and complete visual acceptance

**Files:**
- Modify: `apps/console/src/features/payments/tests/payment-operations-page.test.tsx`
- Modify: `apps/console/src/features/payments/pages/payment-detail-page.tsx`
- Modify: `apps/console/src/features/orders/pages/order-detail-page.tsx`
- Modify: `apps/console/src/features/inventory/components/inventory-detail-panel.tsx`
- Modify: `apps/console/src/features/catalog/components/catalog-audit-timeline.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `scripts/dev/console-browser-check.mjs`
- Modify: `scripts/dev/crm-support-dashboard-browser-check.mjs`
- Modify: `docs/build-from-source.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing immutable evidence DTOs and `.technicalText` from Task 1.
- Produces: consistent technical typography for IDs/timestamps and final representative fidelity evidence without new operations.

- [ ] **Step 1: Write the failing evidence typography test**

Require payment evidence identifiers to carry a semantic technical-text marker while preserving the existing SePay/VND and Coming Soon assertions:

```ts
expect(screen.getByText("NVC-PAY-0001")).toHaveClass("technicalText");
expect(screen.getByText("corr-event")).toHaveClass("technicalText");
expect(screen.getByText("corr-reconcile")).toHaveClass("technicalText");
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @opendx/console test -- src/features/payments/tests/payment-operations-page.test.tsx
```

Expected: FAIL because the identifiers do not yet use the shared technical typography marker.

- [ ] **Step 3: Implement evidence typography and browser assertions**

Apply `.technicalText` to generated identifiers, SKUs, correlation IDs, and timestamps in the named owning components. Extend browser assertions only for stable computed or semantic contracts: Support SLA region exists, Product Editor groups exist, Dashboard regions exist, Payment Coming Soon controls remain disabled, desktop dense rows remain bounded, and no overflow/control collision appears.

- [ ] **Step 4: Run focused GREEN checks**

```bash
pnpm --filter @opendx/console test
pnpm --filter @opendx/console typecheck
pnpm --filter @opendx/console build
node --check scripts/dev/console-browser-check.mjs
node --check scripts/dev/crm-support-dashboard-browser-check.mjs
```

- [ ] **Step 5: Run browser checks and inspect representative evidence**

```bash
pnpm check:console-browser
pnpm check:crm-support-dashboard-browser
```

Inspect these files against their Stitch counterparts:

```text
/tmp/opendx-console-browser/product-new-night-desktop-1440x900.png
/tmp/opendx-console-browser/payment-detail-night-desktop-1440x900.png
/tmp/opendx-crm-support-dashboard-browser/dashboard-night-desktop-1440x900.png
/tmp/opendx-crm-support-dashboard-browser/support-detail-night-desktop-1440x900.png
/tmp/opendx-console-browser/products-night-mobile-390x844.png
/tmp/opendx-crm-support-dashboard-browser/support-detail-light-tablet-768x1024.png
```

- [ ] **Step 6: Document and run final repository verification**

Update `docs/build-from-source.md` only if the browser check contract or evidence list changes. Add the final refinement entry to `CHANGELOG.md`, then run:

```bash
git diff --check
pnpm audit:repo
pnpm check
```

Expected: all tests and builds pass. The existing non-fatal Vite large-chunk warning may remain visible.

- [ ] **Step 7: Commit**

```bash
git add apps/console/src/features/payments apps/console/src/features/orders/pages/order-detail-page.tsx apps/console/src/features/inventory/components/inventory-detail-panel.tsx apps/console/src/features/catalog/components/catalog-audit-timeline.tsx apps/console/src/shared/styles/globals.css scripts/dev/console-browser-check.mjs scripts/dev/crm-support-dashboard-browser-check.mjs docs/build-from-source.md CHANGELOG.md
git commit -m "test(console): verify Stitch fidelity refinement"
```

- [ ] **Step 8: Rebuild the local demonstration stack**

```bash
make up
docker compose --env-file .env -f infra/docker/docker-compose.yml ps
curl --fail --silent --show-error http://localhost:3000 >/dev/null
curl --fail --silent --show-error http://localhost:4000/health >/dev/null
```

Expected: Console and API return HTTP 200 and all long-running Compose services report healthy.
