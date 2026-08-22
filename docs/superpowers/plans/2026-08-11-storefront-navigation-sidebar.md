<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Navigation Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Storefront top discovery taskbar and collapsed-left product filter sidebar without changing backend authority or database contracts.

**Architecture:** Keep the change inside `apps/storefront`. `StorefrontShell` owns global shell navigation/taskbar behavior, while catalog-specific category/filter controls remain under `features/catalog` and reuse the existing URL query contract. CSS stays in the current Storefront global stylesheet to match the existing layout system.

**Tech Stack:** React 19, React Router, TypeScript, Vite, Vitest, Testing Library, existing Storefront CSS tokens.

## Global Constraints

- Storefront-only UI change; no backend endpoints, database schema, seed data, checkout, payment, cart ownership, or customer session logic changes.
- Keep existing Storefront header actions: logo, search, theme toggle, account, and cart.
- Add taskbar labels exactly: `Sản phẩm mới`, `Bán chạy`, `Đang giảm`, `Còn hàng`, `Hỗ trợ`.
- Desktop sidebar is collapsed to icons by default and expands on hover/focus over content without pushing or reflowing the product grid.
- Mobile/tablet sidebar uses an explicit open/close control and must not depend on hover.
- Use existing catalog query parameters only: `query`, `category`, `minPriceVnd`, `maxPriceVnd`, `stockStatus`, `sort`, `pageSize`, `page`.
- Do not invent authoritative best-seller or discount data. Unsupported discovery intents may link to the catalog section but must not fake filters.
- Preserve existing Storefront light/dark theme tokens, skip link, `main` landmark, account/cart/hash navigation, and no page-level horizontal overflow.
- Update `CHANGELOG.md` under `[Unreleased]`.

---

## File Structure

- Modify `apps/storefront/src/app/storefront-shell.tsx`
  - Add shell taskbar markup below the header.
  - Add `id="support"` to the existing footer so `Hỗ trợ` scrolls to a real
    target without creating a new page.
  - Keep existing header and hash-scroll behavior.
  - Keep search/theme/account/cart actions unchanged.
- Modify `apps/storefront/src/app/storefront-shell.test.tsx`
  - Add regression coverage for taskbar labels and supported shortcut hrefs.
  - Preserve the existing hash-scroll test.
- Create `apps/storefront/src/features/catalog/components/discovery-sidebar.tsx`
  - Own the catalog-specific left sidebar UI.
  - Render collapsed icon rail, expanded category/filter panel, and mobile explicit open/close control.
  - Reuse existing `CatalogFilters`.
- Modify `apps/storefront/src/features/catalog/pages/home-page.tsx`
  - Render `DiscoverySidebar` with `discovery.categories`, `normalized`, and `setParameters`.
  - Keep the current catalog page data flow and product grid.
- Modify `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`
  - Add tests proving sidebar category/filter actions update existing catalog query flow.
- Modify `apps/storefront/src/shared/styles/globals.css`
  - Add taskbar, sidebar, overlay, collapsed rail, expanded panel, and responsive rules.
  - Use existing CSS variables; do not introduce unrelated colors.
- Modify `CHANGELOG.md`
  - Add one `[Unreleased]` bullet for the Storefront taskbar/sidebar UI.

---

### Task 1: Storefront taskbar shell

**Files:**
- Modify: `apps/storefront/src/app/storefront-shell.tsx`
- Modify: `apps/storefront/src/app/storefront-shell.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing `StorefrontShell({ cartCount, children })`, React Router `Link`, existing `/`, `/search`, `/account`, `/cart`, and `/#catalog` navigation.
- Produces: taskbar markup with `aria-label="Lối tắt khám phá"` and stable Vietnamese labels for Task 2 layout/browser checks.

- [ ] **Step 1: Write the failing taskbar test**

Append this test to `apps/storefront/src/app/storefront-shell.test.tsx`:

```tsx
it("renders customer discovery taskbar shortcuts below the Storefront header", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <ThemeProvider>
        <StorefrontShell cartCount={0}>
          <main id="main-content">
            <section id="catalog" aria-label="Catalog" />
          </main>
        </StorefrontShell>
      </ThemeProvider>
    </MemoryRouter>,
  );

  const taskbar = screen.getByRole("navigation", {
    name: "Lối tắt khám phá",
  });

  expect(within(taskbar).getByRole("link", { name: "Sản phẩm mới" })).toHaveAttribute(
    "href",
    "/?sort=newest#catalog",
  );
  expect(within(taskbar).getByRole("link", { name: "Bán chạy" })).toHaveAttribute(
    "href",
    "/#catalog",
  );
  expect(within(taskbar).getByRole("link", { name: "Đang giảm" })).toHaveAttribute(
    "href",
    "/#catalog",
  );
  expect(within(taskbar).getByRole("link", { name: "Còn hàng" })).toHaveAttribute(
    "href",
    "/?stockStatus=in_stock#catalog",
  );
  expect(within(taskbar).getByRole("link", { name: "Hỗ trợ" })).toHaveAttribute(
    "href",
    "/#support",
  );
  expect(document.getElementById("support")).toBeInstanceOf(HTMLElement);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx
```

Expected: FAIL because the navigation named `Lối tắt khám phá` does not exist.

- [ ] **Step 3: Add minimal taskbar markup**

In `StorefrontShell`, insert this immediately after `</header>` and before `{children ?? <Outlet />}`:

```tsx
      <nav className="discovery-taskbar" aria-label="Lối tắt khám phá">
        <Link to="/?sort=newest#catalog">Sản phẩm mới</Link>
        <Link to="/#catalog" title="Sắp có dữ liệu bán chạy">
          Bán chạy
        </Link>
        <Link to="/#catalog" title="Sắp có dữ liệu khuyến mãi">
          Đang giảm
        </Link>
        <Link to="/?stockStatus=in_stock#catalog">Còn hàng</Link>
        <Link to="/#support">Hỗ trợ</Link>
        <button
          className="taskbar-search"
          type="button"
          onClick={() => navigate("/search")}
        >
          Tìm nhanh sản phẩm
        </button>
      </nav>
```

Do not remove the existing header search button.

Change the existing footer opening tag to provide the support anchor:

```tsx
      <footer id="support" className="footer">
```

- [ ] **Step 4: Add taskbar styles**

Add this near the existing `.topbar` styles in `globals.css`:

```css
.discovery-taskbar {
  position: sticky;
  top: 76px;
  z-index: 28;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 max(32px, calc((100vw - 1320px) / 2));
  overflow-x: auto;
  border-bottom: 1px solid var(--hairline);
  background: var(--surface-2);
  color: var(--ink-muted);
  scrollbar-width: none;
}

.discovery-taskbar::-webkit-scrollbar {
  display: none;
}

.discovery-taskbar a,
.taskbar-search {
  min-height: 30px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  background: var(--surface-1);
  color: var(--ink-muted);
  font-size: 12px;
  font-weight: 600;
}

.discovery-taskbar a:hover,
.taskbar-search:hover,
.discovery-taskbar a:focus-visible,
.taskbar-search:focus-visible {
  border-color: var(--primary);
  color: var(--ink);
}

.taskbar-search {
  margin-left: auto;
  cursor: pointer;
}
```

Inside the existing `@media (max-width: 768px)` block, add:

```css
  .discovery-taskbar {
    top: 64px;
    padding: 8px 14px;
  }

  .taskbar-search {
    margin-left: 0;
  }
```

- [ ] **Step 5: Update changelog for Task 1**

Under `## [Unreleased]` in `CHANGELOG.md`, add:

```markdown
- Add a Storefront customer discovery taskbar and collapsible catalog filter
  sidebar design implementation.
```

- [ ] **Step 6: Run focused verification**

Run:

```bash
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx
pnpm --filter @opendx/storefront typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add CHANGELOG.md apps/storefront/src/app/storefront-shell.tsx apps/storefront/src/app/storefront-shell.test.tsx apps/storefront/src/shared/styles/globals.css
git commit -m "feat(storefront): add discovery taskbar"
```

---

### Task 2: Catalog discovery sidebar

**Files:**
- Create: `apps/storefront/src/features/catalog/components/discovery-sidebar.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/home-page.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`

**Interfaces:**
- Consumes: `CatalogFilters({ categories, parameters, onSubmit })`, `StorefrontCategory`, `URLSearchParams`, and `setParameters` from `useSearchParams`.
- Produces: `DiscoverySidebar({ categories, parameters, onSubmit })` component for the HomePage catalog surface.

- [ ] **Step 1: Write the failing sidebar test**

Append this test to `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`:

```tsx
it("exposes a collapsed filter sidebar that applies existing catalog query parameters", async () => {
  const products = vi.fn(async (parameters: URLSearchParams) => ({
    items: [product],
    page: Number(parameters.get("page") ?? "1"),
    pageSize: 12,
    totalItems: 1,
    totalPages: 1,
  }));
  const api = {
    products,
    categories: vi.fn(async () => [
      { id: "category-1", name: "Phones", slug: "phones", sortOrder: 0 },
      { id: "category-2", name: "Laptops", slug: "laptops", sortOrder: 1 },
    ]),
  } as unknown as StorefrontCatalogApi;

  render(
    <MemoryRouter initialEntries={["/"]}>
      <HomePage api={api} apiBaseUrl="http://localhost:4000" />
    </MemoryRouter>,
  );

  const sidebar = await screen.findByRole("complementary", {
    name: "Danh mục và bộ lọc sản phẩm",
  });
  expect(
    within(sidebar).getByRole("button", { name: "Mở bộ lọc sản phẩm" }),
  ).toHaveAttribute("aria-expanded", "false");

  await userEvent.click(
    within(sidebar).getByRole("button", { name: "Mở bộ lọc sản phẩm" }),
  );

  expect(
    within(sidebar).getByRole("button", { name: "Đóng bộ lọc sản phẩm" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(within(sidebar).getByRole("link", { name: "Phones" })).toHaveAttribute(
    "href",
    "/?category=phones&pageSize=12#catalog",
  );

  await userEvent.selectOptions(
    within(sidebar).getByLabelText("Tồn kho"),
    "in_stock",
  );
  await userEvent.click(within(sidebar).getByRole("button", { name: "Áp dụng" }));

  await waitFor(() => expect(products).toHaveBeenCalledTimes(2));
  expect(
    (products.mock.calls[1]?.[0] as URLSearchParams).get("stockStatus"),
  ).toBe("in_stock");
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
pnpm --filter @opendx/storefront test -- catalog-discovery.test.tsx
```

Expected: FAIL because `DiscoverySidebar` and the complementary region do not exist.

- [ ] **Step 3: Create `DiscoverySidebar`**

Create `apps/storefront/src/features/catalog/components/discovery-sidebar.tsx`:

```tsx
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Filter, Laptop, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CatalogFilters } from "./catalog-filters";
import type { StorefrontCategory } from "../types/catalog.types";

export function DiscoverySidebar({
  categories,
  parameters,
  onSubmit,
}: {
  readonly categories: readonly StorefrontCategory[];
  readonly parameters: URLSearchParams;
  readonly onSubmit: (next: URLSearchParams) => void;
}) {
  const [open, setOpen] = useState(false);
  const pageSize = parameters.get("pageSize") ?? "12";

  return (
    <aside
      className={open ? "discovery-sidebar open" : "discovery-sidebar"}
      aria-label="Danh mục và bộ lọc sản phẩm"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
    >
      <button
        className="sidebar-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="discovery-sidebar-panel"
        aria-label={open ? "Đóng bộ lọc sản phẩm" : "Mở bộ lọc sản phẩm"}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X aria-hidden="true" /> : <SlidersHorizontal aria-hidden="true" />}
      </button>
      <div className="sidebar-icon-rail" aria-hidden="true">
        <Filter />
        <Laptop />
      </div>
      <div id="discovery-sidebar-panel" className="sidebar-panel">
        <div className="sidebar-section">
          <span className="eyebrow">Danh mục</span>
          <div className="sidebar-category-list">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/?category=${encodeURIComponent(category.slug)}&pageSize=${encodeURIComponent(pageSize)}#catalog`}
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
        <div className="sidebar-section">
          <span className="eyebrow">Bộ lọc</span>
          <CatalogFilters
            categories={categories}
            parameters={parameters}
            onSubmit={(next) => {
              setOpen(false);
              onSubmit(next);
            }}
          />
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Render sidebar in HomePage**

In `apps/storefront/src/features/catalog/pages/home-page.tsx`, add the import:

```tsx
import { DiscoverySidebar } from "../components/discovery-sidebar";
```

Render the sidebar as the first child inside `<main id="main-content">`:

```tsx
      <DiscoverySidebar
        categories={discovery.categories}
        parameters={normalized}
        onSubmit={setParameters}
      />
```

Keep the existing inline `CatalogFilters` in the catalog browser for now. This avoids changing the current catalog page contract while adding the requested left panel.

- [ ] **Step 5: Add sidebar styles**

Add this to `apps/storefront/src/shared/styles/globals.css` near the catalog/filter styles:

```css
.discovery-sidebar {
  position: fixed;
  top: 118px;
  bottom: 24px;
  left: 0;
  z-index: 26;
  width: 56px;
  display: flex;
  align-items: stretch;
  border: 1px solid var(--hairline);
  border-left: 0;
  border-radius: 0 16px 16px 0;
  background: var(--surface-2);
  box-shadow: 0 18px 60px rgb(0 0 0 / 18%);
  transition: width 180ms ease;
}

.discovery-sidebar.open,
.discovery-sidebar:hover,
.discovery-sidebar:focus-within {
  width: min(360px, calc(100vw - 32px));
}

.sidebar-toggle {
  position: absolute;
  top: 12px;
  left: 8px;
  z-index: 2;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  background: var(--surface-1);
  color: var(--ink);
  cursor: pointer;
}

.sidebar-toggle svg,
.sidebar-icon-rail svg {
  width: 18px;
  height: 18px;
}

.sidebar-icon-rail {
  width: 56px;
  padding-top: 64px;
  display: flex;
  align-items: center;
  flex: none;
  flex-direction: column;
  gap: 18px;
  color: var(--ink-muted);
}

.sidebar-panel {
  width: 304px;
  padding: 64px 18px 20px;
  overflow-y: auto;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-8px);
  transition: opacity 160ms ease, transform 160ms ease;
}

.discovery-sidebar.open .sidebar-panel,
.discovery-sidebar:hover .sidebar-panel,
.discovery-sidebar:focus-within .sidebar-panel {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
}

.sidebar-section + .sidebar-section {
  margin-top: 22px;
}

.sidebar-category-list {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.sidebar-category-list a {
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  background: var(--surface-1);
  color: var(--ink);
}

.sidebar-category-list a:hover,
.sidebar-category-list a:focus-visible {
  border-color: var(--primary);
}
```

Inside `@media (max-width: 768px)`, add:

```css
  .discovery-sidebar {
    top: 106px;
    bottom: 16px;
    width: 48px;
  }

  .discovery-sidebar.open,
  .discovery-sidebar:hover,
  .discovery-sidebar:focus-within {
    width: min(340px, calc(100vw - 24px));
  }

  .sidebar-icon-rail {
    width: 48px;
  }

  .sidebar-panel {
    width: calc(min(340px, calc(100vw - 24px)) - 48px);
    padding-right: 14px;
    padding-left: 14px;
  }
```

- [ ] **Step 6: Run focused sidebar verification**

Run:

```bash
pnpm --filter @opendx/storefront test -- catalog-discovery.test.tsx
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx
pnpm --filter @opendx/storefront typecheck
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add apps/storefront/src/features/catalog/components/discovery-sidebar.tsx apps/storefront/src/features/catalog/pages/home-page.tsx apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx apps/storefront/src/shared/styles/globals.css
git commit -m "feat(storefront): add catalog filter sidebar"
```

---

### Task 3: Full Storefront validation and browser layout check

**Files:**
- Modify only if verification exposes a concrete Storefront regression:
  `apps/storefront/src/app/storefront-shell.tsx`,
  `apps/storefront/src/features/catalog/components/discovery-sidebar.tsx`,
  `apps/storefront/src/features/catalog/pages/home-page.tsx`,
  `apps/storefront/src/shared/styles/globals.css`,
  or the focused Storefront tests.

**Interfaces:**
- Consumes: Task 1 taskbar and Task 2 sidebar.
- Produces: final verified Storefront UI with source, build, and browser evidence.

- [ ] **Step 1: Run the full Storefront test suite**

Run:

```bash
pnpm --filter @opendx/storefront test
```

Expected: all Storefront tests pass.

- [ ] **Step 2: Run Storefront typecheck and production build**

Run:

```bash
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
```

Expected: both commands exit 0.

- [ ] **Step 3: Rebuild and run local stack**

Run:

```bash
make up
```

Expected: Docker Compose exits 0 and reports `api`, `console`, and `storefront` healthy.

- [ ] **Step 4: Run browser acceptance for layout risk**

Run:

```bash
pnpm check:storefront-browser
```

Expected: command exits 0 with no horizontal overflow at configured desktop and mobile viewport checks.

- [ ] **Step 5: Run repository hygiene**

Run:

```bash
git diff --check
pnpm audit:repo
```

Expected: both commands exit 0.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git diff --stat HEAD~2..HEAD
git status --short
```

Expected: only Storefront UI/test/CSS and `CHANGELOG.md` files are changed by Task 1 and Task 2 commits; worktree is clean.

- [ ] **Step 7: If Task 3 required verification fixes, commit them**

Only if Step 1-5 exposed and fixed a concrete issue, run:

```bash
git add apps/storefront/src CHANGELOG.md
git commit -m "fix(storefront): stabilize discovery sidebar layout"
```

Expected: no commit is created if no verification fix was necessary.
