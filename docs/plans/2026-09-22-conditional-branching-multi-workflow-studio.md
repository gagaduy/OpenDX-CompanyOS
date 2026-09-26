<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Implementation Plan: Conditional Branching & Multi-Workflow Studio

## Proposed Changes

### 1. Domain Types & Workflow Blueprints (`apps/console/src/features/workflows/types.ts`)
- Add `decision_router` node type to `WorkflowNodeType`.
- Define 3 full CompanyOS Workflow Blueprints:
  1. `CUSTOMER_RECOVERY_WORKFLOW`:
     - Step 1 (Trigger): Inbound Customer Complaint
     - Step 2 (AI Analysis): Sentiment & Damage Assessment
     - Step 3 (Decision Router): Policy Threshold ($\le 200.000$ đ vs $> 200.000$ đ / VIP)
     - Step 4A (Auto Action): Auto-send voucher in 30s
     - Step 4B (Approval Gate): Route to Approvals Inbox (`/agentic/approvals`)
  2. `MARKETING_LAUNCH_WORKFLOW`:
     - Step 1 (Trigger): New Product Published in Catalog
     - Step 2 (AI Analysis): Creative Copywriting & Visual Asset Generation
     - Step 3 (Decision Router): Budget Scope (Organic Post $\le 0$ đ vs Paid Boost $> 0$ đ)
     - Step 4A (Auto Action): Auto-publish Organic Post to Facebook & Instagram
     - Step 4B (Approval Gate): Sếp duyệt ngân sách chạy quảng cáo (Paid Ad Approval)
  3. `INVENTORY_REPLENISH_WORKFLOW`:
     - Step 1 (Trigger): Low Stock Warning ($\le$ Minimum Threshold)
     - Step 2 (AI Analysis): Sales Velocity Forecast & PO Drafting
     - Step 3 (Decision Router): PO Total Value ($\le 10.000.000$ đ vs $> 10.000.000$ đ)
     - Step 4A (Auto Action): Auto-dispatch Purchase Order to Supplier via EDI/Email
     - Step 4B (Approval Gate): Sếp duyệt thanh toán đơn nhập hàng lớn

### 2. Visual Nodes & Branching Layout (`business-node.tsx`, `workflow-canvas.tsx`, `workflows.css`)
- Expand card width to `320px` to completely eliminate title ellipsis truncation (`...`).
- Allow `white-space: normal` and flexible multi-line title rendering.
- For `decision_router` nodes, display dual branch condition tags:
  - Top: `[Tự động] Thiệt hại ≤ 200.000 đ`
  - Bottom: `[Sếp duyệt] Thiệt hại > 200.000 đ hoặc VIP`
- In `WorkflowCanvas`:
  - Calculate branch positions for Step 4A (top branch) and Step 4B (bottom branch) gracefully.
  - Draw custom colored edges: Emerald green for Auto-execution branch, Amber for Human Approval branch.
  - Add MiniMap with dark glassmorphism style.

### 3. Studio Header & Workflow Switcher (`workflow-studio-page.tsx`)
- Add a dropdown in the Studio Header to switch between the 3 workflows.
- Add "Chạy Thử Nghiệm" (Simulation Run) button:
  - When clicked, tests against sample/live case and animates the active branch.
- Add "Cài Đặt Luật" in Inspector Drawer when clicking the Decision Router node, allowing managers to see threshold rules.

### 4. Tests & Verification
- Update and extend `workflow-studio.test.tsx`:
  - Verify switching between the 3 workflows.
  - Verify decision router node renders both branches.
  - Verify test run simulation animates and selects the correct branch.
- Run `pnpm --filter @opendx/console test` and `pnpm --filter @opendx/console build`.

