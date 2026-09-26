<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Implementation Plan: Visual Business Workflow Studio - Node Palette, Interactive Wiring, Safe Publish Lifecycle & Versioning

## Proposed Changes

### 1. Palette Data & Catalog (`apps/console/src/features/workflows/palette-catalog.ts`)
- Define `PALETTE_NODE_TEMPLATES`: A rich collection of pre-configured business node templates categorized into 5 groups:
  - `triggers`: Inbound complaint, low inventory, new product catalog, abandoned cart.
  - `ai_agents`: Support Steward (CSKH), Campaign Specialist (MKT), Merchandising Specialist (Kho).
  - `decision_routers`: Amount threshold router, VIP customer tier router.
  - `approval_gates`: Support Manager approval, Financial Director/CEO sign-off, CMO budget sign-off.
  - `actions`: Send email with coupon, publish Facebook post, dispatch purchase order, activate voucher.
- Helper factory `createNodeFromPaletteTemplate(template, position, stepNumber)` to instantiate valid `BusinessWorkflowNode`s.

### 2. Node Palette Component (`apps/console/src/features/workflows/components/workflow-palette.tsx`)
- Implement a sleek collapsible sidebar on the left of the canvas.
- Category accordion / tabs with badge counts and icons.
- Draggable cards using HTML5 `onDragStart={(e) => e.dataTransfer.setData('application/reactflow', template.id)}`.
- Quick-add button `(+)` for touch or direct mouse click.
- Expand / collapse toggle button with clean slide animation.

### 3. Canvas Drag-and-Drop & Freeform Wiring (`workflow-canvas.tsx`)
- Implement `onDragOver` and `onDrop` in `WorkflowCanvas` using ReactFlow's `screenToFlowPosition` to calculate drop coordinates.
- Implement `onConnect` handler with edge styling based on source node type.
- Support edge deletion (select edge and press Backspace or click Delete).
- Support dynamic multi-handle connections from `decision_router` nodes (`auto` and `approval` handles).

### 4. Node Parameter Configuration in Inspector Drawer (`workflow-inspector-drawer.tsx`)
- Add an editable form in `WorkflowInspectorDrawer`:
  - Title & Summary inputs.
  - Threshold value input (for Decision Routers).
  - Model Tone & Priority dropdowns.
  - "Lưu Thay Đổi Vào Bản Nháp" (Save to Draft) button invoking `onUpdateNode(updatedNode)`.

### 5. Safe Publish Lifecycle & Validation (`workflow-studio-page.tsx`, `types.ts`)
- Add `version: string` (e.g. "v1.0") and `status: "draft" | "published"` to `BusinessWorkflowDefinition`.
- Implement `validateWorkflowGraph(nodes, edges)` returning validation errors or warnings (e.g., disconnected nodes).
- In `WorkflowStudioPage`:
  - Track `isDraft` state whenever nodes, edges, or parameters change.
  - Status chip: `🟡 Bản nháp (v1.1 - Chưa xuất bản)` vs `🟢 Đang hoạt động (v1.0 - Đã xuất bản)`.
  - Button `[Xuất Bản & Kích Hoạt]`:
    - Runs validation.
    - If valid, increments version, updates status to published, records publication event, and shows confirmation banner.
  - Button `[Đặt Lại]` restores last published state.
  - Button `[Chạy Thử Nghiệm]` triggers simulation flow.

### 6. Styling & SaaS Aesthetics (`workflows.css`)
- Palette sidebar styles (`.workflowPaletteContainer`, `.paletteCategory`, `.paletteItemCard`).
- Clean drag previews and hover states.
- Polished draft badge and publish button styling.
- Responsive layout avoiding any clipping with the top header or right drawer.

### 7. Unit Tests & Verification (`workflow-studio.test.tsx`)
- Test palette rendering and template categories.
- Test adding a node from palette onto the canvas.
- Test updating node parameters in the drawer and transitioning to draft state.
- Test publishing workflow: validation, version increment, and published badge transition.
- Verify production build with `pnpm --filter @opendx/console build`.
