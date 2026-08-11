<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Introduction Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/` a Storefront introduction homepage and move product discovery to `/products`.

**Architecture:** Keep routing composition in `apps/storefront/src/app/app-router.tsx`. Keep the static introduction page under the owning catalog/customer discovery feature because it is Storefront-facing commerce introduction content and has no backend dependency. Keep shell navigation as the single source for header/footer/taskbar links.

**Tech Stack:** React 19, React Router, TypeScript, CSS custom properties, Vitest, Testing Library, Vite.

## Global Constraints

- `/` becomes the Storefront introduction homepage.
- `/products` becomes the product discovery/catalog page currently served at `/`.
- Header navigation shows `Trang chủ`, `Sản phẩm`, `Danh mục`, and `Khám phá`.
- Existing catalog hash links move to `/products#categories` and `/products#catalog`.
- Existing product query shortcuts continue to target the catalog route.
- The homepage is static marketing/intro content only; it does not create new backend APIs, payments, shipping, marketplace, refund, or account behavior.
- Preserve the Storefront light/dark theme system.
- Do not duplicate catalog fetching on the static homepage.

---

### Task 1: Storefront routes and shell navigation

**Files:**
- Create: `apps/storefront/src/features/catalog/pages/intro-home-page.tsx`
- Modify: `apps/storefront/src/app/app-router.tsx`
- Modify: `apps/storefront/src/app/storefront-shell.tsx`
- Modify: `apps/storefront/src/app/storefront-shell.test.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces route `/` rendering `IntroHomePage`.
- Produces route `/products` rendering existing `HomePage` catalog discovery.
- Produces nav targets:
  - `Trang chủ` -> `/`
  - `Sản phẩm` -> `/products`
  - `Danh mục` -> `/products#categories`
  - `Khám phá` -> `/products#catalog`
  - shortcut queries -> `/products?...#catalog`

- [ ] **Step 1: Write failing tests**

Update `storefront-shell.test.tsx` to expect `Trang chủ`, `Sản phẩm`,
`Danh mục`, and `Khám phá` header links with the targets listed above. Update
taskbar shortcut expectations to target `/products`.

Add or update a routing/catalog test so rendering `/products` still calls the
catalog API and rendering `/` displays introduction copy without requiring a
catalog response.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx catalog-discovery.test.tsx
```

Expected: FAIL because `/` still renders catalog and navigation still targets
old `/` links.

- [ ] **Step 3: Implement route and page**

Create `IntroHomePage` with a static `<main id="main-content" className="intro-home-page">`. Include headings/copy:

- `NovaCommerce`
- `Website bán đồ công nghệ tổng hợp`
- `Xem sản phẩm` link to `/products`
- `Khám phá danh mục` link to `/products#categories`

Update `app-router.tsx` so `/` renders `IntroHomePage` and `/products` renders
the existing `HomePage`.

- [ ] **Step 4: Update Storefront shell links**

Update `storefront-shell.tsx` header, search submit target, taskbar, and footer
links so catalog destinations use `/products` while `Trang chủ` uses `/`.

- [ ] **Step 5: Add CSS for the intro page**

Add compact, token-based CSS in `globals.css` for `.intro-home-page`,
`.intro-hero`, `.intro-actions`, and intro value cards. Use existing token
variables only.

- [ ] **Step 6: Update changelog**

Add one `[Unreleased]` entry describing the dedicated Storefront introduction
homepage and moved product catalog route.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm --filter @opendx/storefront test -- storefront-shell.test.tsx catalog-discovery.test.tsx
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
git diff --check
pnpm audit:repo
```

Expected: all pass.

- [ ] **Step 8: Rebuild runtime and commit**

Run:

```bash
make up
pnpm check:storefront-browser
git add CHANGELOG.md apps/storefront/src docs/superpowers/specs/2026-08-11-storefront-introduction-homepage-design.md docs/superpowers/plans/2026-08-11-storefront-introduction-homepage.md
git commit -m "feat(storefront): add introduction homepage"
```
