// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

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
  readonly onDirectModeToggle?: () => void;
  readonly directInputMode?: boolean;
}

export interface QuickActionTemplate {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly target: string;
  readonly priority?: "low" | "normal" | "high" | "urgent";
}

export interface CommandComposerSubmitMeta {
  readonly prompt?: string;
  readonly context?: string;
  readonly goalTarget?: string;
  readonly attachments?: readonly { readonly name: string; readonly size: number }[];
  readonly priority?: "low" | "normal" | "high" | "urgent";
  readonly target?: string;
}

export interface CeoPlanStep {
  readonly role: string;
  readonly task: string;
  readonly status: "pending" | "running" | "done";
}

export interface CeoPlan {
  readonly goal: string;
  readonly targetDept: string;
  readonly steps: readonly CeoPlanStep[];
}

export interface CommandComposerProps {
  readonly prompt: string;
  readonly onPromptChange: (val: string) => void;
  readonly onSubmit: (meta?: CommandComposerSubmitMeta) => void;
  readonly isSubmitting: boolean;
  readonly isAnalyzing: boolean;
  readonly analysisStep: number; // 1 to 4
  readonly analysisDurationSeconds: number;
  readonly priority: "low" | "normal" | "high" | "urgent";
  readonly onPriorityChange: (p: "low" | "normal" | "high" | "urgent") => void;
  readonly targetDepartment: string;
  readonly onTargetDepartmentChange: (target: string) => void;
  readonly onSelectTemplate: (template: QuickActionTemplate) => void;
  readonly ceoPlan?: CeoPlan | null;
  readonly onResetCeoPlan?: () => void;
  readonly onViewDeliverable?: () => void;
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
  readonly onSendDirectTask?: (text: string) => void | Promise<void>;
  readonly directInputPlaceholder?: string;
  readonly headerExtra?: React.ReactNode;
  readonly alertBanner?: React.ReactNode;
  readonly children?: React.ReactNode;
  readonly directInputMode?: boolean;
  readonly taskFilter?: TaskFilterType;
  readonly onTaskClick?: (taskId: string) => void;
}

export interface WorkforceGridProps {
  readonly departments: readonly DepartmentCardProps[];
  readonly onViewDagGraph: () => void;
  readonly children?: React.ReactNode;
  readonly containerRef?: React.RefObject<HTMLDivElement | null>;
}

export interface LiveEventItem {
  readonly id: string;
  readonly timestamp: string;
  readonly time?: string;
  readonly date?: string;
  readonly createdAt?: number;
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
  readonly onReject?: () => void;
}

export interface PendingApprovalsProps {
  readonly approvals: readonly PendingApprovalItem[];
  readonly onViewAll: () => void;
  readonly maxHeight?: number;
  readonly focusedApprovalId?: string;
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
  readonly avgDurationDisplay?: string;
  readonly durationTrendPercent: number;
  readonly approvalRatePercent: number;
  readonly approvalRateTrendPercent: number;
  readonly recentDeliverables: readonly RecentDeliverableItem[];
  readonly onViewAllDeliverables: () => void;
}
