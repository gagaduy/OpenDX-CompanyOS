<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Console Night Mode Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted Console night-mode toggle while preserving the current dark Console as the default.

**Architecture:** Keep the behavior in the Console app shell because the shell owns the sidebar and wraps all protected Console pages. Apply theme values through existing CSS custom properties on `.consoleLayout[data-theme="..."]` so feature pages remain token consumers and do not need individual edits.

**Tech Stack:** React 19, React Router, TypeScript, CSS custom properties, Vitest, Testing Library, Vite.

## Global Constraints

- Do not add a light Console theme.
- Do not change Storefront theming.
- Do not change authentication, roles, API calls, or route structure.
- Do not introduce new dependencies.
- Persist using localStorage key `opendx.console.theme`.
- Valid theme values are exactly `dark` and `night`; invalid stored values fall back to `dark`.

---

### Task 1: Console shell theme toggle

**Files:**
- Modify: `apps/console/src/app/console-shell.test.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces DOM: `.consoleLayout[data-theme="dark" | "night"]`
- Produces localStorage key: `opendx.console.theme`
- Produces button labels: `Bật chế độ night` and `Tắt chế độ night`

- [ ] **Step 1: Write failing Console shell test**

Add a test that clears localStorage, renders `/products`, verifies the layout
starts with `data-theme="dark"`, clicks `Bật chế độ night`, verifies
`data-theme="night"` and persisted storage, then rerenders with an invalid
stored value and verifies fallback to `dark`.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
pnpm --filter @opendx/console test -- console-shell.test.tsx
```

Expected: FAIL because the theme toggle button and `data-theme` are missing.

- [ ] **Step 3: Implement minimal Console theme state**

In `ConsoleShell`, add local state initialized from `localStorage`, sanitize
stored values to `dark | night`, write changes back to storage, render
`data-theme`, and add the button near staff identity. Use `Moon` and `Sun` from
`lucide-react`.

- [ ] **Step 4: Add night CSS tokens**

In `globals.css`, keep root/current values as the default dark mode. Add
`.consoleLayout[data-theme="night"]` with deeper `--canvas`, `--surface-*`, and
`--hairline` values while leaving `--primary` unchanged.

- [ ] **Step 5: Update changelog**

Add one `[Unreleased]` entry describing the Console night-mode toggle.

- [ ] **Step 6: Verify focused and broad checks**

Run:

```bash
pnpm --filter @opendx/console test -- console-shell.test.tsx
pnpm --filter @opendx/console typecheck
pnpm --filter @opendx/console build
git diff --check
pnpm audit:repo
```

Expected: all pass.

- [ ] **Step 7: Rebuild runtime and commit**

Run:

```bash
make up
git add CHANGELOG.md apps/console/src/app/console-shell.tsx apps/console/src/app/console-shell.test.tsx apps/console/src/shared/styles/globals.css
git commit -m "feat(console): add night mode toggle"
```
