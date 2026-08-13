<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# NovaCommerce Console Obsidian Flux Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all 17 NovaCommerce Console routes with the approved Obsidian Flux system while preserving existing role-aware, API-backed commerce behavior.

**Architecture:** Build a responsive application shell and a small set of stable shared presentation primitives first, then migrate each owning frontend feature without moving its hooks, API adapters, schemas, mappers, or business rules. The redesign remains presentation-only except for exposing the already-supported Support message API through a feature-owned composer.

**Tech Stack:** React 19, TypeScript 7, React Router 6, semantic CSS, Lucide React, Vitest, Testing Library, Vite, Chrome DevTools Protocol browser checks.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-13-console-obsidian-flux-redesign-design.md`.
- Keep `NovaCommerce` branding; never introduce `NovaCore`.
- Dark/night defaults to canvas `#010102`, elevated surface `#08090a`, and primary `#5e6ad2`; retain persisted light mode.
- Keep all existing routes, API contracts, PostgreSQL behavior, and backend authorization unchanged.
- Keep SePay, VND, one store, and one inventory location truthful.
- Do not introduce Tailwind, Material Symbols, chart packages, remote Stitch assets, or any new dependency.
- Use Inter for UI and monospace only for generated IDs, SKUs, timestamps, and technical metadata.
- Unsupported controls are native-disabled, visibly labeled `Coming soon`, and must never issue a request.
- Exclude shipping providers, B2B/social sales channels, Stripe/cards, multi-warehouse, refunds, returns, and electronic invoices entirely.
- Follow TDD: observe a focused RED before implementation and preserve existing behavior throughout.
- Update `CHANGELOG.md` under `[Unreleased]` in every code-changing task.
- Add SPDX headers to every new source and test file.
- Do not edit the Storefront or backend.

## File Map

### Application shell ownership

- `apps/console/src/app/console-shell.tsx`: responsive shell, grouped role-aware navigation, contextual route header, theme, and mobile drawer state.
- `apps/console/src/app/console-shell.test.tsx`: shell roles, themes, responsive semantics, and drawer interaction.
- `apps/console/src/shared/styles/globals.css`: semantic theme tokens and Console component/layout styles.

### New shared presentation primitives

- `apps/console/src/shared/components/page-header.tsx`: breadcrumb, kicker, title, description, metadata, and action composition.
- `apps/console/src/shared/components/system-state.tsx`: loading, empty, error, denied, and session-expired presentation.
- `apps/console/src/shared/components/coming-soon-control.tsx`: request-free disabled controls and panels.
- `apps/console/src/shared/components/dialog-shell.tsx`: accessible modal/drawer foundation with focus restoration and Escape handling.
- `apps/console/src/shared/components/shared-presentation.test.tsx`: observable shared component contracts.

### Feature ownership

- Authentication retains sign-in/callback pages and tests.
- Catalog retains Product list, Categories, Product Editor, variants, media, publication, audit, and their tests.
- Inventory retains inventory list, detail drawer, mutations, and tests.
- Orders and Payments retain their list/detail components and tests.
- Customers/CRM retain customer list/360 components and tests.
- Support retains queue/detail behavior; new `support-message-composer.tsx` owns the existing message action.
- Dashboard and Company Overview retain their data and feature components.
- `scripts/dev/console-browser-check.mjs` and `scripts/dev/crm-support-dashboard-browser-check.mjs` own final responsive evidence.

---

### Task 1: Responsive Obsidian Flux application shell

**Files:**
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/app/console-shell.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `useAuth(): { session; signOut }`, React Router `NavLink`, `Outlet`, and `useLocation`.
- Produces: the existing `ConsoleShell(): JSX.Element`, with `.consoleSidebar`, `.consoleTopbar`, `.consoleMobileMenu`, and `.consoleContent` landmarks used by later tasks and browser checks.

- [ ] **Step 1: Write failing shell tests**

Add assertions for grouped navigation, NovaCommerce branding, dark default,
persisted light mode, accessible mobile drawer controls, and current-route
context. Use the existing mocked `useAuth` session and `MemoryRouter` pattern:

```tsx
expect(screen.getByText("NovaCommerce")).toBeVisible();
expect(screen.getByText("Overview")).toBeVisible();
expect(screen.getByText("Catalog")).toBeVisible();
expect(screen.getByText("Operations")).toBeVisible();
expect(screen.getByTestId("console-layout")).toHaveAttribute("data-theme", "night");

await user.click(screen.getByRole("button", { name: "Open navigation" }));
expect(screen.getByRole("navigation", { name: "Primary navigation" }))
  .toHaveAttribute("data-mobile-open", "true");
await user.keyboard("{Escape}");
expect(screen.getByRole("button", { name: "Open navigation" })).toHaveFocus();
```

- [ ] **Step 2: Run the shell tests and verify RED**

Run:

```bash
pnpm --filter @opendx/console test -- src/app/console-shell.test.tsx
```

Expected: FAIL because grouped labels, night default, mobile trigger, and route
header do not exist.

- [ ] **Step 3: Implement the responsive shell**

Keep role predicates in `ConsoleShell`, but represent navigation as grouped
configuration and render only allowed items:

```tsx
const navigationGroups = [
  { label: "Overview", items: [dashboardItem, companyOverviewItem] },
  { label: "Catalog", items: [productsItem, categoriesItem, inventoryItem] },
  { label: "Operations", items: [ordersItem, paymentsItem, customersItem, supportItem] },
] as const;
```

Add `menuOpen`, Escape handling, a mobile backdrop, current-route breadcrumb
metadata, and a theme initializer whose missing-storage value is `night`.
Preserve the current local-storage key `opendx.console.theme`.

Replace the opening portion of `globals.css` with semantic Obsidian Flux tokens
for both themes, then implement the exact responsive modes:

```css
.consoleLayout { grid-template-columns: 240px minmax(0, 1fr); }
@media (min-width: 768px) and (max-width: 1279px) {
  .consoleLayout { grid-template-columns: 64px minmax(0, 1fr); }
  .consoleSidebar .navText, .consoleSidebar .navGroupLabel { position: absolute; clip: rect(0 0 0 0); }
}
@media (max-width: 767px) {
  .consoleLayout { display: block; }
  .consoleSidebar { position: fixed; transform: translateX(-100%); }
  .consoleSidebar[data-mobile-open="true"] { transform: translateX(0); }
}
```

- [ ] **Step 4: Run focused and full Console tests**

Run:

```bash
pnpm --filter @opendx/console test -- src/app/console-shell.test.tsx
pnpm --filter @opendx/console test
pnpm --filter @opendx/console typecheck
```

Expected: shell tests and the existing Console suite PASS.

- [ ] **Step 5: Update the changelog and commit**

Add an `[Unreleased]` entry describing the responsive grouped Console shell,
then commit:

```bash
git add apps/console/src/app/console-shell.tsx apps/console/src/app/console-shell.test.tsx apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): add responsive operations shell"
```

---

### Task 2: Shared operational presentation primitives

**Files:**
- Create: `apps/console/src/shared/components/page-header.tsx`
- Create: `apps/console/src/shared/components/system-state.tsx`
- Create: `apps/console/src/shared/components/coming-soon-control.tsx`
- Create: `apps/console/src/shared/components/dialog-shell.tsx`
- Create: `apps/console/src/shared/components/shared-presentation.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `PageHeaderProps`, `SystemStateProps`, `ComingSoonControlProps`, and `DialogShellProps` below.
- Consumers: all feature tasks after Task 2.

```ts
export interface PageHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description?: string;
  readonly breadcrumb?: readonly { readonly label: string; readonly to?: string }[];
  readonly metadata?: ReactNode;
  readonly actions?: ReactNode;
}

export interface SystemStateProps {
  readonly kind: "loading" | "empty" | "error" | "denied" | "session-expired";
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export interface ComingSoonControlProps {
  readonly label: string;
  readonly presentation?: "button" | "panel";
}

export interface DialogShellProps {
  readonly open: boolean;
  readonly title: string;
  readonly mode?: "modal" | "drawer";
  readonly onClose: () => void;
  readonly children: ReactNode;
}
```

- [ ] **Step 1: Write failing shared presentation tests**

```tsx
render(<ComingSoonControl label="Export CSV" />);
const exportButton = screen.getByRole("button", { name: /Export CSV.*Coming soon/i });
expect(exportButton).toBeDisabled();

render(<SystemState kind="denied" title="Access restricted" action={<button>Return</button>} />);
expect(screen.getByRole("alert")).toHaveTextContent("Access restricted");

render(<DialogShell open title="Create ticket" onClose={onClose}>Form</DialogShell>);
await user.keyboard("{Escape}");
expect(onClose).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @opendx/console test -- src/shared/components/shared-presentation.test.tsx
```

Expected: FAIL because the shared components do not exist.

- [ ] **Step 3: Implement the minimal typed primitives**

Implement semantic markup only. `ComingSoonControl` must have no `onClick`
prop. `DialogShell` uses `role="dialog"`, `aria-modal="true"`, closes on
Escape, moves focus to the first focusable child, and restores the previously
focused element on close. `SystemState` uses `role="status"` for loading/empty
and `role="alert"` for error/denied/session-expired.

- [ ] **Step 4: Add shared styles and verify**

Add `.pageHeader`, `.breadcrumb`, `.systemState`, `.comingSoon`,
`.dialogBackdrop`, `.dialogSurface`, and `.drawerSurface` styles using semantic
tokens. Run:

```bash
pnpm --filter @opendx/console test -- src/shared/components/shared-presentation.test.tsx
pnpm --filter @opendx/console typecheck
```

Expected: PASS.

- [ ] **Step 5: Update changelog and commit**

```bash
git add apps/console/src/shared/components apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): add operational ui primitives"
```

---

### Task 3: Authentication surfaces

**Files:**
- Modify: `apps/console/src/features/authentication/pages/sign-in-page.tsx`
- Modify: `apps/console/src/features/authentication/pages/auth-callback-page.tsx`
- Modify: `apps/console/src/features/authentication/tests/authentication.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing `useAuth().signIn`, `useAuth().completeSignIn`, and `SystemState`.
- Produces: unchanged routes `/sign-in` and `/auth/callback`.

- [ ] **Step 1: Add failing authentication visual-contract tests**

Assert NovaCommerce branding, one real Keycloak action, no authenticated
sidebar on sign-in/callback, callback progress semantics, and retry state:

```tsx
expect(screen.getByRole("heading", { name: "Staff console" })).toBeVisible();
expect(screen.getByRole("button", { name: "Sign in with Keycloak" })).toBeEnabled();
expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
expect(screen.getByRole("status")).toHaveTextContent("Completing secure sign-in");
```

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @opendx/console test -- src/features/authentication/tests/authentication.test.tsx
```

Expected: FAIL on the redesigned structure or callback error behavior.

- [ ] **Step 3: Implement auth card and callback panel**

Use the real auth actions only. Add callback rejection state with a button that
navigates to `/sign-in`. Do not render a fictional staff identity or encryption
claim.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @opendx/console test -- src/features/authentication/tests/authentication.test.tsx
pnpm --filter @opendx/console typecheck
git add apps/console/src/features/authentication apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): redesign staff authentication"
```

---

### Task 4: Product list and category workspace

**Files:**
- Modify: `apps/console/src/features/catalog/pages/product-list-page.tsx`
- Modify: `apps/console/src/features/catalog/components/product-table.tsx`
- Modify: `apps/console/src/features/catalog/pages/category-page.tsx`
- Modify: `apps/console/src/features/catalog/components/category-tree.tsx`
- Modify: `apps/console/src/features/catalog/tests/product-list-page.test.tsx`
- Modify: `apps/console/src/features/catalog/tests/category-page.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing `CatalogApi`, hooks, `PageHeader`, `SystemState`, and `DialogShell`.
- Produces: unchanged Product and Category queries/mutations.

- [ ] **Step 1: Add failing list/category composition tests**

Assert the real filter controls and actions remain while the new structural
landmarks exist:

```tsx
expect(screen.getByRole("heading", { name: "Products" })).toBeVisible();
expect(screen.getByRole("link", { name: /New product/i })).toHaveAttribute("href", "/products/new");
expect(screen.getByRole("region", { name: "Product filters" })).toBeVisible();
expect(screen.getByRole("table", { name: "Products" })).toBeVisible();

expect(screen.getByRole("tree", { name: "Category tree" })).toBeVisible();
expect(screen.getByRole("button", { name: "Add category" })).toBeEnabled();
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm --filter @opendx/console test -- src/features/catalog/tests/product-list-page.test.tsx src/features/catalog/tests/category-page.test.tsx
```

Expected: FAIL because the new regions/table labels/tree composition are absent.

- [ ] **Step 3: Compose the redesigned pages**

Use `PageHeader`; retain URL-backed search/status/category/page behavior. Keep
the existing table fields and archive callback. Move category create/edit into
the right rail at desktop and `DialogShell mode="drawer"` at narrow widths.
Do not add drag-and-drop.

- [ ] **Step 4: Verify real behavior remains green**

```bash
pnpm --filter @opendx/console test -- src/features/catalog/tests/product-list-page.test.tsx src/features/catalog/tests/category-page.test.tsx
pnpm --filter @opendx/console typecheck
```

Expected: filters update URL state, create/edit/archive callbacks fire once,
and the new composition assertions PASS.

- [ ] **Step 5: Update changelog and commit**

```bash
git add apps/console/src/features/catalog/pages/product-list-page.tsx apps/console/src/features/catalog/pages/category-page.tsx apps/console/src/features/catalog/components/product-table.tsx apps/console/src/features/catalog/components/category-tree.tsx apps/console/src/features/catalog/tests apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): redesign catalog workspaces"
```

---

### Task 5: Product Editor five-tab workspace

**Files:**
- Modify: `apps/console/src/features/catalog/pages/product-editor-page.tsx`
- Modify: `apps/console/src/features/catalog/components/product-form.tsx`
- Modify: `apps/console/src/features/catalog/components/variant-editor.tsx`
- Modify: `apps/console/src/features/catalog/components/media-manager.tsx`
- Modify: `apps/console/src/features/catalog/components/publication-panel.tsx`
- Modify: `apps/console/src/features/catalog/components/catalog-audit-timeline.tsx`
- Modify: `apps/console/src/features/catalog/tests/product-editor-page.test.tsx`
- Modify: `apps/console/src/features/catalog/tests/variant-editor.test.tsx`
- Modify: `apps/console/src/features/catalog/tests/media-manager.test.tsx`
- Modify: `apps/console/src/features/catalog/tests/publication-panel.test.tsx`
- Modify: `apps/console/src/features/catalog/tests/catalog-audit-timeline.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing `CatalogApi`, Product Editor hooks/types, `PageHeader`, and `ComingSoonControl`.
- Produces: unchanged create/update/variant/price/media/publication/audit behavior and a stable `.productEditorTabs` browser-check target.

- [ ] **Step 1: Write failing editor-shell and placeholder tests**

```tsx
expect(screen.getByRole("tablist", { name: "Product editor sections" })).toBeVisible();
expect(screen.getAllByRole("tab")).toHaveLength(5);
expect(screen.getByRole("button", { name: /Product tags.*Coming soon/i })).toBeDisabled();

await user.click(screen.getByRole("tab", { name: "Variants and prices" }));
expect(screen.getByRole("button", { name: /Import.*Coming soon/i })).toBeDisabled();
expect(api.listVariants).toHaveBeenCalledTimes(1);
```

Also assert Media advertises only supported image MIME types, Publication uses
the real readiness keys, and Audit Export CSV is disabled and request-free.

- [ ] **Step 2: Run the five focused suites and verify RED**

```bash
pnpm --filter @opendx/console test -- src/features/catalog/tests/product-editor-page.test.tsx src/features/catalog/tests/variant-editor.test.tsx src/features/catalog/tests/media-manager.test.tsx src/features/catalog/tests/publication-panel.test.tsx src/features/catalog/tests/catalog-audit-timeline.test.tsx
```

Expected: FAIL on setup rail, new composition, and Coming soon contracts.

- [ ] **Step 3: Implement the editor shell and tab layouts**

Keep a single tab state in `ProductEditorPage`. Add a create-only setup rail
whose steps derive from persisted product state. Render exact disabled controls:

```tsx
<ComingSoonControl label="Product tags" presentation="panel" />
<ComingSoonControl label="Import" />
<ComingSoonControl label="Export CSV" />
```

Do not add shipping readiness, sales channels, video, or unsupported MIME
types. Preserve current callbacks, optimistic versions, and refresh behavior.

- [ ] **Step 4: Run focused suites, full Catalog tests, and typecheck**

```bash
pnpm --filter @opendx/console test -- src/features/catalog/tests
pnpm --filter @opendx/console typecheck
```

Expected: all Catalog tests PASS.

- [ ] **Step 5: Update changelog and commit**

```bash
git add apps/console/src/features/catalog apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): redesign product editor"
```

---

### Task 6: Inventory stock operations workspace

**Files:**
- Modify: `apps/console/src/features/inventory/pages/inventory-page.tsx`
- Modify: `apps/console/src/features/inventory/components/inventory-table.tsx`
- Modify: `apps/console/src/features/inventory/components/inventory-detail-panel.tsx`
- Modify: `apps/console/src/features/inventory/components/stock-mutation-dialog.tsx`
- Modify: `apps/console/src/features/inventory/tests/inventory-page.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: current `InventoryApi`, `InventoryItemView`, roles, `PageHeader`, `SystemState`, and `DialogShell`.
- Produces: unchanged read, receive, adjust, movement-history, and role behavior.

- [ ] **Step 1: Add failing inventory layout and permission tests**

```tsx
expect(screen.getByRole("region", { name: "Inventory summary" })).toBeVisible();
expect(screen.getByRole("table", { name: "Inventory stock levels" })).toBeVisible();
await user.click(screen.getByRole("button", { name: /View.*SKU-1/i }));
expect(screen.getByRole("dialog", { name: /Inventory detail/i })).toHaveClass("drawerSurface");
expect(screen.queryByRole("button", { name: "Receive stock" })).not.toBeInTheDocument();
```

Use a catalog-manager session for the final assertion and inventory-manager for
mutation tests.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @opendx/console test -- src/features/inventory/tests/inventory-page.test.tsx
```

Expected: FAIL on summary/table/drawer contracts.

- [ ] **Step 3: Implement the stock workspace**

Compute displayed summary counts from the loaded page only and label them
`Visible results` so they cannot be mistaken for global totals. Use the shared
drawer shell for details and modal shell for receive/adjust. Preserve existing
idempotency and version inputs.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @opendx/console test -- src/features/inventory/tests/inventory-page.test.tsx
pnpm --filter @opendx/console typecheck
git add apps/console/src/features/inventory apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): redesign inventory operations"
```

---

### Task 7: Order and SePay operations workspaces

**Files:**
- Modify: `apps/console/src/features/orders/pages/order-operations-page.tsx`
- Modify: `apps/console/src/features/orders/pages/order-detail-page.tsx`
- Modify: `apps/console/src/features/orders/components/order-table.tsx`
- Modify: `apps/console/src/features/orders/components/order-history.tsx`
- Modify: `apps/console/src/features/orders/tests/order-operations-page.test.tsx`
- Modify: `apps/console/src/features/payments/pages/payment-operations-page.tsx`
- Modify: `apps/console/src/features/payments/pages/payment-detail-page.tsx`
- Modify: `apps/console/src/features/payments/components/payment-table.tsx`
- Modify: `apps/console/src/features/payments/components/payment-evidence.tsx`
- Modify: `apps/console/src/features/payments/tests/payment-operations-page.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing Order/Payment APIs and view types, `PageHeader`, `SystemState`, `ComingSoonControl`, and `DialogShell`.
- Produces: unchanged order transitions and payment reconciliation.

- [ ] **Step 1: Add failing list/detail composition tests**

```tsx
expect(screen.getByRole("table", { name: "Orders" })).toBeVisible();
expect(screen.getByRole("region", { name: "Order status history" })).toBeVisible();
expect(screen.getByRole("complementary", { name: "Order snapshot" })).toBeVisible();

expect(screen.getByRole("region", { name: "Provider events" })).toBeVisible();
expect(screen.getByRole("region", { name: "Reconciliation history" })).toBeVisible();
expect(screen.getByRole("button", { name: /View receipt.*Coming soon/i })).toBeDisabled();
expect(screen.getByText(/VND|₫/)).toBeVisible();
expect(screen.queryByText(/Stripe|Visa|USD/)).not.toBeInTheDocument();
```

Add a cancellation confirmation assertion and verify reconciliation still calls
`api.reconcile` exactly once only when allowed.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @opendx/console test -- src/features/orders/tests/order-operations-page.test.tsx src/features/payments/tests/payment-operations-page.test.tsx
```

Expected: FAIL on new landmarks, disabled reference controls, and confirmation.

- [ ] **Step 3: Implement dense list/detail layouts**

Use the approved two-column details with main timeline and side snapshot. Add
`View receipt` and `Export details` through `ComingSoonControl`. Do not alter
transition maps, evidence mapping, redaction, or reconciliation eligibility.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @opendx/console test -- src/features/orders src/features/payments
pnpm --filter @opendx/console typecheck
git add apps/console/src/features/orders apps/console/src/features/payments apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): redesign commerce operations"
```

---

### Task 8: Customer list and Customer 360

**Files:**
- Modify: `apps/console/src/features/customers/pages/customer-list-page.tsx`
- Modify: `apps/console/src/features/customers/components/customer-table.tsx`
- Modify: `apps/console/src/features/customers/tests/customer-list-page.test.tsx`
- Modify: `apps/console/src/features/crm/pages/customer-detail-page.tsx`
- Modify: `apps/console/src/features/crm/components/customer-summary.tsx`
- Modify: `apps/console/src/features/crm/components/customer-timeline.tsx`
- Modify: `apps/console/src/features/crm/components/followup-panel.tsx`
- Modify: `apps/console/src/features/crm/tests/customer-detail-page.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: current Customer/CRM APIs, URL-backed segments, `PageHeader`, and `SystemState`.
- Produces: unchanged search, segment, detail, and follow-up claim behavior.

- [ ] **Step 1: Add failing Customer workspace tests**

```tsx
expect(screen.getByRole("region", { name: "Customer filters" })).toBeVisible();
expect(screen.getByRole("table", { name: "Customers" })).toBeVisible();
expect(screen.getByRole("region", { name: "Customer summary" })).toBeVisible();
expect(screen.getByRole("region", { name: "Follow-ups" })).toBeVisible();
expect(screen.getByRole("region", { name: "Customer timeline" })).toBeVisible();
```

Retain existing assertions that claim calls include the current version and
that conflict errors expose Retry.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @opendx/console test -- src/features/customers/tests/customer-list-page.test.tsx src/features/crm/tests/customer-detail-page.test.tsx
```

Expected: FAIL on the new named regions/layout.

- [ ] **Step 3: Implement dense CRM layouts**

Use a list table and a three-region Customer 360 grid. Use monospace only for
customer IDs and technical times. Do not add or expose extra PII fields.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @opendx/console test -- src/features/customers src/features/crm
pnpm --filter @opendx/console typecheck
git add apps/console/src/features/customers apps/console/src/features/crm apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): redesign customer operations"
```

---

### Task 9: Support queue, ticket detail, and real message composer

**Files:**
- Create: `apps/console/src/features/support/components/support-message-composer.tsx`
- Modify: `apps/console/src/features/support/pages/support-page.tsx`
- Modify: `apps/console/src/features/support/pages/ticket-detail-page.tsx`
- Modify: `apps/console/src/features/support/components/ticket-table.tsx`
- Modify: `apps/console/src/features/support/components/ticket-context.tsx`
- Modify: `apps/console/src/features/support/components/ticket-timeline.tsx`
- Modify: `apps/console/src/features/support/components/attachment-panel.tsx`
- Modify: `apps/console/src/features/support/tests/support-page.test.tsx`
- Modify: `apps/console/src/features/support/tests/ticket-detail-page.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `SupportOperationsApi.message(ticketId: string, body: string): Promise<SupportMessageView>`, existing ticket/detail types, `DialogShell`, and `ComingSoonControl`.
- Produces: `SupportMessageComposer({ pending, onSend }): JSX.Element` where `onSend(body: string): Promise<void>`.

- [ ] **Step 1: Add failing queue/detail/message tests**

```tsx
await user.click(screen.getByRole("button", { name: "Create ticket" }));
expect(screen.getByRole("dialog", { name: "Create ticket" })).toBeVisible();

await user.type(screen.getByRole("textbox", { name: "Reply" }), "Customer update");
await user.click(screen.getByRole("button", { name: "Send reply" }));
expect(api.message).toHaveBeenCalledWith(ticket.id, "Customer update");
expect(screen.getByRole("button", { name: /Internal note.*Coming soon/i })).toBeDisabled();
```

Also assert clean attachments can download, non-clean attachments cannot, and
legal transition actions remain state-dependent.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @opendx/console test -- src/features/support/tests/support-page.test.tsx src/features/support/tests/ticket-detail-page.test.tsx
```

Expected: FAIL because the creation drawer and message composer do not exist.

- [ ] **Step 3: Implement Support composition and message flow**

Move create form into `DialogShell mode="drawer"`. Add a feature-owned
composer that trims input, rejects empty submission, disables while pending,
and calls only `onSend`. In `TicketDetailPage`, call `api.message`, append the
returned message to the existing detail view, and surface retryable failure.
Team mentions and Internal Note render disabled through `ComingSoonControl`.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @opendx/console test -- src/features/support
pnpm --filter @opendx/console typecheck
git add apps/console/src/features/support apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): redesign support operations"
```

---

### Task 10: Executive Dashboard and Alpha Company Overview

**Files:**
- Modify: `apps/console/src/features/dashboard/pages/dashboard-page.tsx`
- Modify: `apps/console/src/features/dashboard/components/metric-card.tsx`
- Modify: `apps/console/src/features/dashboard/components/commerce-summary.tsx`
- Modify: `apps/console/src/features/dashboard/components/operations-summary.tsx`
- Modify: `apps/console/src/features/dashboard/components/product-performance.tsx`
- Modify: `apps/console/src/features/dashboard/tests/dashboard-page.test.tsx`
- Modify: `apps/console/src/features/company-overview/pages/company-overview-page.tsx`
- Modify: `apps/console/src/features/company-overview/pages/company-overview-page.test.tsx`
- Modify: `apps/console/src/features/company-overview/components/overview-panel.tsx`
- Modify: `apps/console/src/features/company-overview/components/operating-timeline.tsx`
- Modify: `apps/console/src/features/company-overview/components/guardrail-list.tsx`
- Modify: `apps/console/src/features/company-overview/company-overview.data.ts`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing `DashboardView`, report API, Company Overview data, `PageHeader`, `SystemState`, and `ComingSoonControl`.
- Produces: unchanged range query and aggregate rendering; explicit capability-state labels.

- [ ] **Step 1: Add failing Dashboard truthfulness tests**

```tsx
expect(screen.getByText("Gross paid revenue")).toBeVisible();
expect(screen.getByText("Paid orders")).toBeVisible();
expect(screen.getByText("Registered customers")).toBeVisible();
expect(screen.getByRole("region", { name: "Operational focus" })).toBeVisible();
expect(screen.getByText("Revenue trend").closest("section")).toHaveTextContent("Coming soon");
expect(screen.queryByText(/Web|App|Partner/)).not.toBeInTheDocument();
```

Add Company Overview assertions that every panel exposes one of `Live`,
`Foundation`, `Alpha`, or `Planned`, and no future capability is labeled Live.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @opendx/console test -- src/features/dashboard/tests/dashboard-page.test.tsx src/features/company-overview/pages/company-overview-page.test.tsx
```

Expected: FAIL on the new executive composition, truthful placeholders, and
capability state labels.

- [ ] **Step 3: Implement the dashboard grid**

Render real commerce, customer, operations, and product values only. Add two
`ComingSoonControl presentation="panel"` regions for Revenue Trend and Order
Volume by Channel. Keep range validation and stale alert unchanged.

- [ ] **Step 4: Implement the Company Overview grid**

Extend `OverviewPanelData` with:

```ts
readonly state: "live" | "foundation" | "alpha" | "planned";
```

Assign truthful states to every current panel and render the state badge. Keep
the current operating timeline and guardrail copy.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @opendx/console test -- src/features/dashboard src/features/company-overview
pnpm --filter @opendx/console typecheck
git add apps/console/src/features/dashboard apps/console/src/features/company-overview apps/console/src/shared/styles/globals.css CHANGELOG.md
git commit -m "feat(console): redesign executive overview"
```

---

### Task 11: Responsive browser acceptance and final validation

**Files:**
- Modify: `scripts/dev/console-browser-check.mjs`
- Modify: `scripts/dev/crm-support-dashboard-browser-check.mjs`
- Modify: `docs/build-from-source.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: stable CSS/ARIA targets produced by Tasks 1–10.
- Produces: reproducible dark/light screenshots and layout/interaction evidence for all 17 routes.

- [ ] **Step 1: Extend browser checks and observe RED**

Create a route matrix using deterministic mocked API responses and authorized
sessions:

```js
const consoleRoutes = [
  "/sign-in", "/auth/callback", "/products", "/products/new",
  `/products/${fixture.productId}`, "/categories", "/inventory",
  "/orders", `/orders/${fixture.orderId}`, "/payments",
  `/payments/${fixture.paymentId}`, "/customers",
  `/customers/${fixture.customerId}`, "/support",
  `/support/${fixture.ticketId}`, "/dashboard", "/company-overview",
];
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];
```

For every route/theme/viewport, assert document width does not exceed viewport
width, no visible control rectangles intersect, theme matches, and headings
settle. Assert desktop sidebar, tablet icon rail, mobile drawer, visible focus,
list-to-detail navigation, and disabled Coming soon controls.

Run the existing browser commands before adapting all pages and record the
expected RED caused by missing new targets or overflow assertions:

```bash
pnpm check:console-browser
pnpm check:crm-support-dashboard-browser
```

- [ ] **Step 2: Finish responsive CSS from browser evidence**

Fix only demonstrated presentation failures. Table overflow must remain inside
`.tableViewport`; modal/drawer widths must remain within the viewport; sticky
headers must not cover focused controls. Do not weaken assertions to accept a
broken layout.

- [ ] **Step 3: Run browser checks and inspect screenshots**

```bash
pnpm check:console-browser
pnpm check:crm-support-dashboard-browser
```

Expected: PASS at 390x844, 768x1024, and 1440x900 in dark and light modes.
Inspect screenshots under the output directories documented by each script and
confirm no overlap, clipping, false data, or illegible status.

- [ ] **Step 4: Document the expanded browser matrix**

Update `docs/build-from-source.md` to state that Console browser acceptance now
covers all 17 routes, three viewport classes, both themes, role-aware
navigation, and disabled Coming soon controls.

- [ ] **Step 5: Run fresh final verification**

```bash
pnpm --filter @opendx/console test
pnpm --filter @opendx/console typecheck
pnpm --filter @opendx/console build
node --check scripts/dev/console-browser-check.mjs
node --check scripts/dev/crm-support-dashboard-browser-check.mjs
git diff --check
pnpm audit:repo
pnpm check
```

Expected: all Console tests pass, production build succeeds, both browser
scripts parse, repository audit passes, and root validation exits zero. The
existing Vite large-chunk message, if unchanged and non-fatal, is reported as a
warning rather than hidden.

- [ ] **Step 6: Update changelog and commit**

```bash
git add scripts/dev/console-browser-check.mjs scripts/dev/crm-support-dashboard-browser-check.mjs docs/build-from-source.md CHANGELOG.md
git commit -m "test(console): verify Obsidian Flux redesign"
```

- [ ] **Step 7: Rebuild the local demonstration stack**

```bash
make up
docker compose --env-file .env -f infra/docker/docker-compose.yml ps
curl --fail --silent --show-error http://localhost:3000 >/dev/null
curl --fail --silent --show-error http://localhost:4000/health >/dev/null
```

Expected: Console and API return HTTP 200 and all long-running Compose services
report healthy.
