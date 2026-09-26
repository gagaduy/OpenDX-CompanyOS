<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Design Spec: Visual Business Workflow Studio - Node Palette, Interactive Wiring, Safe Publish Lifecycle & Versioning

## 1. Problem Statement
While the Visual Business Workflow Studio currently renders 3 pre-built business workflows with conditional branching, it lacks the true capabilities of an enterprise No-Code / Agentic iPaaS:
1. **No Node Library Palette**: Users cannot drag and drop new business nodes (Triggers, AI Agents, Decision Routers, Human Approval Gates, Actions) onto the canvas.
2. **Fixed Static Wiring**: Users cannot draw new connection wires between nodes or reconnect branches.
3. **No Draft vs Publish Lifecycle**: Edits risk being conflated with live production runtime. An enterprise needs a strict distinction between **Draft (Bản nháp)**, **Dry-Run Simulation (Chạy thử nghiệm)**, and **Publish & Activate (Xuất bản chính thức)** with versioning (v1.0, v1.1).
4. **No Direct Parameter Configuration**: Users cannot adjust policy thresholds (e.g. change auto-approval limit from 200.000 đ to 500.000 đ) directly inside the Inspector Drawer and save it to the workflow definition.

## 2. Core Architectural Pillars (The 3 Pillars)
1. **Automation (Pillar A)**: Clear ROI metrics (automation rate, execution speed, hours saved) and interactive dry-run simulation animating data packet flow.
2. **Governance & Safety (Pillar B)**: Human-in-the-loop gates, immutable audit trails, and strict policy threshold enforcement.
3. **Visual No-Code Flexibility (Pillar C)**: Drag-and-drop palette, freeform wiring, and in-drawer parameter configuration without writing code or JSON.

## 3. Detailed Component & UX Specifications

### 3.1. Node Library Palette (`WorkflowPalette`)
A left-side collapsible drawer positioned over the ReactFlow canvas, containing 5 business archetypes:
- **🟢 Kích Hoạt (Triggers)**:
  - `trigger_complaint`: Email / Tin nhắn khiếu nại của khách
  - `trigger_inventory`: Cảnh báo tồn kho dưới ngưỡng
  - `trigger_new_product`: Sản phẩm mới xuất bản trên Storefront
  - `trigger_abandoned_cart`: Giỏ hàng bị bỏ quên > 2 giờ
- **🟣 Nhân Viên AI (AI Agents)**:
  - `ai_support_steward`: Chuyên viên CSKH AI (Phân tích bức xúc, soạn thư xin lỗi)
  - `ai_campaign_specialist`: Chuyên viên Marketing AI (Soạn copy, tạo banner)
  - `ai_merchandising`: Chuyên viên Kho vận AI (Dự báo bán hàng, tính lượng đặt EOQ)
- **🔵 Phân Luồng & Hạn Mức (Decision Routers)**:
  - `router_threshold`: Phân luồng theo Hạn mức tiền (Dưới trần ➔ Tự động; Vượt trần ➔ Sếp duyệt)
  - `router_vip`: Phân luồng theo Hạng khách hàng VIP (VIP Diamond ➔ Sếp duyệt; Thường ➔ Tự động)
- **🟡 Cổng Kiểm Soát Sếp Duyệt (Human Approval Gates)**:
  - `gate_support_lead`: Trưởng phòng CSKH duyệt bồi thường
  - `gate_finance_director`: Giám đốc Tài chính / CEO ký lệnh chi
  - `gate_cmo_budget`: Giám đốc Marketing duyệt ngân sách quảng cáo
- **🩵 Hành Động Thực Thi (Actions)**:
  - `action_send_email`: Gửi email SMTP tự động kèm voucher
  - `action_publish_social`: Xuất bản bài đăng lên Facebook Page & Instagram
  - `action_issue_po`: Xuất đơn đặt hàng PO gửi nhà cung cấp
  - `action_create_coupon`: Tạo mã giảm giá trên hệ thống bán hàng

Users can either:
- **Drag-and-drop** any palette card onto the canvas (computing drop coordinate via `screenToFlowPosition`).
- Click **"Thêm vào bàn vẽ"** (+) to place the node at the next logical position.

### 3.2. Interactive Free Wiring (`onConnect` & Dynamic Edges)
- Enable ReactFlow `onConnect` handler.
- When an edge is created between a source and target handle:
  - Automatically style the edge stroke and arrow based on the source node type:
    - Trigger ➔ Purple (`#8b5cf6`)
    - AI Agent ➔ Indigo (`#6366f1`)
    - Decision Router (Auto Handle) ➔ Emerald Green (`#10b981`, solid)
    - Decision Router (Approval Handle) ➔ Amber (`#f59e0b`, dashed)
    - Approval Gate ➔ Cyan (`#38bdf8`)
- Edge deletion: Selecting an edge and pressing Backspace or clicking the delete icon removes the edge cleanly.

### 3.3. Node Parameter Editing in Inspector Drawer
- When any node is selected, `WorkflowInspectorDrawer` displays an **"Cấu hình tham số & Luật"** section:
  - Edit Title and Business Summary.
  - For Decision Routers: Edit threshold amount (e.g. input `200.000 đ` or `500.000 đ`) and rule conditions.
  - For AI Agents: Select model capability level and prompt tone (Thân thiện, Trang trọng, Khẩn trương).
  - Button **"Lưu vào bản nháp"** updates the active workflow state and marks the workflow as modified (Draft).

### 3.4. Safe Publish Lifecycle & Versioning
- **Draft Badge & Indicator**:
  - `isDraft: boolean` state.
  - When modified: Header shows badge `🟡 Bản nháp (v1.1 - Chưa xuất bản)`.
  - When published: Header shows badge `🟢 Đang hoạt động (v1.1 - Đã xuất bản)`.
- **Validation Engine (`validateWorkflowGraph`)**:
  - Checks before publish:
    1. At least 1 Trigger node exists.
    2. At least 1 Action or Approval node exists.
    3. No orphan nodes (all nodes must have at least one incoming or outgoing edge, except Step 1 which has outgoing only).
- **Publish & Activation Action**:
  - On clicking **"Xuất Bản & Kích Hoạt"**:
    - Runs validation. If validation fails, shows friendly business guidance ("Node X chưa được nối dây").
    - If valid, increments version (v1.0 ➔ v1.1), clears draft flag, records publication timestamp, and shows success toast.
- **Discard / Reset Action**:
  - Reverts canvas to the last published version.

### 3.5. Anti-AI-Slop Visual Standards
- High-end dark SaaS aesthetic (`#08090f` background with `#111322` radial gradient and glassmorphism headers).
- Crisp SVG iconography from `lucide-react`.
- Smooth collapsible drawer transitions.
- Zero horizontal text clipping or awkward line breaking.
