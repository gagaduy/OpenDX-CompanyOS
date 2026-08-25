// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { WorkloadPrincipal } from "../../../../../shared/auth/workload-principal";
import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { AgentKind } from "../../../domain/entities/agent-profile";
import type {
  ModelFallbackPosition,
  ModelGenerationRound,
} from "../../../domain/entities/model-run";

export interface ReserveModelRunCommand {
  readonly taskId: string;
  readonly agentKind: AgentKind;
  readonly generationRound: ModelGenerationRound;
  readonly idempotencyKey: string;
  readonly inputDigest: string;
  readonly resultSchemaName: string;
  readonly resultSchemaDigest: string;
  readonly primaryModel: string;
  readonly fallbackModel: string;
}

export interface StartModelRunCommand {
  readonly runId: string;
  readonly expectedVersion: number;
  readonly returnedModel: string;
  readonly fallbackPosition: ModelFallbackPosition;
}

export interface CompleteModelRunCommand {
  readonly runId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly status: "completed" | "partial" | "escalated";
  readonly outputDigest: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly providerRequestIdDigest: string;
  readonly latencyMs: number;
  readonly statusCode: string;
  readonly qualityOutcome: "accepted" | "partial" | "escalate";
  readonly qualityReasonCodes: readonly string[];
  readonly provenanceIds: readonly string[];
  readonly evidenceDigest: string;
}

export interface FailModelRunCommand {
  readonly runId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly outputDigest?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly providerRequestIdDigest?: string;
  readonly latencyMs: number;
  readonly statusCode: string;
  readonly errorCode: string;
  readonly qualityOutcome: "correct" | "escalate";
  readonly qualityReasonCodes: readonly string[];
  readonly provenanceIds: readonly string[];
  readonly evidenceDigest: string;
}

export interface ModelRunReservationReceipt {
  readonly runId: string;
  readonly primaryModel: string;
  readonly fallbackModel: string;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly schemaVersion: 1;
  readonly inputCostMicrosPerMillion: number;
  readonly outputCostMicrosPerMillion: number;
  readonly maxReservedCostMicros: number;
  readonly version: number;
}

export interface ModelRunStateReceipt {
  readonly runId: string;
  readonly status: "running" | "completed" | "failed" | "partial" | "escalated";
  readonly version: number;
  readonly settledCostMicros?: number;
}

export interface ModelRunService {
  reserve(input: ReserveModelRunCommand, principal: WorkloadPrincipal): Promise<ModelRunReservationReceipt>;
  start(input: StartModelRunCommand, principal: WorkloadPrincipal): Promise<ModelRunStateReceipt>;
  complete(input: CompleteModelRunCommand, principal: WorkloadPrincipal): Promise<ModelRunStateReceipt>;
  fail(input: FailModelRunCommand, principal: WorkloadPrincipal): Promise<ModelRunStateReceipt>;
  completeInSession(
    input: CompleteModelRunCommand,
    principal: { readonly subject: string; readonly clientId: string },
    session: DatabaseSession,
    binding: {
      readonly taskId: string;
      readonly agentKind: AgentKind;
      readonly configurationRevisionId: string;
      readonly policyVersion: number;
      readonly resultSchemaVersion: number;
      readonly resultSchemaName: string;
      readonly resultSchemaDigest: string;
      readonly inputDigest: string;
      readonly allowEmptyProvenance?: boolean;
    },
  ): Promise<ModelRunStateReceipt>;
}
