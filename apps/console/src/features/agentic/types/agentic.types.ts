// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type AgenticTaskState = "draft" | "ready" | "received" | "planning" | "awaiting_plan_approval" | "dispatching" | "department_analysis" | "quality_review" | "collaboration" | "executive_synthesis" | "awaiting_human_approval" | "retrying" | "partially_completed" | "failed" | "canceled" | "completed";
export interface AgenticTaskFilter { readonly page: number; readonly pageSize: number; readonly state?: AgenticTaskState; readonly createdBy?: string; readonly createdFrom?: string; readonly createdTo?: string }
export interface AgenticTaskSummary { readonly id: string; readonly state: AgenticTaskState; readonly createdBy: string; readonly goal: string; readonly version: number; readonly createdAt: string; readonly updatedAt: string }
export interface AgenticTaskPage { readonly items: readonly AgenticTaskSummary[]; readonly totalItems: number; readonly refreshedAt: string }
export interface AgenticTaskOverview { readonly counts: Readonly<Record<"running" | "waiting" | "failed" | "completed" | "canceled", number>>; readonly pendingApprovals: number; readonly settledCostMicros: number; readonly refreshedAt: string }
export interface AgenticTaskIntake { readonly mode: "store_health_review" | "advanced"; readonly goal: string; readonly instructions: string; readonly deadline?: string; readonly reviewWindow?: { readonly start: string; readonly end: string } }
export interface AgenticTaskDetail { readonly task: AgenticTaskSummary; readonly subtasks: readonly { readonly id?: string; readonly agentKind: string; readonly title: string }[]; readonly dependencies: readonly { readonly from: string; readonly to: string }[] }
