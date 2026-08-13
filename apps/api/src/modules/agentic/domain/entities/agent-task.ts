// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type AgenticTaskState = "draft" | "ready" | "canceled";

export interface AgentTask {
  readonly id: string;
  readonly state: AgenticTaskState;
  readonly createdBy: string;
  readonly goal: string;
  readonly instructions: string;
  readonly deadline?: string;
  readonly configurationRevisionId?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentSubtaskDependency {
  readonly from: string;
  readonly to: string;
}
