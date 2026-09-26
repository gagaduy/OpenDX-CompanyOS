<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Live Backend Integration for Visual Customer Recovery Workflow Plan

## Goal
Connect the Visual Business Workflow Studio (`apps/console/src/features/workflows`) to real backend services in `apps/api/src/modules/support`, enabling real ticket loading, AI Support proposal hydration, and live Sếp approval execution.

---

## Tasks

### Task 1: Extend Workflow Studio Page with Live Data Fetching
- File: `apps/console/src/features/workflows/pages/workflow-studio-page.tsx`
- Responsibilities:
  - Accept optional `supportApi?: SupportOperationsApi` prop.
  - On mount, if `supportApi` is present, fetch the latest actionable ticket via `supportApi.list()` and the latest AI proposal via `supportApi.getLatestSupportProposal()`.
  - Dynamically hydrate Node 1 (real customer name, ticket subject, ticket ID) and Node 2 (AI recommendation, discount voucher code).
  - Provide live approval handler calling `supportApi.applySupportProposal(proposalId, items)` when Sếp clicks **[Duyệt Phương Án]**.
  - Show a visual badge distinguishing between `🟢 Dữ liệu thật từ Hệ Thống` and `🟡 Chế độ mô phỏng`.

### Task 2: Inject SupportApi in Console Router
- File: `apps/console/src/app/app-router.tsx`
- Responsibilities:
  - In `WorkflowStudioRoute`, instantiate `supportApi` with `session?.accessToken` and pass it to `WorkflowStudioPage`.

### Task 3: Comprehensive Tests
- File: `apps/console/src/features/workflows/tests/workflow-studio.test.tsx`
- Responsibilities:
  - Test live data hydration when `supportApi` is provided.
  - Test approval mutation triggering `supportApi.applySupportProposal`.
  - Maintain 100% pass rate for fallback fixture tests.

### Task 4: Changelog & Build Verification
- Files: `CHANGELOG.md`
- Responsibilities:
  - Document the backend integration under `[Unreleased]`.
  - Run `pnpm --filter @opendx/console build` and vitest.
