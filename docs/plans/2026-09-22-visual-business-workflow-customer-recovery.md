<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Visual Business Workflow Studio & Customer Recovery Workflow Implementation Plan

## Goal

Implement the **Visual Business Workflow Studio** inside `apps/console` with an interactive, business-language visual canvas modeling **Workflow 2: Customer Recovery & Complaint Resolution (Cứu Khách Hàng Khiếu Nại & Bồi Thường Nhanh)**.

## Scope & Non-Negotiable Boundaries

- **Zero Technical Jargon**: Render all blocks in natural Vietnamese business terminology (*Sự kiện, Phân tích AI, Chờ Sếp duyệt, Thực thi*).
- **Clean Architecture & Domain Rules**: Place all visual workflow presentation files under `apps/console/src/features/workflows/`.
- **License & Conventions**: Include Apache-2.0 SPDX header in every new source file, conventional commit messages, and record additions in `CHANGELOG.md`.

---

## Tasks

### Task 1: Design Types & Workflow Fixtures
- File: `apps/console/src/features/workflows/types.ts`
  - Define `BusinessWorkflowNode`, `BusinessWorkflowEdge`, `BusinessNodeType`, `BusinessWorkflowDefinition`.
  - Include canonical fixture for **Workflow 2: Customer Recovery**:
    - Node 1: Khách gửi khiếu nại qua email/livechat (`event`)
    - Node 2: Chuyên viên CSKH AI phân tích thái độ & đề xuất voucher 15% (`ai_analysis`)
    - Node 3: Chờ Trưởng phòng CSKH duyệt phương án bồi thường (`approval_gate`)
    - Node 4: Hệ thống tự động gửi email xin lỗi & kích hoạt voucher (`action`)

### Task 2: Implement Visual Card & Canvas Components
- Files:
  - `apps/console/src/features/workflows/components/business-node-card.tsx`
  - `apps/console/src/features/workflows/components/workflow-canvas.tsx`
  - `apps/console/src/features/workflows/components/workflow-inspector-drawer.tsx`
  - `apps/console/src/features/workflows/styles/workflows.css`
- Responsibilities:
  - Render high-contrast, Linear-styled business cards with custom status badges, department pills, and quick-action buttons.
  - Render visual SVG connector lines/wires between nodes showing flow progression.
  - Support clicking on nodes to open the inspection drawer showing real-world business context.
  - Interactive approval simulation: clicking **[Đồng ý duyệt]** simulates approval completion with instant visual feedback.

### Task 3: Build Workflow Studio Page
- File: `apps/console/src/features/workflows/pages/workflow-studio-page.tsx`
- Responsibilities:
  - Header with workflow switcher, active status badge, and workflow summary metrics.
  - Main canvas viewport with zooming/scrolling controls and simulation reset button.

### Task 4: Integrate Routing and Navigation in Console Shell
- Files:
  - `apps/console/src/app/routes.tsx`
  - `apps/console/src/app/console-shell.tsx`
- Responsibilities:
  - Register route `/agentic/workflows` pointing to `WorkflowStudioPage`.
  - Add navigation item `Workflows` with icon under `Digital Workforce` menu group.

### Task 5: Unit & Component Tests
- File: `apps/console/src/features/workflows/tests/workflow-studio.test.tsx`
- Verify:
  - Canvas renders all 4 business nodes correctly.
  - Clicking a node opens the inspection drawer.
  - Clicking approve button transitions the workflow state to completed.

### Task 6: Changelog Record
- Update `CHANGELOG.md` under `[Unreleased]`.
