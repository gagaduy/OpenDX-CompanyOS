<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# AI Command Center UI Redesign & Modular Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the AI Command Center in OpenDX CompanyOS Console into a 3-tier enterprise operations control room matching the approved design spec, modularizing the 4,821-line monolith into testable, clean architecture subcomponents without hardcoding data.

**Architecture:** Decompose `agentic-command-center.tsx` into focused subcomponents under `apps/console/src/features/agentic/components/command-center/` adhering to the Linear Dark Canvas (`#010102`). The root `AgenticCommandCenter` acts as an orchestrator managing live state, API hooks, and existing business modals (Marketing, Catalog, Inventory, Support) while child components render typed props for the Header, Composer, 2x2 Workforce Grid, Live Stream, Approvals, and Results Dashboard.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-12-ai-command-center-ui-redesign-design.md`

## Global Constraints

- **No Hardcoding**: All workforce statuses, tasks, overview metrics, approvals, queues, and digital employee states must bind to live props and dynamic domain types from `agentic.types.ts` and `department-task-queue.types.ts`.
- **Theme & Colors**: Strict Linear Dark Canvas (`#010102` canvas, `#0a0b10` / `#11131a` panel surfaces, hairline borders `rgba(255,255,255,0.08)`, `#5e6ad2` scarce primary accent).
- **Core Departments**: Strictly map to the 4 operational departments in the system (`marketing`, `merchandising`, `operations`, `support`).
- **Clean Architecture**: Child components must not make direct unpassed API network requests; all mutations and modal open actions flow through typed callback props.
- **Verification Gates**: Every task must maintain passing unit tests via Vitest; final gate requires passing `pnpm --filter @opendx/console test`, `pnpm --filter @opendx/console typecheck`, and `pnpm audit:repo`.

---

### Task 1: Subcomponent Interfaces & Contracts (`types.ts`)

**Files:**
- Create: `apps/console/src/features/agentic/components/command-center/types.ts`
- Test: `apps/console/src/features/agentic/components/command-center/types.test.ts`

**Interfaces:**
- Consumes: `AgenticTaskOverview`, `AgenticTaskSummary`, `AgenticTaskState`, `AgenticApproval` from `../types/agentic.types.ts` and `DepartmentType`, `DepartmentTask`, `DigitalEmployeeInfo` from `../types/department-task-queue.types.ts`.
- Produces: `CommandCenterHeaderProps`, `CommandComposerProps`, `AiCeoStepperProps`, `DepartmentCardProps`, `WorkforceGridProps`, `LiveActivityFeedProps`, `PendingApprovalsProps`, `ResultsMetricsProps`.

- [ ] **Step 1: Write the failing type contract test**

```typescript
// apps/console/src/features/agentic/components/command-center/types.test.ts
import { describe, it, expect } from "vitest";
import type {
  CommandCenterHeaderProps,
  CommandComposerProps,
  DepartmentCardProps,
  LiveActivityFeedProps,
  PendingApprovalsProps,
  ResultsMetricsProps,
} from "./types";

describe("command-center types", () => {
  it("exports valid type definitions for all command center subcomponents", () => {
    const dummyHeader: Partial<CommandCenterHeaderProps> = { activeFilter: "all" };
    const dummyComposer: Partial<CommandComposerProps> = { isAnalyzing: false };
    const dummyDept: Partial<DepartmentCardProps> = { department: "marketing" };
    const dummyLive: Partial<LiveActivityFeedProps> = { events: [] };
    const dummyApprovals: Partial<PendingApprovalsProps> = { approvals: [] };
    const dummyResults: Partial<ResultsMetricsProps> = { totalCompleted: 28 };

    expect(dummyHeader).toBeDefined();
    expect(dummyComposer).toBeDefined();
    expect(dummyDept).toBeDefined();
    expect(dummyLive).toBeDefined();
    expect(dummyApprovals).toBeDefined();
    expect(dummyResults).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/types.test.ts`
Expected: FAIL with "Cannot find module './types'"

- [ ] **Step 3: Implement `types.ts`**

```typescript
// apps/console/src/features/agentic/components/command-center/types.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  AgenticTaskOverview,
  AgenticTaskSummary,
  AgenticApproval,
} from "../../types/agentic.types";
import type {
  DepartmentType,
  DepartmentTask,
} from "../../types/department-task-queue.types";

export type TaskFilterType = "all" | "running" | "waiting_approval" | "completed" | "failed";

export interface CommandCenterHeaderProps {
  readonly activeFilter: TaskFilterType;
  readonly counts: {
    readonly all: number;
    readonly running: number;
    readonly waiting_approval: number;
    readonly completed: number;
    readonly failed: number;
  };
  readonly onFilterChange: (filter: TaskFilterType) => void;
  readonly onNewTaskClick: () => void;
}

export interface QuickActionTemplate {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly target: string;
  readonly priority?: "low" | "normal" | "high" | "urgent";
}

export interface CommandComposerProps {
  readonly prompt: string;
  readonly onPromptChange: (val: string) => void;
  readonly onSubmit: () => void;
  readonly isSubmitting: boolean;
  readonly isAnalyzing: boolean;
  readonly analysisStep: number; // 1 to 4
  readonly analysisDurationSeconds: number;
  readonly priority: "low" | "normal" | "high" | "urgent";
  readonly onPriorityChange: (p: "low" | "normal" | "high" | "urgent") => void;
  readonly targetDepartment: string;
  readonly onTargetDepartmentChange: (target: string) => void;
  readonly onSelectTemplate: (template: QuickActionTemplate) => void;
}

export interface DigitalEmployeeProgress {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly status: "working" | "waiting" | "failed" | "idle";
  readonly progressPercent: number;
}

export interface DepartmentCardProps {
  readonly department: DepartmentType;
  readonly displayName: string;
  readonly employeeCount: number;
  readonly activeTaskCount: number;
  readonly status: "running" | "waiting_approval" | "error" | "idle";
  readonly employees: readonly DigitalEmployeeProgress[];
  readonly queue: readonly DepartmentTask[];
  readonly errorMessage?: string;
  readonly tokenAlert?: {
    readonly status: "healthy" | "warning" | "invalid";
    readonly label: string;
  };
  readonly onDirectDispatch: (dept: DepartmentType) => void;
  readonly onOpenDetails: (dept: DepartmentType) => void;
  readonly onErrorResolve?: (dept: DepartmentType) => void;
}

export interface WorkforceGridProps {
  readonly departments: readonly DepartmentCardProps[];
  readonly onViewDagGraph: () => void;
}

export interface LiveEventItem {
  readonly id: string;
  readonly timestamp: string;
  readonly department: DepartmentType | "ai_ceo";
  readonly title: string;
  readonly description: string;
  readonly status: "success" | "warning" | "error" | "info";
  readonly actionLabel?: string;
  readonly onActionClick?: () => void;
}

export interface LiveActivityFeedProps {
  readonly events: readonly LiveEventItem[];
  readonly activeDepartmentFilter: string;
  readonly onFilterChange: (dept: string) => void;
}

export interface PendingApprovalItem {
  readonly id: string;
  readonly title: string;
  readonly sourceDepartment: DepartmentType;
  readonly authorName: string;
  readonly riskLevel: "low" | "medium" | "high";
  readonly timestamp: string;
  readonly onPreview: () => void;
  readonly onRequestRevision: () => void;
  readonly onApprove: () => void;
}

export interface PendingApprovalsProps {
  readonly approvals: readonly PendingApprovalItem[];
  readonly onViewAll: () => void;
}

export interface DepartmentEfficiencyMetric {
  readonly department: DepartmentType;
  readonly displayName: string;
  readonly efficiencyPercent: number;
}

export interface RecentDeliverableItem {
  readonly id: string;
  readonly title: string;
  readonly departmentName: string;
  readonly completedAt: string;
  readonly format: string;
  readonly onDownloadOrView: () => void;
}

export interface ResultsMetricsProps {
  readonly totalCompleted: number;
  readonly onTimePercent: number;
  readonly delayedPercent: number;
  readonly cancelledPercent: number;
  readonly departmentEfficiencies: readonly DepartmentEfficiencyMetric[];
  readonly activeTasksCount: number;
  readonly completedThisWeekCount: number;
  readonly completedTrendPercent: number;
  readonly avgDurationHours: number;
  readonly durationTrendPercent: number;
  readonly approvalRatePercent: number;
  readonly approvalRateTrendPercent: number;
  readonly recentDeliverables: readonly RecentDeliverableItem[];
  readonly onViewAllDeliverables: () => void;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/agentic/components/command-center/types.ts apps/console/src/features/agentic/components/command-center/types.test.ts
git commit -m "feat(console): add typed props contracts for command center subcomponents"
```

---

### Task 2: Page Header & Status Filter Pills (`command-center-header.tsx`)

**Files:**
- Create: `apps/console/src/features/agentic/components/command-center/command-center-header.tsx`
- Test: `apps/console/src/features/agentic/components/command-center/command-center-header.test.tsx`

**Interfaces:**
- Consumes: `CommandCenterHeaderProps` from `./types.ts`
- Produces: React component `CommandCenterHeader`

- [ ] **Step 1: Write the failing unit test**

```typescript
// apps/console/src/features/agentic/components/command-center/command-center-header.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandCenterHeader } from "./command-center-header";

describe("CommandCenterHeader", () => {
  const defaultProps = {
    activeFilter: "all" as const,
    counts: { all: 12, running: 5, waiting_approval: 3, completed: 28, failed: 1 },
    onFilterChange: vi.fn(),
    onNewTaskClick: vi.fn(),
  };

  it("renders page title, subtitle, and filter badges with live counts", () => {
    render(<CommandCenterHeader {...defaultProps} />);
    expect(screen.getByText("Tasks")).toBeDefined();
    expect(screen.getByText("Giao việc. AI vận hành. Kết quả thực.")).toBeDefined();
    expect(screen.getByText("Tất cả")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
    expect(screen.getByText("Đang xử lý")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
  });

  it("calls onFilterChange when a pill is clicked", () => {
    render(<CommandCenterHeader {...defaultProps} />);
    fireEvent.click(screen.getByText("Chờ phê duyệt"));
    expect(defaultProps.onFilterChange).toHaveBeenCalledWith("waiting_approval");
  });

  it("calls onNewTaskClick when + Tác vụ mới is clicked", () => {
    render(<CommandCenterHeader {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Tác vụ mới"));
    expect(defaultProps.onNewTaskClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/command-center-header.test.tsx`
Expected: FAIL with "Cannot find module './command-center-header'"

- [ ] **Step 3: Implement `command-center-header.tsx`**

Implement `CommandCenterHeader` with:
- Title and subtitle
- Filter pills: `Tất cả (${counts.all})`, `Đang xử lý (${counts.running})`, `Chờ phê duyệt (${counts.waiting_approval})`, `Đã hoàn thành (${counts.completed})`, `Lỗi (${counts.failed})`.
- Right side: Mode dropdown (`Chế độ điều hành / CompanyOS AI`) and `+ Tác vụ mới` button.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/command-center-header.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/agentic/components/command-center/command-center-header.tsx apps/console/src/features/agentic/components/command-center/command-center-header.test.tsx
git commit -m "feat(console): implement CommandCenterHeader with dynamic status filter pills"
```

---

### Task 3: Strategic Command Composer & AI CEO Live Stepper (`command-composer-panel.tsx`)

**Files:**
- Create: `apps/console/src/features/agentic/components/command-center/command-composer-panel.tsx`
- Test: `apps/console/src/features/agentic/components/command-center/command-composer-panel.test.tsx`

**Interfaces:**
- Consumes: `CommandComposerProps` from `./types.ts`
- Produces: React component `CommandComposerPanel`

- [ ] **Step 1: Write failing unit test**

```typescript
// apps/console/src/features/agentic/components/command-center/command-composer-panel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandComposerPanel } from "./command-composer-panel";

describe("CommandComposerPanel", () => {
  const defaultProps = {
    prompt: "",
    onPromptChange: vi.fn(),
    onSubmit: vi.fn(),
    isSubmitting: false,
    isAnalyzing: true,
    analysisStep: 3,
    analysisDurationSeconds: 28,
    priority: "normal" as const,
    onPriorityChange: vi.fn(),
    targetDepartment: "ai_ceo",
    onTargetDepartmentChange: vi.fn(),
    onSelectTemplate: vi.fn(),
  };

  it("renders composer textarea, submit button, and quick action chips", () => {
    render(<CommandComposerPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText(/Ví dụ: Phân tích thị trường mỹ phẩm/)).toBeDefined();
    expect(screen.getByText("Giao việc")).toBeDefined();
    expect(screen.getByText("Phân tích thị trường")).toBeDefined();
  });

  it("renders AI CEO Stepper card with current step and elapsed timer", () => {
    render(<CommandComposerPanel {...defaultProps} />);
    expect(screen.getByText("AI CEO")).toBeDefined();
    expect(screen.getByText("Đang phân tích...")).toBeDefined();
    expect(screen.getByText("00:00:28")).toBeDefined();
    expect(screen.getByText("Lựa chọn phòng ban phù hợp")).toBeDefined();
  });

  it("triggers onSubmit when Giao việc is clicked", () => {
    render(<CommandComposerPanel {...defaultProps} prompt="Launch new campaign" />);
    fireEvent.click(screen.getByText("Giao việc"));
    expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/command-composer-panel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `command-composer-panel.tsx`**

Implement `CommandComposerPanel` adhering to Tier 1 spec:
- Left 65%: Textarea, toolbar buttons (Đính kèm, Bối cảnh, Mục tiêu, Độ ưu tiên), dropdown selector, button Giao việc (`#5e6ad2`), quick template chips.
- Right 35%: AI CEO card with status pill, formatted elapsed time (`00:mm:ss`), 4-step checklist (Phân tích yêu cầu, Xác định phạm vi & mục tiêu, Lựa chọn phòng ban phù hợp, Tạo tác vụ và phân công nhân sự AI), and visionary quote panel.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/command-composer-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/agentic/components/command-center/command-composer-panel.tsx apps/console/src/features/agentic/components/command-center/command-composer-panel.test.tsx
git commit -m "feat(console): implement CommandComposerPanel with live AI CEO stepper"
```

---

### Task 4: Department Card & 2x2 Workforce Grid (`department-card.tsx`, `workforce-grid.tsx`)

**Files:**
- Create: `apps/console/src/features/agentic/components/command-center/department-card.tsx`
- Create: `apps/console/src/features/agentic/components/command-center/workforce-grid.tsx`
- Test: `apps/console/src/features/agentic/components/command-center/workforce-grid.test.tsx`

**Interfaces:**
- Consumes: `DepartmentCardProps`, `WorkforceGridProps` from `./types.ts`
- Produces: React components `DepartmentCard`, `WorkforceGrid`

- [ ] **Step 1: Write failing unit test**

```typescript
// apps/console/src/features/agentic/components/command-center/workforce-grid.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkforceGrid } from "./workforce-grid";
import type { DepartmentCardProps } from "./types";

describe("WorkforceGrid", () => {
  const departments: DepartmentCardProps[] = [
    {
      department: "marketing",
      displayName: "Tiếp thị & Sáng tạo",
      employeeCount: 3,
      activeTaskCount: 2,
      status: "running",
      employees: [
        { id: "m1", name: "MKT-01", role: "Cây bút Tiếp thị", status: "working", progressPercent: 75 },
      ],
      queue: [{ id: "q1", department: "marketing", prompt: "Phân tích đối thủ", requiredAgents: [], status: "queued", queuedAt: Date.now() }],
      onDirectDispatch: vi.fn(),
      onOpenDetails: vi.fn(),
    },
    {
      department: "operations",
      displayName: "Vận hành & Kho vận",
      employeeCount: 2,
      activeTaskCount: 1,
      status: "error",
      errorMessage: "Lỗi: Không tìm thấy dữ liệu tồn kho an toàn SKU-TECH-01",
      employees: [
        { id: "o1", name: "OPS-01", role: "Kỹ sư Tồn kho", status: "failed", progressPercent: 0 },
      ],
      queue: [],
      onDirectDispatch: vi.fn(),
      onOpenDetails: vi.fn(),
      onErrorResolve: vi.fn(),
    },
  ];

  it("renders 2x2 grid header, department cards, and digital employee rows", () => {
    render(<WorkforceGrid departments={departments} onViewDagGraph={vi.fn()} />);
    expect(screen.getByText("Phân công & Điều phối nhân sự AI theo phòng ban")).toBeDefined();
    expect(screen.getByText("Tiếp thị & Sáng tạo")).toBeDefined();
    expect(screen.getByText("Vận hành & Kho vận")).toBeDefined();
    expect(screen.getByText("MKT-01")).toBeDefined();
    expect(screen.getByText("75%")).toBeDefined();
  });

  it("renders exception alert when department has errorMessage", () => {
    render(<WorkforceGrid departments={departments} onViewDagGraph={vi.fn()} />);
    expect(screen.getByText(/Không tìm thấy dữ liệu tồn kho an toàn/)).toBeDefined();
    expect(screen.getByText("Xem chi tiết →")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/workforce-grid.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `department-card.tsx` and `workforce-grid.tsx`**

Implement:
- `DepartmentCard`: Header with icon and theme colors (Blue for Marketing, Cyan for Merchandising, Amber for Operations, Emerald for Support), digital employee rows with progress bars and status dots, queue items, red exception alert box with action, and footer buttons.
- `WorkforceGrid`: Header with title, subtext, `[Xem sơ đồ quy trình →]` link, and 2x2 grid container mapping over the 4 department cards.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/workforce-grid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/agentic/components/command-center/department-card.tsx apps/console/src/features/agentic/components/command-center/workforce-grid.tsx apps/console/src/features/agentic/components/command-center/workforce-grid.test.tsx
git commit -m "feat(console): implement DepartmentCard and WorkforceGrid 2x2 container"
```

---

### Task 5: Live Activity Feed & Pending Approvals Panel (`live-activity-feed.tsx`, `pending-approvals-panel.tsx`)

**Files:**
- Create: `apps/console/src/features/agentic/components/command-center/live-activity-feed.tsx`
- Create: `apps/console/src/features/agentic/components/command-center/pending-approvals-panel.tsx`
- Test: `apps/console/src/features/agentic/components/command-center/live-activity-feed.test.tsx`
- Test: `apps/console/src/features/agentic/components/command-center/pending-approvals-panel.test.tsx`

**Interfaces:**
- Consumes: `LiveActivityFeedProps`, `PendingApprovalsProps` from `./types.ts`
- Produces: React components `LiveActivityFeed`, `PendingApprovalsPanel`

- [ ] **Step 1: Write failing unit tests**

```typescript
// apps/console/src/features/agentic/components/command-center/pending-approvals-panel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PendingApprovalsPanel } from "./pending-approvals-panel";

describe("PendingApprovalsPanel", () => {
  const onPreview = vi.fn();
  const onRequestRevision = vi.fn();
  const onApprove = vi.fn();

  const approvals = [
    {
      id: "app-1",
      title: "Báo cáo phân tích thị trường SEA",
      sourceDepartment: "marketing" as const,
      authorName: "Marketing (MKT-01)",
      riskLevel: "medium" as const,
      timestamp: "14:26",
      onPreview,
      onRequestRevision,
      onApprove,
    },
  ];

  it("renders pending approval card with 3 Human-in-the-Loop action buttons", () => {
    render(<PendingApprovalsPanel approvals={approvals} onViewAll={vi.fn()} />);
    expect(screen.getByText(/Phê duyệt/)).toBeDefined();
    expect(screen.getByText("Báo cáo phân tích thị trường SEA")).toBeDefined();
    expect(screen.getByText("Xem trước")).toBeDefined();
    expect(screen.getByText("Yêu cầu chỉnh sửa")).toBeDefined();
    expect(screen.getByText("Phê duyệt")).toBeDefined();
  });

  it("triggers onPreview and onApprove callbacks", () => {
    render(<PendingApprovalsPanel approvals={approvals} onViewAll={vi.fn()} />);
    fireEvent.click(screen.getByText("Xem trước"));
    expect(onPreview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Phê duyệt"));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/pending-approvals-panel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `live-activity-feed.tsx` and `pending-approvals-panel.tsx`**

Implement:
- `LiveActivityFeed`: Header with `● Live` badge, department filter dropdown, vertical event list with timestamps, status icons, and optional context action buttons.
- `PendingApprovalsPanel`: Header with count badge and `[Xem tất cả →]`, proposal items with source badge, timestamp, and 3 buttons (`[Xem trước]`, `[Yêu cầu chỉnh sửa]`, `[Phê duyệt]`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/pending-approvals-panel.test.tsx src/features/agentic/components/command-center/live-activity-feed.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/agentic/components/command-center/live-activity-feed.tsx apps/console/src/features/agentic/components/command-center/pending-approvals-panel.tsx apps/console/src/features/agentic/components/command-center/live-activity-feed.test.tsx apps/console/src/features/agentic/components/command-center/pending-approvals-panel.test.tsx
git commit -m "feat(console): implement LiveActivityFeed and PendingApprovalsPanel"
```

---

### Task 6: Results & Performance Dashboard (`results-metrics-panel.tsx`)

**Files:**
- Create: `apps/console/src/features/agentic/components/command-center/results-metrics-panel.tsx`
- Test: `apps/console/src/features/agentic/components/command-center/results-metrics-panel.test.tsx`

**Interfaces:**
- Consumes: `ResultsMetricsProps` from `./types.ts`
- Produces: React component `ResultsMetricsPanel`

- [ ] **Step 1: Write failing unit test**

```typescript
// apps/console/src/features/agentic/components/command-center/results-metrics-panel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultsMetricsPanel } from "./results-metrics-panel";

describe("ResultsMetricsPanel", () => {
  const defaultProps = {
    totalCompleted: 28,
    onTimePercent: 82,
    delayedPercent: 11,
    cancelledPercent: 7,
    departmentEfficiencies: [
      { department: "marketing" as const, displayName: "Marketing", efficiencyPercent: 92 },
      { department: "merchandising" as const, displayName: "Kinh doanh", efficiencyPercent: 78 },
      { department: "operations" as const, displayName: "Sản phẩm", efficiencyPercent: 65 },
      { department: "support" as const, displayName: "Tài chính", efficiencyPercent: 88 },
    ],
    activeTasksCount: 12,
    completedThisWeekCount: 28,
    completedTrendPercent: 27,
    avgDurationHours: 3.2,
    durationTrendPercent: -41,
    approvalRatePercent: 96,
    approvalRateTrendPercent: 12,
    recentDeliverables: [
      {
        id: "d1",
        title: "Báo cáo xu hướng thị trường mỹ phẩm SEA",
        departmentName: "Marketing",
        completedAt: "14:20",
        format: "docx",
        onDownloadOrView: vi.fn(),
      },
    ],
    onViewAllDeliverables: vi.fn(),
  };

  it("renders Donut chart metrics, department efficiency bars, 4 KPI cards, and recent outputs", () => {
    render(<ResultsMetricsPanel {...defaultProps} />);
    expect(screen.getByText("KẾT QUẢ HOÀN THÀNH")).toBeDefined();
    expect(screen.getByText("28")).toBeDefined();
    expect(screen.getByText(/Đúng hạn/)).toBeDefined();
    expect(screen.getByText("Marketing")).toBeDefined();
    expect(screen.getByText("92%")).toBeDefined();
    expect(screen.getByText("3.2h")).toBeDefined();
    expect(screen.getByText("Báo cáo xu hướng thị trường mỹ phẩm SEA")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/results-metrics-panel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `results-metrics-panel.tsx`**

Implement:
- SVG Donut Chart showing completion breakdown (on-time, delayed, cancelled).
- Department efficiency progress bars.
- 4 KPI cards with trend badges.
- Recent outputs list with format badge, timestamp, and action link.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test src/features/agentic/components/command-center/results-metrics-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/agentic/components/command-center/results-metrics-panel.tsx apps/console/src/features/agentic/components/command-center/results-metrics-panel.test.tsx
git commit -m "feat(console): implement ResultsMetricsPanel with SVG donut and department KPIs"
```

---

### Task 7: Orchestrator Integration & Modal Wiring (`agentic-command-center.tsx`)

**Files:**
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`
- Test: `apps/console/src/features/agentic/tests/agentic-command-center.test.tsx`

**Interfaces:**
- Consumes: Subcomponents from `./command-center/*` and existing APIs (`marketingApi`, `catalogApi`, `inventoryApi`, `supportApi`).
- Produces: Refactored `AgenticCommandCenter` component maintaining complete parity with all business modals and real-time state.

- [ ] **Step 1: Write integration test verifying subcomponents are rendered with live data**

Ensure `agentic-command-center.test.tsx` exercises:
- Header rendering with dynamic task counts from `overview`.
- Submitting a strategic prompt initiates the planning stepper.
- Clicking an approval trigger opens the correct proposal modal (`CampaignPreviewModal`, `OperationsProposalModal`, etc.).
- Department cards display real digital employees and queues.

- [ ] **Step 2: Refactor `agentic-command-center.tsx`**

Replace the monolithic JSX in `agentic-command-center.tsx`:
- Import `CommandCenterHeader`, `CommandComposerPanel`, `WorkforceGrid`, `LiveActivityFeed`, `PendingApprovalsPanel`, and `ResultsMetricsPanel`.
- Assemble the 3-Tier layout:
  - Tier 1: `CommandCenterHeader` + `CommandComposerPanel`
  - Tier 2: Two-column layout (WorkforceGrid on left 70%, LiveActivityFeed + PendingApprovalsPanel on right 30%)
  - Tier 3: `ResultsMetricsPanel`
- Keep all existing modals wired: `OperationsProposalModal`, `CampaignProposalModal`, `CampaignPreviewModal`, `SocialTokenManagerModal`.
- Remove redundant duplicate styling/DOM blocks while preserving existing state hooks.

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test src/features/agentic/tests/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/console/src/features/agentic/components/agentic-command-center.tsx apps/console/src/features/agentic/tests/agentic-command-center.test.tsx
git commit -m "refactor(console): wire modular AI Command Center subcomponents and assemble 3-tier layout"
```

---

### Task 8: End-to-End Verification, Responsive Checks & Repository Audit

**Files:**
- All touched files

- [ ] **Step 1: Run full Console test suite**

Run: `pnpm --filter @opendx/console test`
Expected: ALL PASS

- [ ] **Step 2: Run strict TypeScript check on Console**

Run: `pnpm --filter @opendx/console typecheck`
Expected: 0 errors

- [ ] **Step 3: Run repository-wide fast gate**

Run: `pnpm check`
Expected: PASS across all workspaces

- [ ] **Step 4: Run repository audit and diff check**

Run:
```bash
git diff --check
pnpm audit:repo
```
Expected: Clean with 0 warnings or errors

- [ ] **Step 5: Record updates in CHANGELOG.md under `[Unreleased]` and commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): record AI Command Center UI redesign and modular decomposition"
```
