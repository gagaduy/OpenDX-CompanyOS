// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { AgentKind } from "../../../domain/entities/agent-profile";
import type { AgentTask, AgentSubtaskDependency } from "../../../domain/entities/agent-task";

export interface AgentSubtaskInput { readonly id?: string; readonly agentKind: AgentKind; readonly title: string }
export interface TaskIntakeProvenanceInput { readonly sourceType: string; readonly sourceId: string; readonly sourceDigest: string; readonly classification: string }
export interface AgentTaskDraftInput { readonly goal: string; readonly instructions: string; readonly deadline?: string; readonly subtasks: readonly AgentSubtaskInput[]; readonly dependencies: readonly AgentSubtaskDependency[] }
export interface CreateAgentTaskInput extends AgentTaskDraftInput { readonly provenance: TaskIntakeProvenanceInput }
export interface UpdateAgentTaskInput extends AgentTaskDraftInput { readonly taskId: string; readonly expectedVersion: number }
export interface ReadyAgentTaskInput { readonly taskId: string; readonly expectedVersion: number }
export interface CancelAgentTaskInput { readonly taskId: string; readonly expectedVersion: number }
export interface AgentTaskQuery { readonly page: number; readonly pageSize: number }
export interface AgentTaskDetail { readonly task: AgentTask; readonly subtasks: readonly AgentSubtaskInput[]; readonly dependencies: readonly AgentSubtaskDependency[] }
export interface AgentTaskPage { readonly items: readonly AgentTask[]; readonly totalItems: number }

export interface AgentTaskService {
  create(input: CreateAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  updateDraft(input: UpdateAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  ready(input: ReadyAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  cancel(input: CancelAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  get(taskId: string, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  list(query: AgentTaskQuery, principal: StaffPrincipal): Promise<AgentTaskPage>;
}
