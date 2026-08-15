// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type {
  AgenticRepository,
  ToolInvocationReservationResult,
} from "../../repositories/interfaces/agentic.repository";
import type {
  DepartmentAgentKind,
  DepartmentToolDescriptor,
  DepartmentToolName,
} from "../../tools/department-tool-contracts";
import { findDepartmentToolDescriptor } from "../../tools/department-tool-catalog";
import type { PolicyDecision } from "../../../domain/entities/governance-records";
import { AgenticApplicationError } from "../agentic-application.error";
import type { DepartmentToolAdapterRegistry } from "../interfaces/department-tool-adapter";
import type { DepartmentToolSchemaRegistry } from "../interfaces/department-tool-schema-registry";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";
import type {
  ToolAuthorizationRequest,
  ToolInvocation,
  ToolRegistry,
  ToolResult,
} from "../interfaces/tool-registry";

type ToolRepository = Pick<AgenticRepository,
  | "findAgentByClientId" | "findTaskForAgent" | "findRevision" | "findTool"
  | "findToolGrant" | "findModelConfiguration" | "findActiveRevocation" | "findApproval"
  | "reserveBudget" | "reserveToolInvocation" | "completeToolInvocation" | "failToolInvocation"
  | "appendAudit" | "appendProvenance" | "countToolInvocations">;

interface AuthorizationContext {
  readonly decision: PolicyDecision;
  readonly revisionId: string;
  readonly policyVersion: number;
}

interface PreparedInvocation {
  readonly request: ToolInvocation;
  readonly descriptor: DepartmentToolDescriptor;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly parametersDigest: string;
  readonly authorization: ToolAuthorizationRequest;
}

type ReservationOutcome =
  | { readonly kind: "error"; readonly error: AgenticApplicationError }
  | { readonly kind: "receipt"; readonly receipt: ToolInvocationReservationResult };

export class ToolRegistryService implements ToolRegistry {
  constructor(
    private readonly repository: ToolRepository,
    private readonly policy: PolicyEvaluator,
    private readonly transactions: TransactionRunner,
    private readonly adapters: DepartmentToolAdapterRegistry,
    private readonly schemas: DepartmentToolSchemaRegistry,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async authorize(request: ToolAuthorizationRequest): Promise<PolicyDecision> {
    return this.transactions.runReadOnly(async (session) =>
      (await this.authorizeInSession(session, request)).decision);
  }

  async invoke<TOutput>(request: ToolInvocation): Promise<ToolResult<TOutput>> {
    const prepared = this.prepare(request);
    const reserved = await this.reserve(prepared);
    if (reserved.kind === "error") throw reserved.error;
    const receipt = reserved.receipt;
    if (receipt.kind === "completed") {
      const output = this.schemas.parseOutput(
        prepared.descriptor.name,
        prepared.descriptor.version,
        receipt.result,
      ) as TOutput;
      return { output, provenanceIds: provenanceIds(output) };
    }
    if (receipt.kind === "in_progress") {
      fail("TOOL_INVOCATION_IN_PROGRESS", "Tool invocation is already in progress");
    }
    if (receipt.kind === "failed") {
      fail(receipt.errorCode, "Tool invocation previously failed");
    }
    if (receipt.kind === "conflict") {
      fail("TOOL_INPUT_INVALID", "Idempotency key conflicts with another invocation");
    }

    try {
      const adapter = this.adapters.resolve(prepared.descriptor.name, prepared.descriptor.version);
      const output = await adapter.execute({
        invocationId: receipt.invocationId,
        taskId: request.taskId,
        agentKind: request.principal.agentKind,
        attempt: receipt.attempt,
        correlationId: request.correlationId,
        causationId: request.causationId,
      }, prepared.parameters);
      const parsed = this.schemas.parseOutput(
        prepared.descriptor.name,
        prepared.descriptor.version,
        output,
      );
      assertFreshResult(parsed, this.now());
      assertResultSize(parsed);
      const resultDigest = digestJson(parsed);
      await this.complete(prepared, receipt.invocationId, receipt.attempt, parsed, resultDigest);
      return { output: parsed as TOutput, provenanceIds: provenanceIds(parsed) };
    } catch (error) {
      const normalized = normalizeExecutionError(error);
      await this.transactions.run((session) => this.repository.failToolInvocation(session, {
        invocationId: receipt.invocationId,
        attempt: receipt.attempt,
        errorCode: normalized.code,
        retryable: normalized.retryable,
        occurredAt: this.now(),
      }));
      throw normalized;
    }
  }

  private prepare(request: ToolInvocation): PreparedInvocation {
    const descriptor = findDepartmentToolDescriptor(request.toolName, request.toolVersion);
    if (descriptor === undefined) fail("TOOL_NOT_FOUND", "Tool version is unavailable");
    if (
      descriptor.agentKind !== request.principal.agentKind
      || descriptor.purpose !== request.purpose
      || descriptor.dataScope !== request.dataScope
      || descriptor.classification !== request.dataClassification
    ) fail("TOOL_SCOPE_DENIED", "Tool request does not match its immutable descriptor");
    const parameters = this.schemas.parseInput(
      descriptor.name,
      descriptor.version,
      request.parameters,
    );
    const parametersDigest = digestJson(parameters);
    return {
      request,
      descriptor,
      parameters,
      parametersDigest,
      authorization: {
        principal: request.principal,
        taskId: request.taskId,
        toolName: descriptor.name,
        toolVersion: descriptor.version,
        modelId: request.modelId,
        purpose: descriptor.purpose,
        dataScope: descriptor.dataScope,
        dataClassification: descriptor.classification,
        inputSchemaDigest: descriptor.inputSchemaDigest,
        parametersDigest,
        costMicros: descriptor.executionCostMicros,
        idempotencyKey: request.idempotencyKey,
        correlationId: request.correlationId,
        ...(request.approvalId === undefined ? {} : { approvalId: request.approvalId }),
      },
    };
  }

  private async reserve(prepared: PreparedInvocation): Promise<ReservationOutcome> {
    return this.transactions.run(async (session) => {
      let context: AuthorizationContext;
      try {
        context = await this.authorizeInSession(
          session,
          prepared.authorization,
          prepared.descriptor,
        );
      } catch (error) {
        const applicationError = normalizeAuthorizationError(error);
        await this.audit(session, prepared.authorization, "denied");
        return { kind: "error", error: applicationError };
      }
      const budget = await this.repository.reserveBudget(session, {
        id: this.generateId(),
        revisionId: context.revisionId,
        agentKind: prepared.request.principal.agentKind,
        taskId: prepared.request.taskId,
        idempotencyKey: prepared.request.idempotencyKey,
        costMicros: prepared.descriptor.executionCostMicros,
        occurredAt: this.now(),
      });
      if (budget === "exceeded") {
        await this.audit(session, prepared.authorization, "denied", context.policyVersion);
        return {
          kind: "error",
          error: new AgenticApplicationError("BUDGET_EXCEEDED", "Budget limit exceeded"),
        };
      }
      const receipt = await this.repository.reserveToolInvocation(session, {
        id: this.generateId(),
        taskId: prepared.request.taskId,
        agentKind: prepared.request.principal.agentKind,
        toolName: prepared.descriptor.name,
        toolVersion: prepared.descriptor.version,
        idempotencyKey: prepared.request.idempotencyKey,
        parametersDigest: prepared.parametersDigest,
        correlationId: prepared.request.correlationId,
        causationId: prepared.request.causationId,
        occurredAt: this.now(),
      });
      if (receipt.kind === "reserved") {
        await this.repository.appendProvenance(session, {
          id: this.generateId(),
          taskId: prepared.request.taskId,
          sourceType: "tool_input",
          sourceId: `${prepared.descriptor.name}@${prepared.descriptor.version}`,
          sourceDigest: prepared.parametersDigest,
          classification: prepared.descriptor.classification,
          recordedBy: prepared.request.principal.subject,
          recordedAt: this.now(),
        });
      }
      await this.audit(session, prepared.authorization, "allowed", context.policyVersion);
      return { kind: "receipt", receipt };
    });
  }

  private async complete(
    prepared: PreparedInvocation,
    invocationId: string,
    attempt: number,
    output: unknown,
    resultDigest: string,
  ): Promise<void> {
    await this.transactions.run(async (session) => {
      const completed = await this.repository.completeToolInvocation(session, {
        invocationId,
        attempt,
        safeResult: output,
        resultDigest,
        occurredAt: this.now(),
      });
      if (!completed) {
        fail("TOOL_INVOCATION_IN_PROGRESS", "Tool invocation completion was not accepted");
      }
      const result = output as {
        readonly source: string;
        readonly provenanceId: string;
      };
      await this.repository.appendProvenance(session, {
        id: result.provenanceId,
        taskId: prepared.request.taskId,
        sourceType: "tool_result",
        sourceId: result.source,
        sourceDigest: resultDigest,
        classification: prepared.descriptor.classification,
        recordedBy: prepared.request.principal.subject,
        recordedAt: this.now(),
      });
    });
  }

  private async authorizeInSession(
    session: DatabaseSession,
    request: ToolAuthorizationRequest,
    descriptor?: DepartmentToolDescriptor,
  ): Promise<AuthorizationContext> {
    assertAuthorization(request);
    const agent = await this.repository.findAgentByClientId(session, request.principal.clientId);
    if (
      agent === undefined || !agent.active || agent.kind !== request.principal.agentKind
      || agent.keycloakClientId !== request.principal.clientId
    ) fail("AGENT_NOT_ACTIVE", "Agent identity is not active");

    const task = await this.repository.findTaskForAgent(
      session, request.taskId, request.principal.agentKind,
    );
    if (task === undefined || task.configurationRevisionId === undefined) {
      fail("TASK_AGENT_MISMATCH", "Task is not ready for this Agent");
    }
    const revision = await this.repository.findRevision(session, task.configurationRevisionId);
    if (revision === undefined || !["active", "superseded"].includes(revision.state)) {
      fail("CONFIGURATION_INVALID", "Pinned configuration is unavailable");
    }
    const tool = await this.repository.findTool(session, request.toolName, request.toolVersion);
    if (tool === undefined || !tool.active) fail("TOOL_NOT_FOUND", "Tool is unavailable");
    if (
      tool.inputSchemaDigest !== request.inputSchemaDigest
      || (descriptor !== undefined && (
        tool.outputSchemaDigest !== descriptor.outputSchemaDigest
        || tool.executionCostMicros !== descriptor.executionCostMicros
        || tool.maximumAttempts !== descriptor.maximumAttempts
      ))
    ) fail("TOOL_INPUT_INVALID", "Tool descriptor does not match runtime schemas");
    const grant = await this.repository.findToolGrant(
      session, revision.id, request.principal.agentKind, request.toolName, request.toolVersion,
    );
    if (grant === undefined) fail("TOOL_GRANT_MISSING", "Tool grant is unavailable");
    if (grant.purpose !== request.purpose || grant.dataScope !== request.dataScope) {
      fail("TOOL_SCOPE_DENIED", "Tool scope does not match the grant");
    }
    const model = await this.repository.findModelConfiguration(
      session, revision.id, request.principal.agentKind,
    );
    if (model === undefined || ![model.primaryModel, ...model.fallbackModels].includes(request.modelId)) {
      fail("CONFIGURATION_INVALID", "Model is not approved by the pinned configuration");
    }
    const invocationCount = await this.repository.countToolInvocations(
      session,
      request.taskId,
      descriptor?.agentKind ?? request.principal.agentKind as DepartmentAgentKind,
      descriptor?.name ?? request.toolName as DepartmentToolName,
      descriptor?.version ?? request.toolVersion as 1,
      request.idempotencyKey,
    );
    if (invocationCount >= grant.maxInvocations) {
      fail("TOOL_GRANT_EXHAUSTED", "Tool invocation limit has been reached");
    }
    const revoked = await this.repository.findActiveRevocation(session, "tool_grant", grant.id);
    if (revoked !== undefined) fail("POLICY_DENIED", "Tool grant has been revoked");
    const revokedModel = await this.repository.findActiveRevocation(session, "model", request.modelId);
    if (revokedModel !== undefined) fail("POLICY_DENIED", "Model has been revoked");

    const decision = await this.policy.evaluateInSession(session, {
      revisionId: revision.id,
      policyVersion: revision.version,
      actorType: "agent",
      agentKind: request.principal.agentKind,
      ...(request.department === undefined ? {} : { department: request.department }),
      resource: request.toolName,
      action: "invoke",
      purpose: request.purpose,
      dataClassification: request.dataClassification,
    });
    if (decision.effect === "DENY") fail("POLICY_DENIED", "Policy denied the invocation");
    if (decision.effect === "REQUIRE_APPROVAL") {
      await this.assertApproval(session, request, revision.id, revision.version);
    }
    return { decision, revisionId: revision.id, policyVersion: revision.version };
  }

  private async assertApproval(
    session: DatabaseSession,
    request: ToolAuthorizationRequest,
    revisionId: string,
    policyVersion: number,
  ): Promise<void> {
    if (request.approvalId === undefined) fail("APPROVAL_REQUIRED", "Approval is required");
    const approval = await this.repository.findApproval(session, request.approvalId);
    if (
      approval === undefined || approval.state !== "approved"
      || approval.approverScope !== "tool_invocation"
      || approval.action !== "tool.invoke" || approval.resourceType !== "tool"
      || approval.resourceId !== `${request.toolName}@${request.toolVersion}`
      || approval.parametersDigest !== request.parametersDigest
      || approval.taskId !== request.taskId || approval.policyVersion !== policyVersion
      || approval.configurationRevisionId !== revisionId
      || Date.parse(this.now()) >= Date.parse(approval.expiresAt)
    ) fail("APPROVAL_REQUIRED", "Approval evidence does not match this invocation");
  }

  private async audit(
    session: DatabaseSession,
    request: ToolAuthorizationRequest,
    outcome: "allowed" | "denied",
    policyVersion?: number,
  ): Promise<void> {
    await this.repository.appendAudit(session, {
      id: this.generateId(),
      actorId: request.principal.subject,
      actorType: "agent",
      taskId: request.taskId,
      action: "tool.invoke",
      resourceType: "tool",
      resourceId: `${request.toolName}@${request.toolVersion}`,
      outcome,
      ...(policyVersion === undefined ? {} : { policyVersion }),
      toolVersion: request.toolVersion,
      correlationId: request.correlationId,
      occurredAt: this.now(),
    });
  }
}

function assertAuthorization(request: ToolAuthorizationRequest): void {
  if (
    !Number.isSafeInteger(request.toolVersion) || request.toolVersion <= 0
    || !Number.isSafeInteger(request.costMicros) || request.costMicros <= 0
    || !isDigest(request.inputSchemaDigest) || !isDigest(request.parametersDigest)
  ) fail("TOOL_INPUT_INVALID", "Tool invocation input is invalid");
}

function assertFreshResult(value: unknown, now: string): void {
  const result = value as {
    readonly retrievedAt?: unknown;
    readonly freshness?: { readonly asOf?: unknown; readonly maxAgeSeconds?: unknown };
  };
  const nowMs = Date.parse(now);
  const retrievedAt = typeof result.retrievedAt === "string" ? Date.parse(result.retrievedAt) : Number.NaN;
  const asOf = typeof result.freshness?.asOf === "string"
    ? Date.parse(result.freshness.asOf)
    : Number.NaN;
  const maximumAge = result.freshness?.maxAgeSeconds === 60 ? 60_000 : 0;
  if (
    !Number.isFinite(nowMs) || !Number.isFinite(retrievedAt) || !Number.isFinite(asOf)
    || maximumAge === 0 || nowMs - retrievedAt > maximumAge || nowMs - asOf > maximumAge
    || retrievedAt > nowMs + maximumAge || asOf > nowMs + maximumAge
  ) fail("TOOL_RESULT_STALE", "Tool result is outside its freshness bound");
}

function assertResultSize(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > 262_144) {
    fail("TOOL_RESULT_TOO_LARGE", "Tool result exceeds the safe receipt limit");
  }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      (key) => `${JSON.stringify(key)}:${stableJson(record[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function provenanceIds(value: unknown): readonly string[] {
  const provenanceId = (value as { readonly provenanceId?: unknown })?.provenanceId;
  return typeof provenanceId === "string" ? [provenanceId] : [];
}

function isDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function normalizeAuthorizationError(error: unknown): AgenticApplicationError {
  return error instanceof AgenticApplicationError
    ? error
    : new AgenticApplicationError("TOOL_SOURCE_UNAVAILABLE", "Tool authorization failed", true);
}

function normalizeExecutionError(error: unknown): AgenticApplicationError {
  if (error instanceof AgenticApplicationError) {
    const retryable = error.retryable
      || error.code === "TOOL_QUERY_TIMEOUT"
      || error.code === "TOOL_SOURCE_UNAVAILABLE";
    return retryable === error.retryable
      ? error
      : new AgenticApplicationError(error.code, error.message, retryable);
  }
  return new AgenticApplicationError(
    "TOOL_SOURCE_UNAVAILABLE",
    "Tool source is unavailable",
    true,
  );
}

function fail(code: string, message: string): never {
  throw new AgenticApplicationError(code, message);
}
