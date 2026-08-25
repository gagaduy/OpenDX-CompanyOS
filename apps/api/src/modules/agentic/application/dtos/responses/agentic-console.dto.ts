// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticConsoleTaskRecord } from "../../repositories/interfaces/agentic.repository";
import type { AgentTaskDetail } from "../../services/interfaces/agent-task.service";

export interface AgenticTaskOverviewDto {
  readonly counts: Readonly<Record<"running" | "waiting" | "failed" | "completed" | "canceled", number>>;
  readonly pendingApprovals: number;
  readonly settledCostMicros: number;
  readonly refreshedAt: string;
}

export interface AgenticTaskPageDto {
  readonly items: readonly AgenticConsoleTaskRecord[];
  readonly totalItems: number;
  readonly refreshedAt: string;
}

export interface AgenticTaskIntakeResultDto {
  readonly disposition: "created" | "replayed";
  readonly detail: AgentTaskDetail;
}

export interface AgenticFileGovernancePreviewDto {
  readonly coordinator: "ai_ceo";
  readonly eligibleDepartments: readonly ("catalog" | "inventory" | "order" | "finance" | "crm" | "support")[];
  readonly allowedTools: readonly string[];
  readonly dataClasses: readonly string[];
  readonly riskSignals: readonly string[];
  readonly dependencyStatus: "planned_after_task_start";
  readonly configurationRevisionId: string;
  readonly configurationVersion: number;
}
