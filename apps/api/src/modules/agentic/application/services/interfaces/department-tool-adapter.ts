// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DepartmentAgentKind, DepartmentToolName } from "../../tools/department-tool-contracts";

export interface DepartmentToolExecutionContext {
  readonly invocationId: string;
  readonly taskId: string;
  readonly agentKind: DepartmentAgentKind;
  readonly toolName: DepartmentToolName;
  readonly toolVersion: 1;
  readonly attempt: number;
  readonly correlationId: string;
  readonly causationId: string;
}

export interface DepartmentToolAdapter {
  execute(
    context: DepartmentToolExecutionContext,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}

export interface DepartmentToolAdapterRegistry {
  resolve(name: DepartmentToolName, version: 1): DepartmentToolAdapter;
}
