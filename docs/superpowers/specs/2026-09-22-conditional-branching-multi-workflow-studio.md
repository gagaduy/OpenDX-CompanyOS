<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Design Spec: Conditional Branching & Multi-Workflow Studio (IPaaS Blueprint Architecture)

## 1. Problem & Context
The initial prototype of the Visual Business Workflow Studio represented a single case execution directly on the canvas, leading to confusion between:
1. **Case-level execution / Task Inbox (`/agentic/approvals`)**: Where human managers approve individual tickets day-to-day.
2. **Workflow Studio / Automation Pipeline (`/agentic/workflows`)**: Where business leaders define, govern, and simulate enterprise-wide automation blueprints.

Furthermore, real-world business workflows are non-linear: they route events based on **business thresholds (Hạn mức & Luật nghiệp vụ)**. For example:
- Minor complaints ($\le 200.000$ VND): Handled 100% automatically by AI in under 30 seconds.
- High-value or VIP complaints ($> 200.000$ VND or VIP Diamond): Escalate to the human Approval Inbox.

Lastly, the canvas card headers suffered from awkward ellipsis truncation (`...`), and users could only view one workflow without the ability to switch between core enterprise operational flows (Customer Recovery, Marketing Campaign, Inventory Replenishment).

## 2. Goals & Principles
1. **True IPaaS Blueprint Model**:
   - Model the workflow as a repeatable operational pipeline with **Conditional Decision Routing** (Phân luồng điều kiện).
   - The decision node routes traffic based on policy rules, not manual card-by-card approval.
2. **Multi-Workflow Catalog**:
   - Provide a clean Workflow Switcher dropdown to explore 3 flagship CompanyOS blueprints:
     1. `WF-CSKH-RECOVERY`: Cứu Khách Hàng Khiếu Nại & Bồi Thường Nhanh.
     2. `WF-MKT-CAMPAIGN`: Kích Hoạt Chiến Dịch Marketing & Đa Kênh.
     3. `WF-INV-REPLENISH`: Cảnh Báo Tồn Kho & Tự Động Đề Xuất Nhập Hàng.
3. **Interactive Simulation / Test Run**:
   - Provide a "Chạy Thử Nghiệm" (Test Run) action that feeds a real test case (e.g. ticket from PostgreSQL) into the pipeline and animates the active branch flow.
4. **Visual Polish & Zero Truncation**:
   - Increase card width (320px), allow 2-line title wrapping, remove aggressive text truncation.
   - Add MiniMap and styled branch edges (Green for Auto-approved path, Amber for Human-governed path).
   - Maintain Zero IT Jargon (*Sự kiện, Phân tích AI, Phân luồng luật, Tự động thực thi, Chờ Sếp duyệt*).

## 3. Architecture & Interfaces
- **Definition Schema (`apps/console/src/features/workflows/types.ts`)**:
  - Extend node types to include `decision_router`.
  - Add `conditionBranches`:
    - Branch 1: `auto` (condition: "Thiệt hại $\le$ 200.000 đ", targetNodeId: "node-4a-auto")
    - Branch 2: `escalation` (condition: "Thiệt hại > 200.000 đ hoặc VIP", targetNodeId: "node-4b-approval")
  - Provide 3 built-in workflow definitions.
- **Node Component (`business-node.tsx`)**:
  - Support dual source handles (`source-auto`, `source-escalate`) for router nodes.
  - Multi-line comfortable typography for titles without ellipsis.
- **Canvas Component (`workflow-canvas.tsx`)**:
  - Add MiniMap with custom glassmorphism theme.
  - Animate only the active executed path during simulation.
- **Studio Page (`workflow-studio-page.tsx`)**:
  - Workflow switcher dropdown in header.
  - Simulation controller with step-by-step or instant run animation.
