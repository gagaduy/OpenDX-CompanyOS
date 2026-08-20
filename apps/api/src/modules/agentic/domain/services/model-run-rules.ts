// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ModelFallbackPosition,
  ModelQualityEvidence,
  ModelRun,
  ModelRunTerminalStatus,
} from "../entities/model-run";
import { AGENT_KINDS } from "../entities/agent-profile";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";

const MILLION = 1_000_000n;
const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$/;
const OFFSET_ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const MODEL_RUN_STATUSES = ["reserved", "running", "completed", "failed", "partial", "escalated"] as const;
const QUALITY_OUTCOMES = ["accepted", "correct", "partial", "escalate"] as const;

export interface ModelRunReservationCostInput {
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly inputCostMicrosPerMillion: number;
  readonly outputCostMicrosPerMillion: number;
}

export type ModelRunTransition = {
  readonly type: "start";
  readonly returnedModel: string;
  readonly fallbackPosition: ModelFallbackPosition;
} | {
  readonly type: "settle";
  readonly status: ModelRunTerminalStatus;
  readonly outputDigest?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly settledCostMicros: number;
  readonly providerRequestIdDigest?: string;
  readonly latencyMs: number;
  readonly statusCode: string;
  readonly errorCode?: string;
  readonly qualityReasonCodes: readonly string[];
  readonly provenanceIds: readonly string[];
};

export function calculateMaximumModelRunReservation(input: ModelRunReservationCostInput): number {
  const values = [
    input.maxInputTokens,
    input.maxOutputTokens,
    input.inputCostMicrosPerMillion,
    input.outputCostMicrosPerMillion,
  ];
  if (values.some((value) => typeof value !== "number" || !isNonnegativeSafeInteger(value))) {
    fail("MODEL_RUN_COST_INVALID", "Model run cost inputs are invalid");
  }
  const inputCost = ceilDivide(
    BigInt(input.maxInputTokens) * BigInt(input.inputCostMicrosPerMillion),
    MILLION,
  );
  const outputCost = ceilDivide(
    BigInt(input.maxOutputTokens) * BigInt(input.outputCostMicrosPerMillion),
    MILLION,
  );
  const total = inputCost + outputCost;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail("MODEL_RUN_COST_INVALID", "Model run reservation exceeds the safe integer range");
  }
  return Number(total);
}

export function transitionModelRun(
  run: ModelRun,
  transition: ModelRunTransition,
  at: string,
): ModelRun {
  validateModelRun(run);
  if (transition.type === "start") {
    if (run.status !== "reserved" || !validModel(transition.returnedModel)) {
      fail("MODEL_RUN_STATE_INVALID", "Only reserved model runs can start");
    }
    const next: ModelRun = {
      ...run,
      status: "running",
      returnedModel: transition.returnedModel,
      fallbackPosition: transition.fallbackPosition,
      version: run.version + 1,
      startedAt: at,
      updatedAt: at,
    };
    validateModelRun(next);
    return next;
  }
  if (run.status !== "running") {
    fail("MODEL_RUN_STATE_INVALID", "Only running model runs can settle");
  }
  const next: ModelRun = {
    ...run,
    status: transition.status,
    ...(transition.outputDigest === undefined ? {} : { outputDigest: transition.outputDigest }),
    inputTokens: transition.inputTokens,
    outputTokens: transition.outputTokens,
    settledCostMicros: transition.settledCostMicros,
    ...(transition.providerRequestIdDigest === undefined
      ? {}
      : { providerRequestIdDigest: transition.providerRequestIdDigest }),
    latencyMs: transition.latencyMs,
    statusCode: transition.statusCode,
    ...(transition.errorCode === undefined ? {} : { errorCode: transition.errorCode }),
    qualityReasonCodes: [...transition.qualityReasonCodes],
    provenanceIds: [...transition.provenanceIds],
    version: run.version + 1,
    completedAt: at,
    updatedAt: at,
  };
  validateModelRun(next);
  return next;
}

export function validateModelRun(run: ModelRun): void {
  const identifiers = [run.id, run.taskId, run.configurationRevisionId, run.idempotencyKey];
  const versions = [
    run.schemaVersion,
    run.policyVersion,
    run.configurationVersion,
    run.resultSchemaVersion,
    run.version,
  ];
  const nonnegative = [
    run.inputCostMicrosPerMillion,
    run.outputCostMicrosPerMillion,
    run.maxReservedCostMicros,
    ...(run.inputTokens === undefined ? [] : [run.inputTokens]),
    ...(run.outputTokens === undefined ? [] : [run.outputTokens]),
    ...(run.settledCostMicros === undefined ? [] : [run.settledCostMicros]),
    ...(run.latencyMs === undefined ? [] : [run.latencyMs]),
  ];
  const digests = [
    run.inputDigest,
    ...(run.outputDigest === undefined ? [] : [run.outputDigest]),
    ...(run.providerRequestIdDigest === undefined ? [] : [run.providerRequestIdDigest]),
  ];
  const statusValid = includesLiteral(MODEL_RUN_STATUSES, run.status);
  const terminal = statusValid && isTerminal(run.status);
  const createdAt = parseOffsetIsoInstant(run.createdAt);
  const updatedAt = parseOffsetIsoInstant(run.updatedAt);
  const startedAt = run.startedAt === undefined ? undefined : parseOffsetIsoInstant(run.startedAt);
  const completedAt = run.completedAt === undefined ? undefined : parseOffsetIsoInstant(run.completedAt);
  const startedRequired = run.status === "running" || terminal;
  if (
    identifiers.some((value) => !SAFE_IDENTIFIER.test(value))
    || !includesLiteral(AGENT_KINDS, run.agentKind)
    || !statusValid
    || !validModel(run.requestedModel)
    || (run.returnedModel !== undefined && !validModel(run.returnedModel))
    || ![0, 1, 2].includes(run.generationRound)
    || (run.fallbackPosition !== undefined && ![0, 1].includes(run.fallbackPosition))
    || versions.some((value) => !Number.isSafeInteger(value) || value <= 0)
    || nonnegative.some((value) => !isNonnegativeSafeInteger(value))
    || (run.settledCostMicros !== undefined
      && run.settledCostMicros > run.maxReservedCostMicros)
    || digests.some((value) => !DIGEST.test(value))
    || !validSafeCodes(run.qualityReasonCodes)
    || !validIdentifiers(run.provenanceIds)
    || createdAt === undefined
    || updatedAt === undefined
    || updatedAt < createdAt
    || (run.startedAt !== undefined && startedAt === undefined)
    || (run.completedAt !== undefined && completedAt === undefined)
    || startedRequired !== (startedAt !== undefined)
    || terminal !== (completedAt !== undefined)
    || (startedAt !== undefined && (startedAt < createdAt || updatedAt < startedAt))
    || (completedAt !== undefined && startedAt !== undefined
      && (completedAt < startedAt || updatedAt < completedAt))
    || (run.status === "reserved" && !hasReservedFields(run))
    || (run.status === "running" && !hasRunningFields(run))
    || (terminal && !hasTerminalFields(run))
    || (run.status === "completed"
      && (run.outputDigest === undefined || run.providerRequestIdDigest === undefined))
    || (run.statusCode !== undefined && !SAFE_CODE.test(run.statusCode))
    || (run.errorCode !== undefined && !SAFE_CODE.test(run.errorCode))
  ) {
    fail("MODEL_RUN_INVALID", "Model run is invalid");
  }
}

export function validateModelQualityEvidence(evidence: ModelQualityEvidence): void {
  if (
    !SAFE_IDENTIFIER.test(evidence.id)
    || !SAFE_IDENTIFIER.test(evidence.modelRunId)
    || !SAFE_IDENTIFIER.test(evidence.idempotencyKey)
    || ![0, 1, 2].includes(evidence.generationRound)
    || !includesLiteral(QUALITY_OUTCOMES, evidence.outcome)
    || !validSafeCodes(evidence.reasonCodes)
    || !validIdentifiers(evidence.provenanceIds)
    || !DIGEST.test(evidence.evidenceDigest)
    || parseOffsetIsoInstant(evidence.recordedAt) === undefined
  ) {
    fail("MODEL_QUALITY_EVIDENCE_INVALID", "Model quality evidence is invalid");
  }
}

function ceilDivide(value: bigint, divisor: bigint): bigint {
  return value === 0n ? 0n : (value + divisor - 1n) / divisor;
}

function validModel(value: unknown): value is string {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && value.length <= 255
    && SAFE_IDENTIFIER.test(value);
}

function validSafeCodes(values: unknown): values is readonly string[] {
  return Array.isArray(values) && values.length <= 32 && new Set(values).size === values.length
    && values.every((value) => typeof value === "string" && SAFE_CODE.test(value));
}

function validIdentifiers(values: unknown): values is readonly string[] {
  return Array.isArray(values) && values.length <= 128 && new Set(values).size === values.length
    && values.every((value) => typeof value === "string" && SAFE_IDENTIFIER.test(value));
}

function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isTerminal(status: ModelRun["status"]): boolean {
  return status === "completed" || status === "failed" || status === "partial" || status === "escalated";
}

function hasReservedFields(run: ModelRun): boolean {
  return run.returnedModel === undefined
    && run.fallbackPosition === undefined
    && run.startedAt === undefined
    && run.completedAt === undefined
    && !hasTerminalResultFields(run)
    && run.qualityReasonCodes.length === 0
    && run.provenanceIds.length === 0;
}

function hasRunningFields(run: ModelRun): boolean {
  return run.returnedModel !== undefined
    && run.fallbackPosition !== undefined
    && run.startedAt !== undefined
    && run.completedAt === undefined
    && !hasTerminalResultFields(run)
    && run.qualityReasonCodes.length === 0
    && run.provenanceIds.length === 0;
}

function hasTerminalFields(run: ModelRun): boolean {
  return run.returnedModel !== undefined
    && run.fallbackPosition !== undefined
    && run.startedAt !== undefined
    && run.completedAt !== undefined
    && run.inputTokens !== undefined
    && run.outputTokens !== undefined
    && run.settledCostMicros !== undefined
    && run.latencyMs !== undefined
    && run.statusCode !== undefined;
}

function hasTerminalResultFields(run: ModelRun): boolean {
  return run.outputDigest !== undefined
    || run.inputTokens !== undefined
    || run.outputTokens !== undefined
    || run.settledCostMicros !== undefined
    || run.providerRequestIdDigest !== undefined
    || run.latencyMs !== undefined
    || run.statusCode !== undefined
    || run.errorCode !== undefined;
}

function includesLiteral<const Value extends string>(
  values: readonly Value[],
  value: unknown,
): value is Value {
  return typeof value === "string" && values.includes(value as Value);
}

function parseOffsetIsoInstant(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = OFFSET_ISO_INSTANT.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    local.getUTCFullYear() !== year
    || local.getUTCMonth() !== month - 1
    || local.getUTCDate() !== day
    || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute
    || local.getUTCSeconds() !== second
    || offsetHour > 23
    || offsetMinute > 59
  ) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fail(code: string, message: string): never {
  throw new AgenticDomainError(code, message);
}
