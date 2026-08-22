<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Header Layout Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the NovaCommerce Storefront header and discovery shortcut row into one balanced commerce navigation system without changing the current color theme.

**Architecture:** Keep the Storefront shell as the owner of global navigation structure. Use lightweight semantic wrappers and CSS-only layout changes so route behavior, theme behavior, and feature boundaries remain unchanged.

**Tech Stack:** React, TypeScript, React Router, Vitest, Testing Library, Vite, shared Storefront CSS tokens.

## Global Constraints

- Scope is limited to `apps/storefront` UI layout and tests.
- Keep the existing NovaCommerce color/theme tokens instead of changing to a yellow retail theme.
- Keep `Sản phẩm mới` as the newest shortcut label.
- Keep account, cart, search, theme, and hash navigation behavior intact.
- Preserve the collapsed left sidebar behavior from the prior approved design.
- Preserve responsive behavior without horizontal overflow on mobile, tablet, and desktop.
- Do not change backend, database, seed, auth, checkout, or catalog API behavior.
- Update `CHANGELOG.md` under `[Unreleased]` in the same code unit.

---

## File Structure

- Modify `apps/storefront/src/app/storefront-shell.tsx`
  - Owns the global header and discovery shortcut row.
  - Adds inner layout wrappers only; no route target changes.
- Modify `apps/storefront/src/app/storefront-shell.test.tsx`
  - Verifies the aligned discovery row remains accessible and quick search is inside the aligned row.
- Modify `apps/storefront/src/shared/styles/globals.css`
  - Owns the header/taskbar spacing, max-width, responsive behavior, and compact retail-like alignment using existing tokens.
- Modify `CHANGELOG.md`
  - Records the Storefront layout refinement under `[Unreleased]`.

---

### Task 1: Align Storefront header and shortcut row

**Files:**
- Modify: `apps/storefront/src/app/storefront-shell.tsx`
- Modify: `apps/storefront/src/app/storefront-shell.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes:
  - Existing `StorefrontShell({ cartCount, children })` component.
  - Existing `/search`, `/#catalog`, `/#categories`, `/#support`, `/?sort=newest#catalog`, and `/?stockStatus=in_stock#catalog` route targets.
- Produces:
  - `.topbar-inner`: shared max-width wrapper for brand, primary nav, and actions.
  - `.discovery-taskbar-inner`: shared max-width wrapper for discovery shortcuts and quick-search action.
  - Existing `aria-label="Lối tắt khám phá"` navigation remains available to tests and assistive technology.

- [ ] **Step 1: Write the failing shell layout test**

In `apps/storefront/src/app/storefront-shell.test.tsx`, extend the existing taskbar test with structure assertions:

```tsx
const taskbar = screen.getByRole("navigation", {
  name: "Lối tắt khám phá",
});
expect(taskbar.querySelector(".discovery-taskbar-inner")).not.toBeNull();
expect(
  within(taskbar).getByRole("button", { name: "Tìm nhanh sản phẩm" }),
).toHaveClass("taskbar-search");
expect(
  within(taskbar).getByRole("link", { name: "Sản phẩm mới" }),
).toHaveAttribute("href", "/?sort=newest#catalog");
```

Add one header wrapper assertion near the primary navigation checks:

```tsx
expect(document.querySelector(".topbar-inner")).not.toBeNull();
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx
```

Expected: FAIL because `.topbar-inner` and `.discovery-taskbar-inner` do not exist.

- [ ] **Step 3: Add shell wrappers without changing route behavior**

In `apps/storefront/src/app/storefront-shell.tsx`, wrap current header children:

```tsx
<header className="topbar">
  <div className="topbar-inner">
    <Link className="brand" to="/">
      <span>NovaCommerce</span>
    </Link>
    ...
    <div className="topbar-actions">...</div>
  </div>
</header>
```

Wrap current discovery row children:

```tsx
<nav className="discovery-taskbar" aria-label="Lối tắt khám phá">
  <div className="discovery-taskbar-inner">
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
  </div>
</nav>
```

- [ ] **Step 4: Update CSS to align the rows**

In `apps/storefront/src/shared/styles/globals.css`, update the header/taskbar block so `.topbar` and `.discovery-taskbar` own only full-width sticky surfaces, while their inner wrappers own alignment:

```css
.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: block;
  border-bottom: 1px solid var(--hairline);
  background: var(--header);
  backdrop-filter: blur(18px);
}

.topbar-inner {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
  align-items: center;
  gap: 24px;
  width: min(100%, 1320px);
  margin: 0 auto;
  padding: 18px clamp(20px, 4vw, 42px);
}

.topbar-actions {
  justify-content: flex-end;
}

.discovery-taskbar {
  position: sticky;
  top: 69px;
  z-index: 35;
  border-bottom: 1px solid var(--hairline);
  background: var(--header);
  backdrop-filter: blur(18px);
}

.discovery-taskbar-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(100%, 1320px);
  margin: 0 auto;
  overflow-x: auto;
  padding: 8px clamp(20px, 4vw, 42px);
  scrollbar-width: none;
}

.discovery-taskbar-inner::-webkit-scrollbar {
  display: none;
}

.discovery-taskbar a,
.taskbar-search {
  flex: 0 0 auto;
}

.taskbar-search {
  margin-left: auto;
}
```

Adjust the existing mobile media block so the taskbar does not overflow:

```css
@media (max-width: 768px) {
  .topbar-inner {
    grid-template-columns: 1fr auto;
    gap: 12px;
    padding: 14px 16px;
  }

  .discovery-taskbar {
    top: 61px;
  }

  .discovery-taskbar-inner {
    padding: 8px 16px;
  }

  .taskbar-search {
    margin-left: 0;
  }
}
```

Use the current file's existing selectors as source of truth. If a listed rule already exists, edit it rather than adding duplicate conflicting blocks.

- [ ] **Step 5: Update changelog**

Add under `CHANGELOG.md` `[Unreleased]`:

```markdown
- Align the Storefront header and discovery shortcut row into one compact commerce navigation layout.
```

- [ ] **Step 6: Run focused GREEN checks**

Run:

```bash
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx
pnpm --filter @opendx/storefront typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add apps/storefront/src/app/storefront-shell.tsx apps/storefront/src/app/storefront-shell.test.tsx apps/storefront/src/shared/styles/globals.css CHANGELOG.md
git commit -m "fix(storefront): align header discovery layout"
```

---

### Task 2: Validate Storefront layout end-to-end

**Files:**
- Inspect: `apps/storefront/src/app/storefront-shell.tsx`
- Inspect: `apps/storefront/src/shared/styles/globals.css`
- Possible modify: `apps/storefront/src/shared/styles/globals.css`

**Interfaces:**
- Consumes:
  - Task 1 `.topbar-inner` and `.discovery-taskbar-inner`.
- Produces:
  - Verified Storefront shell with no horizontal overflow on supported browser-check viewports.

- [ ] **Step 1: Run Storefront full checks**

Run:

```bash
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
```

Expected: all commands exit 0.

- [ ] **Step 2: Rebuild and run local stack**

Run:

```bash
make up
```

Expected: Docker Compose exits 0 and reports API, Console, and Storefront healthy.

- [ ] **Step 3: Run browser layout check**

Run:

```bash
pnpm check:storefront-browser
```

Expected:

- `documentWidth` is not greater than `viewportWidth` for mobile, tablet, or desktop evidence.
- `hasMain` is `true`.
- `alertText` is `null`.
- Product images are complete.

- [ ] **Step 4: Fix any browser layout regression**

If browser check reports horizontal overflow, adjust only `apps/storefront/src/shared/styles/globals.css`. Prefer reducing padding/gap or making row items `flex: 0 0 auto` inside horizontal scroll. Do not remove navigation items or change route targets.

Run after any fix:

```bash
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx
pnpm --filter @opendx/storefront build
pnpm check:storefront-browser
```

Expected: all commands exit 0.

- [ ] **Step 5: Run repository final checks**

Run:

```bash
git diff --check
pnpm audit:repo
pnpm check
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit validation fix only if needed**

If Step 4 required CSS changes after Task 1 commit, run:

```bash
git add apps/storefront/src/shared/styles/globals.css
git commit -m "fix(storefront): stabilize aligned header responsiveness"
```

If no files changed after Task 1, do not create an empty commit.
