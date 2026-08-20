// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { WorkloadPrincipal } from "../../../../../shared/auth/workload-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type {
  AgenticRepository,
  ModelConfigurationRecord,
} from "../../repositories/interfaces/agentic.repository";
import type { AgentKind } from "../../../domain/entities/agent-profile";
import type { ModelQualityEvidence, ModelRun } from "../../../domain/entities/model-run";
import {
  calculateMaximumModelRunReservation,
  transitionModelRun,
} from "../../../domain/services/model-run-rules";
import { AgenticApplicationError } from "../agentic-application.error";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";
import type {
  CompleteModelRunCommand,
  FailModelRunCommand,
  ModelRunReservationReceipt,
  ModelRunService,
  ModelRunStateReceipt,
  ReserveModelRunCommand,
  StartModelRunCommand,
} from "../interfaces/model-run.service";

const workerClientId = "opendx-agentic-worker";
const schemaVersion = 1 as const;
const approvedFallbackModel = "liquid/lfm-2.5-2.6b:free";
const approvedPrimaryModels: Readonly<Record<AgentKind, string>> = {
  ai_ceo: "z-ai/glm-5.2:free",
  catalog: "google/gemma-4-26b-a4b-it:free",
  inventory: "google/gemma-4-31b-it:free",
  order: "nvidia/nemotron-3-super-120b-a12b:free",
  finance: "openai/gpt-oss-20b:free",
  crm: "dots-studio/dots-3-note-preview:free",
  support: "nvidia/nemotron-nano-9b-v2:free",
};

type ModelRunRepository = Pick<AgenticRepository,
  | "findTaskForAgent" | "findRevision" | "findAgentByKind" | "findModelConfiguration"
  | "findActiveRevocation" | "reserveModelRun" | "findModelRun" | "markModelRunRunning"
  | "settleModelRunTerminal" | "reserveBudget" | "settleBudget"
  | "findModelRunBudgetReservation" | "appendModelQualityEvidence"
  | "findModelQualityEvidenceByIdempotencyKey" | "listProvenance" | "appendProvenance"
  | "appendAudit">;

interface AuthorizedReservation {
  readonly revisionId: string;
  readonly revisionVersion: number;
  readonly policyVersion: number;
  readonly configuration: ModelConfigurationRecord;
}

type TerminalCommand = CompleteModelRunCommand | FailModelRunCommand;

export class ModelRunServiceImpl implements ModelRunService {
  constructor(
    private readonly repository: ModelRunRepository,
    private readonly transactions: TransactionRunner,
    private readonly policy: PolicyEvaluator,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async reserve(
    input: ReserveModelRunCommand,
    principal: WorkloadPrincipal,
  ): Promise<ModelRunReservationReceipt> {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      const authorization = await this.authorizeReservation(session, input);
      const at = this.now();
      const maximum = calculateMaximumModelRunReservation({
        maxInputTokens: authorization.configuration.maxInputTokens,
        maxOutputTokens: authorization.configuration.maxOutputTokens,
        inputCostMicrosPerMillion: authorization.configuration.inputCostMicrosPerMillion,
        outputCostMicrosPerMillion: authorization.configuration.outputCostMicrosPerMillion,
      });
      const run: ModelRun = {
        id: this.generateId(),
        taskId: input.taskId,
        agentKind: input.agentKind,
        configurationRevisionId: authorization.revisionId,
        schemaVersion,
        generationRound: input.generationRound,
        idempotencyKey: input.idempotencyKey,
        requestedModel: input.primaryModel,
        policyVersion: authorization.policyVersion,
        configurationVersion: authorization.revisionVersion,
        resultSchemaVersion: schemaVersion,
        inputDigest: input.inputDigest,
        inputCostMicrosPerMillion: authorization.configuration.inputCostMicrosPerMillion,
        outputCostMicrosPerMillion: authorization.configuration.outputCostMicrosPerMillion,
        maxReservedCostMicros: maximum,
        status: "reserved",
        qualityReasonCodes: [],
        provenanceIds: [],
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
      const reservation = await this.repository.reserveModelRun(session, run);
      if (reservation.status === "conflict") {
        fail("MODEL_RUN_CONFLICT", "Model run idempotency conflicts with stored evidence");
      }
      const budget = await this.repository.reserveBudget(session, {
        id: this.generateId(),
        revisionId: authorization.revisionId,
        agentKind: input.agentKind,
        taskId: input.taskId,
        idempotencyKey: `${input.idempotencyKey}:budget`,
        costMicros: maximum,
        occurredAt: at,
        modelRunId: reservation.run.id,
      });
      if (budget === "exceeded") fail("BUDGET_EXCEEDED", "Model run budget limit exceeded");
      if (budget === "conflict") fail("MODEL_RUN_CONFLICT", "Model run budget idempotency conflicts");
      if (reservation.status === "reserved") {
        await this.repository.appendAudit(session, {
          id: this.generateId(),
          actorId: principal.subject,
          clientId: principal.clientId,
          actorType: "system",
          taskId: input.taskId,
          action: "model_run.reserve",
          resourceType: "model_run",
          resourceId: reservation.run.id,
          outcome: "allowed",
          policyVersion: authorization.policyVersion,
          modelVersion: authorization.revisionVersion,
          correlationId: reservation.run.id,
          parametersDigest: input.inputDigest,
          attempt: input.generationRound,
          occurredAt: at,
        });
      }
      return reservationReceipt(reservation.run, authorization.configuration);
    });
  }

  async start(
    input: StartModelRunCommand,
    principal: WorkloadPrincipal,
  ): Promise<ModelRunStateReceipt> {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      const current = await this.requireRun(session, input.runId);
      const configuration = await this.requireStoredConfiguration(session, current);
      const expectedModel = input.fallbackPosition === 0
        ? configuration.primaryModel
        : configuration.fallbackModels[0];
      if (expectedModel === undefined || input.returnedModel !== expectedModel) {
        fail("MODEL_RETURN_MISMATCH", "Returned model does not match the approved model position");
      }
      await this.requireExecutionActive(session, current, configuration);
      if (current.status === "running") {
        if (
          current.version === input.expectedVersion + 1
          && current.returnedModel === input.returnedModel
          && current.fallbackPosition === input.fallbackPosition
        ) return stateReceipt(current);
        fail("MODEL_RUN_CONFLICT", "Model run already started with different execution fields");
      }
      if (current.status !== "reserved" || current.version !== input.expectedVersion) {
        fail("STALE_VERSION", "Model run version is stale");
      }
      const next = transitionModelRun(current, {
        type: "start",
        returnedModel: input.returnedModel,
        fallbackPosition: input.fallbackPosition,
      }, this.now());
      if (!await this.repository.markModelRunRunning(session, next, input.expectedVersion)) {
        fail("STALE_VERSION", "Model run version is stale");
      }
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorId: principal.subject, clientId: principal.clientId,
        actorType: "system", taskId: current.taskId, action: "model_run.start",
        resourceType: "model_run", resourceId: current.id, outcome: "allowed",
        policyVersion: current.policyVersion, modelVersion: current.configurationVersion,
        correlationId: current.id, parametersDigest: current.inputDigest,
        attempt: current.generationRound, occurredAt: next.updatedAt,
      });
      return stateReceipt(next);
    });
  }

  complete(
    input: CompleteModelRunCommand,
    principal: WorkloadPrincipal,
  ): Promise<ModelRunStateReceipt> {
    return this.settle(input, principal);
  }

  fail(
    input: FailModelRunCommand,
    principal: WorkloadPrincipal,
  ): Promise<ModelRunStateReceipt> {
    return this.settle(input, principal);
  }

  private async settle(
    input: TerminalCommand,
    principal: WorkloadPrincipal,
  ): Promise<ModelRunStateReceipt> {
    requireWorker(principal);
    assertQualityOutcome(input);
    return this.transactions.run(async (session) => {
      const current = await this.requireRun(session, input.runId);
      const status = "status" in input ? input.status : "failed";
      const configuration = await this.requireStoredConfiguration(session, current);
      if (
        input.inputTokens > configuration.maxInputTokens
        || input.outputTokens > configuration.maxOutputTokens
      ) fail("MODEL_RUN_COST_EXCEEDED", "Model usage exceeds the authorized token bounds");
      const actualCost = calculateMaximumModelRunReservation({
        maxInputTokens: input.inputTokens,
        maxOutputTokens: input.outputTokens,
        inputCostMicrosPerMillion: current.inputCostMicrosPerMillion,
        outputCostMicrosPerMillion: current.outputCostMicrosPerMillion,
      });
      if (actualCost > current.maxReservedCostMicros) {
        fail("MODEL_RUN_COST_EXCEEDED", "Model settlement exceeds its reservation");
      }
      await this.requireProvenance(session, current.taskId, input.provenanceIds);
      if (isTerminal(current)) {
        await this.requireExactReplay(session, current, input, status, actualCost);
        return stateReceipt(current);
      }
      if (current.status !== "running" || current.version !== input.expectedVersion) {
        fail("STALE_VERSION", "Model run version is stale");
      }
      const at = this.now();
      const next = transitionModelRun(current, {
        type: "settle",
        status,
        ...(input.outputDigest === undefined ? {} : { outputDigest: input.outputDigest }),
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        settledCostMicros: actualCost,
        ...(input.providerRequestIdDigest === undefined
          ? {}
          : { providerRequestIdDigest: input.providerRequestIdDigest }),
        latencyMs: input.latencyMs,
        statusCode: input.statusCode,
        ...("errorCode" in input ? { errorCode: input.errorCode } : {}),
        qualityReasonCodes: input.qualityReasonCodes,
        provenanceIds: input.provenanceIds,
      }, at);
      const budgetReservation = await this.repository.findModelRunBudgetReservation(session, current.id);
      if (budgetReservation === undefined || budgetReservation.costMicros !== current.maxReservedCostMicros) {
        fail("MODEL_RUN_BUDGET_INVALID", "Model run budget reservation is unavailable");
      }
      const terminalResult = await this.repository.settleModelRunTerminal(
        session, next, input.expectedVersion,
      );
      if (terminalResult === "stale") fail("STALE_VERSION", "Model run version is stale");
      if (terminalResult !== "updated") {
        fail("MODEL_RUN_CONFLICT", "Model run terminal payload conflicts with stored evidence");
      }
      const budgetResult = await this.repository.settleBudget(session, {
        id: this.generateId(),
        reservationId: budgetReservation.id,
        idempotencyKey: `${input.idempotencyKey}:budget`,
        actualCostMicros: actualCost,
        occurredAt: at,
        modelRunId: current.id,
      });
      if (budgetResult !== "settled") {
        fail("MODEL_RUN_BUDGET_INVALID", "Model run budget settlement was not accepted");
      }
      const qualityEvidence: ModelQualityEvidence = {
        id: this.generateId(),
        modelRunId: current.id,
        generationRound: current.generationRound,
        idempotencyKey: `${input.idempotencyKey}:quality`,
        outcome: input.qualityOutcome,
        reasonCodes: input.qualityReasonCodes,
        provenanceIds: input.provenanceIds,
        evidenceDigest: input.evidenceDigest,
        recordedAt: at,
      };
      if (await this.repository.appendModelQualityEvidence(session, qualityEvidence) !== "created") {
        fail("MODEL_RUN_CONFLICT", "Quality evidence conflicts with stored evidence");
      }
      if (input.outputDigest !== undefined) {
        await this.repository.appendProvenance(session, {
          id: this.generateId(), taskId: current.taskId, sourceType: "model_result",
          sourceId: current.id, sourceDigest: input.outputDigest, sourceVersion: schemaVersion,
          classification: "internal", recordedBy: principal.subject, recordedAt: at,
        });
      }
      await this.repository.appendProvenance(session, {
        id: this.generateId(), taskId: current.taskId, sourceType: "model_quality_gate",
        sourceId: qualityEvidence.id, sourceDigest: input.evidenceDigest,
        sourceVersion: schemaVersion, classification: "internal",
        recordedBy: principal.subject, recordedAt: at,
      });
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorId: principal.subject, clientId: principal.clientId,
        actorType: "system", taskId: current.taskId,
        action: status === "failed" ? "model_run.fail" : "model_run.complete",
        resourceType: "model_run", resourceId: current.id,
        outcome: status === "failed" ? "failed" : "allowed",
        policyVersion: current.policyVersion, modelVersion: current.configurationVersion,
        correlationId: current.id, causationId: qualityEvidence.id,
        parametersDigest: current.inputDigest, attempt: current.generationRound,
        durationMs: input.latencyMs,
        ...(input.outputDigest === undefined ? { resultDigest: input.evidenceDigest } : { resultDigest: input.outputDigest }),
        ...("errorCode" in input ? { errorCode: input.errorCode } : {}),
        occurredAt: at,
      });
      return stateReceipt(next);
    });
  }

  private async authorizeReservation(
    session: DatabaseSession,
    input: ReserveModelRunCommand,
  ): Promise<AuthorizedReservation> {
    const task = await this.repository.findTaskForAgent(session, input.taskId, input.agentKind);
    if (task?.configurationRevisionId === undefined) {
      fail("TASK_AGENT_MISMATCH", "Task is not ready for this Agent");
    }
    const revision = await this.repository.findRevision(session, task.configurationRevisionId);
    if (revision === undefined || !["active", "superseded"].includes(revision.state)) {
      fail("CONFIGURATION_INVALID", "Pinned configuration is unavailable");
    }
    const agent = await this.repository.findAgentByKind(session, input.agentKind);
    if (agent === undefined || !agent.active) fail("AGENT_NOT_ACTIVE", "Agent is not active");
    const configuration = await this.repository.findModelConfiguration(
      session, revision.id, input.agentKind,
    );
    const approvedPrimary = approvedPrimaryModels[input.agentKind];
    if (
      configuration === undefined
      || configuration.primaryModel !== approvedPrimary
      || configuration.fallbackModels.length !== 1
      || configuration.fallbackModels[0] !== approvedFallbackModel
      || input.primaryModel !== approvedPrimary
      || input.fallbackModel !== approvedFallbackModel
    ) fail("MODEL_CONFIGURATION_MISMATCH", "Model pair does not match the approved configuration");
    const revokedAgent = await this.repository.findActiveRevocation(session, "agent", input.agentKind);
    const revokedPrimary = await this.repository.findActiveRevocation(session, "model", input.primaryModel);
    const revokedFallback = await this.repository.findActiveRevocation(session, "model", input.fallbackModel);
    if (revokedAgent !== undefined || revokedPrimary !== undefined || revokedFallback !== undefined) {
      fail("MODEL_EXECUTION_REVOKED", "Model execution is revoked");
    }
    const decision = await this.policy.evaluateInSession(session, {
      revisionId: revision.id,
      policyVersion: revision.version,
      actorType: "agent",
      agentKind: input.agentKind,
      resource: "model",
      action: "execute",
      purpose: "department_analysis",
      dataClassification: "internal",
    });
    if (decision.effect !== "ALLOW") fail("MODEL_POLICY_DENIED", "Model execution policy denied");
    return {
      revisionId: revision.id,
      revisionVersion: revision.version,
      policyVersion: decision.policyVersion,
      configuration,
    };
  }

  private async requireStoredConfiguration(
    session: DatabaseSession,
    run: ModelRun,
  ): Promise<ModelConfigurationRecord> {
    const configuration = await this.repository.findModelConfiguration(
      session, run.configurationRevisionId, run.agentKind,
    );
    if (
      configuration === undefined
      || configuration.primaryModel !== approvedPrimaryModels[run.agentKind]
      || configuration.fallbackModels.length !== 1
      || configuration.fallbackModels[0] !== approvedFallbackModel
      || run.requestedModel !== configuration.primaryModel
      || run.inputCostMicrosPerMillion !== configuration.inputCostMicrosPerMillion
      || run.outputCostMicrosPerMillion !== configuration.outputCostMicrosPerMillion
    ) fail("MODEL_CONFIGURATION_MISMATCH", "Stored model run configuration is invalid");
    return configuration;
  }

  private async requireExecutionActive(
    session: DatabaseSession,
    run: ModelRun,
    configuration: ModelConfigurationRecord,
  ): Promise<void> {
    const agent = await this.repository.findAgentByKind(session, run.agentKind);
    if (agent === undefined || !agent.active) fail("AGENT_NOT_ACTIVE", "Agent is not active");
    const revocations = await Promise.all([
      this.repository.findActiveRevocation(session, "agent", run.agentKind),
      this.repository.findActiveRevocation(session, "model", configuration.primaryModel),
      this.repository.findActiveRevocation(session, "model", configuration.fallbackModels[0]!),
    ]);
    if (revocations.some((revocation) => revocation !== undefined)) {
      fail("MODEL_EXECUTION_REVOKED", "Model execution is revoked");
    }
  }

  private async requireRun(session: DatabaseSession, runId: string): Promise<ModelRun> {
    const run = await this.repository.findModelRun(session, runId);
    if (run === undefined) fail("MODEL_RUN_NOT_FOUND", "Model run was not found");
    return run;
  }

  private async requireProvenance(
    session: DatabaseSession,
    taskId: string,
    provenanceIds: readonly string[],
  ): Promise<void> {
    const available = new Set((await this.repository.listProvenance(session, taskId)).map(({ id }) => id));
    if (provenanceIds.length === 0 || provenanceIds.some((id) => !available.has(id))) {
      fail("MODEL_PROVENANCE_INVALID", "Model result provenance is invalid");
    }
  }

  private async requireExactReplay(
    session: DatabaseSession,
    run: ModelRun,
    input: TerminalCommand,
    status: ModelRun["status"],
    actualCost: number,
  ): Promise<void> {
    const same = run.version === input.expectedVersion + 1
      && run.status === status
      && run.outputDigest === input.outputDigest
      && run.inputTokens === input.inputTokens
      && run.outputTokens === input.outputTokens
      && run.settledCostMicros === actualCost
      && run.providerRequestIdDigest === input.providerRequestIdDigest
      && run.latencyMs === input.latencyMs
      && run.statusCode === input.statusCode
      && run.errorCode === ("errorCode" in input ? input.errorCode : undefined)
      && sameStrings(run.qualityReasonCodes, input.qualityReasonCodes)
      && sameStrings(run.provenanceIds, input.provenanceIds);
    const evidence = await this.repository.findModelQualityEvidenceByIdempotencyKey(
      session, `${input.idempotencyKey}:quality`,
    );
    if (
      !same
      || evidence === undefined
      || evidence.modelRunId !== run.id
      || evidence.generationRound !== run.generationRound
      || evidence.outcome !== input.qualityOutcome
      || evidence.evidenceDigest !== input.evidenceDigest
      || !sameStrings(evidence.reasonCodes, input.qualityReasonCodes)
      || !sameStrings(evidence.provenanceIds, input.provenanceIds)
    ) fail("MODEL_RUN_CONFLICT", "Model run terminal replay conflicts with stored evidence");
  }
}

function reservationReceipt(
  run: ModelRun,
  configuration: ModelConfigurationRecord,
): ModelRunReservationReceipt {
  return {
    runId: run.id,
    primaryModel: configuration.primaryModel,
    fallbackModel: configuration.fallbackModels[0]!,
    maxInputTokens: configuration.maxInputTokens,
    maxOutputTokens: configuration.maxOutputTokens,
    timeoutMs: configuration.timeoutMs,
    schemaVersion,
    inputCostMicrosPerMillion: run.inputCostMicrosPerMillion,
    outputCostMicrosPerMillion: run.outputCostMicrosPerMillion,
    maxReservedCostMicros: run.maxReservedCostMicros,
    version: run.version,
  };
}

function stateReceipt(run: ModelRun): ModelRunStateReceipt {
  return {
    runId: run.id,
    status: run.status as ModelRunStateReceipt["status"],
    version: run.version,
    ...(run.settledCostMicros === undefined ? {} : { settledCostMicros: run.settledCostMicros }),
  };
}

function assertQualityOutcome(input: TerminalCommand): void {
  const valid = "status" in input
    ? (input.status === "completed" && input.qualityOutcome === "accepted")
      || (input.status === "partial" && input.qualityOutcome === "partial")
      || (input.status === "escalated" && input.qualityOutcome === "escalate")
    : input.qualityOutcome === "correct" || input.qualityOutcome === "escalate";
  if (!valid) fail("MODEL_QUALITY_OUTCOME_INVALID", "Quality outcome does not match terminal status");
}

function requireWorker(principal: WorkloadPrincipal): void {
  if (principal.workload !== "agentic_worker" || principal.clientId !== workerClientId) {
    fail("FORBIDDEN", "Agentic worker identity is required");
  }
}

function isTerminal(run: ModelRun): boolean {
  return run.status === "completed" || run.status === "failed"
    || run.status === "partial" || run.status === "escalated";
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function fail(code: string, message: string): never {
  throw new AgenticApplicationError(code, message);
}
