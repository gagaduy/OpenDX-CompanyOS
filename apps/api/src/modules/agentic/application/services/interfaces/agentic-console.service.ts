// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { AgenticTaskIntakeResultDto, AgenticTaskOverviewDto, AgenticTaskPageDto } from "../../dtos/responses/agentic-console.dto";

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
}
