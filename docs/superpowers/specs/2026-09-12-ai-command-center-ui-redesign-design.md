<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# AI Command Center UI Redesign & Modular Decomposition Design Spec

- **Date**: 2026-09-12
- **Author**: Antigravity & Phuong
- **Status**: Approved for Implementation Planning
- **Branch**: `phuong`
- **Related Specs & Docs**:
  - `docs/design/linear-product-canvas.md`
  - `.agents/skills/agentic-workforce-development/SKILL.md`
  - `.agents/skills/opendx-companyos-development/SKILL.md`
  - `docs/superpowers/specs/2026-08-25-console-digital-workforce-design.md`
  - Reference: `/home/nguyenphuong/Pictures/FE_OLP/ui_redesign_spec.md`
  - Mockup: `/home/nguyenphuong/Pictures/FE_OLP/ChatGPT Image 14_16_25 12 thg 9, 2026.png`

---

## 1. Executive Summary & Business Goals

The AI Command Center (`Tasks` tab) in OpenDX CompanyOS Console represents the operational bridge between strategic management (CEO / Administrator) and the autonomous Digital Workforce (Nhân sự số). 

### 1.1 Problems Addressed
1. **Visual Hierarchy & Information Clutter**: The previous layout presented multiple equal-weight vertical cards and wide scroll sections, creating cognitive overload and obscuring urgent actionable items (such as pending human approvals or department exceptions).
2. **Monolithic Architecture**: The previous implementation in `agentic-command-center.tsx` grew into a 4,821-line (203 KB) monolith containing mixed business logic, state handling, and dense UI presentation, violating Clean Architecture and impeding testability.
3. **Control Room Experience**: The new design refactors the screen into a high-density, mission-critical **Enterprise AI Command Center & Control Room**, matching the reference mockup while preserving the project's strict Linear Dark Canvas guidelines.

### 1.2 Core Business Requirements
- Provide a clear **3-Tier Full-View Console** with seamless natural page scrolling and sticky/internal scrolling for active event streams.
- Anchor all workforce views to the system's **4 active operational departments**:
  1. Tiếp thị & Sáng tạo (*Marketing & Creative*)
  2. Danh mục & Định giá (*Catalog & Pricing*)
  3. Vận hành & Kho vận (*Operations & Inventory*)
  4. CSKH & Trải nghiệm (*Support & CRM*)
- Strengthen **Governed Human-in-the-Loop** workflows: Prominently feature pending business proposals with 3 standard actions (`Preview`, `Request Changes`, `Approve`).
- Surface real-time execution health, live activity events, active task queues, and tangible end deliverables.

---

## 2. Visual Style, Theme & Design Tokens

The interface adheres strictly to the **Linear Product Canvas** standards in `docs/design/linear-product-canvas.md`:

| Token Category | Value | Usage |
| :--- | :--- | :--- |
| **Canvas Background** | `#010102` | Deepest black foundation of the entire console viewport |
| **Panel Surface 1** | `#0a0b10` | Base background for primary containers and command blocks |
| **Panel Surface 2** | `#11131a` | Elevated surface for department cards, modal panels, and KPI cards |
| **Hairline Borders** | `rgba(255, 255, 255, 0.08)` | 1px clean crisp separators, cards, and input boundaries |
| **Border Active** | `rgba(255, 255, 255, 0.16)` | Focused inputs and active card boundaries |
| **Accent / Focus** | `#5e6ad2` / `#3b82f6` | Scarce lavender/cobalt for primary CTAs, active filters, and keyboard focus |
| **Semantic Success** | `#10b981` | Active working status, live pulse dot, completed tasks |
| **Semantic Warning** | `#f59e0b` | Pending approvals, token expiration alerts, queued steps |
| **Semantic Danger** | `#ef4444` | Department exceptions, error alerts, retry requirements |
| **Text Primary** | `#f8fafc` | Headings, metric numbers, active labels |
| **Text Secondary** | `#94a3b8` | Subtitles, descriptions, agent roles, timestamps |
| **Text Muted** | `#64748b` | Placeholders, inactive counts, helper text |

---

## 3. Overall 3-Tier Layout Architecture

The screen layout is divided into 3 vertical tiers with natural vertical scrolling and high information density:

```text
+----------------------------------------------------------------------------------------------------+
| TIER 1: PAGE HEADER & COMMAND COMPOSER                                                            |
| Tasks Header + Status Filter Pills [Tất cả 12][Đang xử lý 5][Chờ duyệt 3][Hoàn thành 28][Lỗi 1]  |
| [Left ~65%: Strategic Command Composer]            | [Right ~35%: AI CEO Live Stepper Card]       |
+----------------------------------------------------------------------------------------------------+
| TIER 2: WORKFORCE ORCHESTRATION & LIVE EVENTS                                                      |
| [Left ~70%: Workforce Grid 2x2]                    | [Right ~30%: Live Activity & Approvals]       |
| • Tiếp thị & Sáng tạo   • Danh mục & Định giá      | • Luồng công việc thời gian thực (Live Stream)|
| • Vận hành & Kho vận    • CSKH & Trải nghiệm       | • Phê duyệt đang chờ (Human Approval Panel)   |
+----------------------------------------------------------------------------------------------------+
| TIER 3: RESULTS & PERFORMANCE DASHBOARD                                                           |
| • Donut Chart (Tỷ lệ)   • Hiệu suất 4 phòng ban    • 4 KPI Cards        • Kết quả gần đây (Outputs)|
+----------------------------------------------------------------------------------------------------+
```

---

## 4. Detailed Component Specifications

### 4.1 Tier 1: Page Header & Command Composer Zone

#### Page Header
- Title: **Tasks** (Font size: 28px, semi-bold, `#f8fafc`).
- Subtitle: **Giao việc. AI vận hành. Kết quả thực.** (`#94a3b8`).
- Filter Pills with counts:
  - `Tất cả` (All)
  - `Đang xử lý` (In Progress - active pulse)
  - `Chờ phê duyệt` (Pending Approval - amber badge)
  - `Đã hoàn thành` (Completed - green badge)
  - `Lỗi` (Failed/Error - red badge)
- Top Right Controls: Operating Mode selector (`Chế độ điều hành / CompanyOS AI`) and Primary Action button `+ Tác vụ mới`.

#### Command Composer (`command-composer-panel.tsx`)
- Strategic Input: Auto-expanding textarea (3–4 lines) with intelligent placeholder (`"Ví dụ: Phân tích thị trường mỹ phẩm Đông Nam Á và xây dựng kế hoạch ra mắt sản phẩm mới..."`).
- Metadata Toolbar Buttons:
  - `📎 Đính kèm` (Attachment - file upload with ClamAV validation)
  - `🌐 Bối cảnh` (Business Context selector)
  - `🎯 Mục tiêu` (Strategic Goal tagger)
  - `⚡ Độ ưu tiên` (Priority toggle: Low / Normal / High / Urgent)
- Destination Selector: Dropdown (default: `NovaAI CEO - Điều phối chiến lược`).
- Primary CTA: `Giao việc` button (`#5e6ad2`, icon send, keyboard shortcut: `Ctrl + Enter`).
- Quick Action Chips: Fast strategic dispatch templates (e.g. `"Phân tích thị trường"`, `"Ra mắt sản phẩm"`, `"Tối ưu tồn kho"`, `"Rà soát CSKH"`).

#### AI CEO Live Stepper Card
- Avatar & Identity: NovaAI CEO with live status glow.
- Live Status: `Đang phân tích...` (Analyzing) or `Sẵn sàng nhận lệnh` (Ready).
- Elapsed Timer: Real-time running clock (`00:00:28`).
- 4-Stage Orchestration Checklist:
  1. `✓` Phân tích yêu cầu chiến lược (Requirements Analysis)
  2. `✓` Xác định phạm vi & mục tiêu kinh doanh (Scope & Objectives)
  3. `⟳` Lựa chọn phòng ban phù hợp (Department Selection - active spinner)
  4. `○` Tạo tác vụ và phân công nhân sự AI (Task Creation & AI Assignment)
- Strategic Quote Panel: *"Từ chiến lược đến kết quả thực tế. AI × Con người × Quy trình = Tăng trưởng thật."*

---

### 4.2 Tier 2: Workforce Grid 2x2 & Right Control Column

#### Workforce Grid 2x2 (`workforce-grid.tsx` & `department-card.tsx`)
Header displays: **"Phân công & Điều phối nhân sự AI theo phòng ban"** with subtext and action link `[Xem sơ đồ quy trình →]` to view the full DAG graph.

Arranged in a responsive 2x2 grid representing the 4 core departments:

1. **Tiếp thị & Sáng tạo** (`theme-blue`):
   - Meta: 3 Nhân sự AI | 2 Tác vụ
   - Badge: `Đang xử lý` + `Social Token Status` (healthy / warning / invalid).
   - Digital Employees:
     - `MKT-01` Cây bút Tiếp thị (`Đang làm việc` - Progress: 75%)
     - `MKT-02` Thiết kế Đồ họa (`Đang làm việc` - Progress: 40%)
     - `MKT-03` Điều phối Xuất bản (`Chờ nhiệm vụ` - `--`)
   - Queue (2): "Phân tích đối thủ", "Lên ý tưởng chiến dịch".
   - Footer Actions: `[Giao việc]` and `[Xem chiến dịch]`.

2. **Danh mục & Định giá** (`theme-cyan`):
   - Meta: 2 Nhân sự AI | 1 Tác vụ
   - Badge: `Đang xử lý`.
   - Digital Employees:
     - `CAT-01` Cây bút Sản phẩm (`Đang làm việc` - Progress: 60%)
     - `CAT-02` Chuyên viên Định giá (`Chờ nhiệm vụ` - `--`)
   - Queue (1): "Tạo kế hoạch Flash Sale Cuối tuần".
   - Footer Actions: `[Giao việc]` and `[Xem đề xuất giá]`.

3. **Vận hành & Kho vận** (`theme-amber`):
   - Meta: 2 Nhân sự AI | 1 Tác vụ
   - Badge: `Có lỗi` (red) or `Cần bổ sung kho` (amber).
   - Digital Employees:
     - `OPS-01` Kỹ sư Tồn kho (`Lỗi xử lý` - Progress: 0%)
     - `OPS-02` Điều phối Đơn hàng (`Đang làm việc` - Progress: 30%)
   - Exception Alert Box: Clear red banner `"Lỗi: Không tìm thấy dữ liệu tồn kho an toàn SKU-TECH-01"` with `[Xem chi tiết →]` button opening diagnostics modal.
   - Queue (1): "Lập dự thảo PO nhập hàng bổ sung".
   - Footer Actions: `[Giao việc]` and `[Mở đề xuất kho]`.

4. **CSKH & Trải nghiệm** (`theme-emerald`):
   - Meta: 2 Nhân sự AI | 1 Tác vụ
   - Badge: `Đang xử lý`.
   - Digital Employees:
     - `SUP-01` Quản gia CSKH (`Đang làm việc` - Progress: 90%)
     - `SUP-02` Chuyên viên CRM (`Chờ nhiệm vụ` - `--`)
   - Queue (1): "Gửi email voucher giữ chân giỏ hàng bỏ quên".
   - Footer Actions: `[Giao việc]` and `[Mở hộp thư CRM]`.

#### Live Activity Feed (`live-activity-feed.tsx`)
- Header: **Luồng công việc thời gian thực** with `● Live` badge and department filter dropdown (`Tất cả phòng ban`).
- Vertical timeline with timestamps (`14:26`, `14:27`, etc.), semantic status icons, title, description, and context CTA buttons (`[Cần xử lý]` for error events).

#### Pending Approvals Panel (`pending-approvals-panel.tsx`)
- Header: **Phê duyệt (3)** with link `[Xem tất cả →]`.
- Proposal Card Items:
  - Document/Proposal type icon (Catalog diff, Marketing Facebook post, Inventory PO, CRM email).
  - Title and origin metadata (e.g. `Từ: Tiếp thị & Sáng tạo (MKT-01)`).
  - Risk / impact level badge.
  - **3 Human-in-the-Loop Action Buttons**:
    1. `[Xem trước]` (Preview): Triggers corresponding modal preview.
    2. `[Yêu cầu chỉnh sửa]` (Request Revision): Prompts revision feedback loop to agent.
    3. `[Phê duyệt]` (Approve): Prominent button executing live mutation directly.

---

### 4.3 Tier 3: Results & Performance Dashboard (`results-metrics-panel.tsx`)

Header: **KẾT QUẢ HOÀN THÀNH**

Comprises 4 balanced horizontal blocks:
1. **Donut Chart (Tỷ lệ hoàn thành)**:
   - Clean SVG donut showing total completed tasks (e.g. `28 tác vụ hoàn thành`).
   - Legend breakdown:
     - Đúng hạn (On-time): 82% (`#10b981`)
     - Trễ hạn (Delayed): 11% (`#f59e0b`)
     - Đã hủy (Cancelled): 7% (`#ef4444`)
2. **Hiệu suất theo phòng ban (Department Efficiency)**:
   - Horizontal progress bars for the 4 departments (Tiếp thị: 92%, Định giá: 78%, Kho vận: 65%, CSKH: 88%).
3. **Chỉ số quan trọng (4 KPI Mini-Cards)**:
   - ⚡ `12`: Tác vụ đang xử lý
   - ✓ `28`: Hoàn thành tuần này (`+27%`)
   - ⏱️ `3.2h`: Thời gian xử lý TB (`-41%`)
   - 📊 `96%`: Tỷ lệ phê duyệt (`+12%`)
4. **Kết quả gần đây (Recent Outputs List)**:
   - List of tangible completed deliverables with timestamps and status badges.
   - Click to inspect or download generated artifacts (DOCX, PDF, XLSX, PNG).

---

## 5. Component Modularization & File Structure

The 4,821-line monolith is refactored into the following clean architecture tree:

```text
apps/console/src/features/agentic/components/
├── command-center/
│   ├── types.ts                     # Shared interfaces & data contracts
│   ├── command-center-header.tsx    # Header, filter pills, quick actions
│   ├── command-composer-panel.tsx   # Strategic composer & AI CEO live stepper
│   ├── workforce-grid.tsx           # 2x2 grid container & cross-connector wire
│   ├── department-card.tsx          # Single department card (agents, queues, alerts)
│   ├── live-activity-feed.tsx       # Real-time event stream & department filter
│   ├── pending-approvals-panel.tsx  # Interactive human approval cards
│   └── results-metrics-panel.tsx    # Donut chart, efficiency bars, KPI cards, deliverables
└── agentic-command-center.tsx       # Orchestrator: state management, API hooks, modal wiring
```

### 5.1 Modal Wiring Integration
`agentic-command-center.tsx` coordinates user actions and connects to existing production modals:
- `OperationsProposalModal`: Interactive restock editing and PO approval.
- `CampaignProposalModal`: Dynamic merchandising price markdown plan approval.
- `CampaignPreviewModal`: Marketing poster preview and 5 deliverable artifact downloads.
- `SocialTokenManagerModal`: 1-click token renewal and health alert management.
- `ApprovalDecisionDialog`: Generic fallback for task approval decisions.

---

## 6. Responsive Layout Strategy

- **Desktop (>= 1280px)**:
  - Full 3-tier layout.
  - Workforce Zone: 2 columns (70% 2x2 grid, 30% Live Feed & Approvals).
  - Results Zone: 4 columns horizontal grid.
- **Tablet (768px – 1279px)**:
  - Workforce Grid stacks to 2 columns or 1 column.
  - Live Feed and Approvals flow below the workforce grid.
  - Results Zone stacks into a 2x2 grid.
- **Mobile (< 768px)**:
  - Single column stack for all tiers.
  - Horizontal scrolling for KPI cards and filter pills.
  - Zero horizontal viewport overflow.

---

## 7. Verification & Testing Plan

1. **Unit & Component Testing**:
   - Create isolated Vitest tests for each subcomponent in `command-center/*.test.tsx`.
   - Verify filter pill toggles, command submission, approval button callbacks, and error display.
2. **Integration & Modal Wiring**:
   - Verify that clicking `Preview` or `Approve` in `pending-approvals-panel` triggers the appropriate business modal.
   - Verify that submitting a strategic command in `command-composer-panel` initiates the AI CEO stepper.
3. **Static & Source Gates**:
   - Strict TypeScript check: `pnpm --filter @opendx/console typecheck`.
   - Lint check: `pnpm --filter @opendx/console lint`.
   - Fast gate: `pnpm check`.
   - Repository audit: `pnpm audit:repo`.
