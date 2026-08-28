// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentServicePrincipal } from "../../identity/agent-service-principal";
import type { PolicyDecision } from "../../../domain/entities/governance-records";
import type {
  DepartmentAgentKind,
  DepartmentToolName,
  DepartmentToolScope,
  ToolClassification,
} from "../../tools/department-tool-contracts";

export interface ToolAuthorizationRequest {
  readonly principal: AgentServicePrincipal;
  readonly taskId: string;
  readonly toolName: string;
  readonly toolVersion: number;
  readonly modelId: string;
  readonly purpose: string;
  readonly department?: string;
  readonly dataScope: string;
  readonly dataClassification: string;
  readonly inputSchemaDigest: string;
  readonly parametersDigest: string;
  readonly costMicros: number;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly approvalId?: string;
}

export interface ToolInvocation {
  readonly principal: AgentServicePrincipal & { readonly agentKind: DepartmentAgentKind };
  readonly taskId: string;
  readonly toolName: DepartmentToolName;
  readonly toolVersion: 1;
  readonly modelId: string;
  readonly purpose: "store_health_review" | "marketing_publication";
  readonly dataScope: DepartmentToolScope;
  readonly dataClassification: ToolClassification;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly approvalId?: string;
}

export interface ToolResult<TOutput> {
  readonly output: TOutput;
  readonly provenanceIds: readonly string[];
}

export interface ToolRegistry {
  authorize(request: ToolAuthorizationRequest): Promise<PolicyDecision>;
  invoke<TOutput>(request: ToolInvocation): Promise<ToolResult<TOutput>>;
}
