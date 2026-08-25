// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { ApprovalRequest } from "../../../domain/entities/approval-request";
import type { AgenticApprovalDetailDto, AgenticEmployeeDetailDto, AgenticEmployeeSummaryDto, AgenticFileGovernancePreviewDto, AgenticTaskIntakeResultDto, AgenticTaskOperationsDto, AgenticTaskOverviewDto, AgenticTaskPageDto } from "../../dtos/responses/agentic-console.dto";
import type { AgentKind } from "../../../domain/entities/agent-profile";

export type AgenticConsoleTaskState = "draft" | "ready" | "received" | "planning"
  | "awaiting_plan_approval" | "dispatching" | "department_analysis"
  | "quality_review" | "collaboration" | "executive_synthesis"
  | "awaiting_human_approval" | "retrying" | "partially_completed"
  | "failed" | "canceled" | "completed";

export interface AgenticTaskFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly state?: AgenticConsoleTaskState;
  readonly createdBy?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
}

export interface CreateTaskIntakeInput {
  readonly mode: "store_health_review" | "advanced";
  readonly goal: string;
  readonly instructions: string;
  readonly deadline?: string;
  readonly reviewWindow?: { readonly start: string; readonly end: string };
  readonly idempotencyKey: string;
}

export interface AgenticConsoleService {
  createTaskIntake(input: CreateTaskIntakeInput, principal: StaffPrincipal): Promise<AgenticTaskIntakeResultDto>;
  listTasks(filter: AgenticTaskFilter, principal: StaffPrincipal): Promise<AgenticTaskPageDto>;
  getOverview(principal: StaffPrincipal): Promise<AgenticTaskOverviewDto>;
  getFileGovernancePreview(principal: StaffPrincipal): Promise<AgenticFileGovernancePreviewDto>;
  getTaskOperations(taskId: string, principal: StaffPrincipal): Promise<AgenticTaskOperationsDto>;
  getApprovalDetail(approval: ApprovalRequest): Promise<AgenticApprovalDetailDto>;
  listEmployees(principal: StaffPrincipal): Promise<readonly AgenticEmployeeSummaryDto[]>;
  getEmployee(agentKind: AgentKind, principal: StaffPrincipal): Promise<AgenticEmployeeDetailDto>;
}
