// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentKind } from "./agent-profile";

export type ModelRunStatus =
  | "reserved"
  | "running"
  | "completed"
  | "failed"
  | "partial"
  | "escalated";

export type ModelRunTerminalStatus = Exclude<ModelRunStatus, "reserved" | "running">;
export type ModelFallbackPosition = 0 | 1;
export type ModelGenerationRound = 0 | 1 | 2;

export interface ModelRun {
  readonly id: string;
  readonly taskId: string;
  readonly agentKind: AgentKind;
  readonly configurationRevisionId: string;
  readonly schemaVersion: number;
  readonly generationRound: ModelGenerationRound;
  readonly idempotencyKey: string;
  readonly requestedModel: string;
  readonly returnedModel?: string;
  readonly fallbackPosition?: ModelFallbackPosition;
  readonly policyVersion: number;
  readonly configurationVersion: number;
  readonly resultSchemaVersion: number;
  readonly resultSchemaName?: string;
  readonly resultSchemaDigest?: string;
  readonly inputDigest: string;
  readonly outputDigest?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly inputCostMicrosPerMillion: number;
  readonly outputCostMicrosPerMillion: number;
  readonly maxReservedCostMicros: number;
  readonly settledCostMicros?: number;
  readonly providerRequestIdDigest?: string;
  readonly latencyMs?: number;
  readonly status: ModelRunStatus;
  readonly statusCode?: string;
  readonly errorCode?: string;
  readonly qualityReasonCodes: readonly string[];
  readonly provenanceIds: readonly string[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface ModelQualityEvidence {
  readonly id: string;
  readonly modelRunId: string;
  readonly generationRound: ModelGenerationRound;
  readonly idempotencyKey: string;
  readonly outcome: "accepted" | "correct" | "partial" | "escalate";
  readonly reasonCodes: readonly string[];
  readonly provenanceIds: readonly string[];
  readonly evidenceDigest: string;
  readonly recordedAt: string;
}
