// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentServicePrincipal } from "../../identity/agent-service-principal";
import type { PolicyDecision } from "../../../domain/entities/governance-records";

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
  readonly approvalId?: string;
}

export interface ToolInvocation extends ToolAuthorizationRequest {}

export interface ToolResult<TOutput> {
  readonly output: TOutput;
  readonly provenanceIds: readonly string[];
}

export interface ToolRegistry {
  authorize(request: ToolAuthorizationRequest): Promise<PolicyDecision>;
  invoke<TOutput>(request: ToolInvocation): Promise<ToolResult<TOutput>>;
}
