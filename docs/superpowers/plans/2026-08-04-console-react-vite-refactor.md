<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Console React Vite Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the current console into a React + TypeScript + Vite
feature-first structure while preserving its visible content, design tokens,
responsive layout, and single-page behavior.

**Architecture:** `main.tsx` boots the app, `app/` owns composition,
`features/company-overview` owns current product content, and `shared/styles`
owns global tokens and responsive rules. No router or global store is added
until multiple routes or cross-feature state exist.

**Tech Stack:** React 19, TypeScript strict mode, Vite, Vitest, React Testing
Library, jsdom, Lucide React, pnpm.

## Global Constraints

- Preserve all current visible copy and information hierarchy.
- Preserve `#010102` canvas and scarce `#5e6ad2` accent.
- Do not redesign, add product screens, router, store, or API behavior.
- Do not create unused feature subdirectories.
- Keep generated `dist`, coverage, and TypeScript build output ignored.
- Update dependency documentation and lockfile for actual package changes.
- Update `[Unreleased]` with each commit.

---

### Task 1: Record the Current Console Baseline

**Files:**
- Read: `apps/console/app/page.tsx`
- Read: `apps/console/app/globals.css`

**Interfaces:**
- Consumes: current Next.js page component.
- Produces: a verified pre-migration build and the stable copy used by the
  Task 3 behavior test.

- [ ] Run the current `pnpm --filter @opendx/console test` production-build
  command and confirm PASS before migration.
- [ ] Confirm the source contains `Company operating console`,
  `Mission Control`, `Human-governed`, and
  `Audit and provenance by default`.
- [ ] Record any baseline warning or failure before changing dependencies.

### Task 2: Prepare Vite Test and Build Tooling

**Files:**
- Create: `apps/console/index.html`
- Create: `apps/console/vite.config.ts`
- Create: `apps/console/src/test/setup.ts`
- Modify: `apps/console/package.json`
- Modify: `apps/console/tsconfig.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/dependencies.md`

**Interfaces:**
- Produces: `vite --port 3000`, `tsc --noEmit && vite build`, and `vitest run`
  scripts with jsdom and jest-dom setup.

- [ ] Install Vite, the React Vite plugin, jsdom, React Testing Library,
  jest-dom, and user-event as development dependencies using pnpm.
- [ ] Configure Vite React and Vitest jsdom with
  `src/test/setup.ts` importing `@testing-library/jest-dom/vitest`.
- [ ] Configure strict TypeScript for `src/**/*.ts` and `src/**/*.tsx`.
- [ ] Add `index.html` with `#root`, title `OpenDX CompanyOS`, and the current
  product description.
- [ ] Update dependency documentation with purpose and ownership.
- [ ] Run console typecheck; expected failure is limited to the not-yet-created
  Vite entry.
- [ ] Commit with `build(console): prepare vite toolchain`.

### Task 3: Move the Company Overview Feature

**Files:**
- Create: `apps/console/src/main.tsx`
- Create: `apps/console/src/app/app.tsx`
- Create:
  `apps/console/src/features/company-overview/company-overview.data.ts`
- Create:
  `apps/console/src/features/company-overview/pages/company-overview.page.tsx`
- Create:
  `apps/console/src/features/company-overview/components/overview-panel.tsx`
- Create:
  `apps/console/src/features/company-overview/components/operating-timeline.tsx`
- Create:
  `apps/console/src/features/company-overview/components/guardrail-list.tsx`
- Create:
  `apps/console/src/features/company-overview/tests/company-overview.page.test.tsx`
- Create: `apps/console/src/shared/styles/globals.css`

**Interfaces:**
- Produces: `CompanyOverviewPage`, `App`, and the Vite React entry.

- [ ] Write the new feature-page test for the four stable strings and confirm
  it fails because `CompanyOverviewPage` does not exist.
- [ ] Move typed static panel, timeline, and guardrail data out of JSX.
- [ ] Extract only the three repeated or responsibility-focused components
  listed above.
- [ ] Compose the page without changing visible text or icon meaning.
- [ ] Move global CSS unchanged and import it from `main.tsx`.
- [ ] Mount `<App />` through `createRoot`.
- [ ] Run the feature test, console typecheck, and Vite production build.
- [ ] Commit with `refactor(console): organize company overview feature`.

### Task 4: Remove Next.js Ownership

**Files:**
- Delete: `apps/console/app/page.tsx`
- Delete: `apps/console/app/layout.tsx`
- Delete: `apps/console/app/globals.css`
- Delete: `apps/console/next.config.ts`
- Delete: `apps/console/env.d.ts`
- Delete: `apps/console/next-env.d.ts`
- Modify: `apps/console/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Modify: `docs/dependencies.md`

**Interfaces:**
- Consumes: the green Vite entry and feature page.
- Produces: a console with no Next.js source or dependency ownership.

- [ ] Remove Next.js through pnpm and update the lockfile.
- [ ] Delete Next-specific source, configuration, and generated type files.
- [ ] Remove `.next` output from the working tree and retain its ignore rule.
- [ ] Search for `next dev`, `next build`, `from "next`, and `next.config` under
  source and manifests; expected no results.
- [ ] Run console tests, typecheck, and production build.
- [ ] Commit with `refactor(console): complete vite migration`.

### Task 5: Verify UI and Documentation

**Files:**
- Modify: `docs/project-structure.md`
- Modify: `docs/build-from-source.md`
- Modify: `CHANGELOG.md`

- [ ] Start `pnpm --filter @opendx/console dev` and verify
  `http://localhost:3000` at 1440x900 and 390x844.
- [ ] Confirm no blank page, overlap, clipping, missing icons, color drift, or
  horizontal overflow.
- [ ] Confirm `router/`, `store/`, and unused feature directories were not
  created.
- [ ] Run console tests, typecheck, build, `git diff --check`, and
  `pnpm audit:repo`.
- [ ] Update build and structure docs to describe Vite accurately.
- [ ] Commit with `docs(console): record react vite structure`.
