// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { PolicyDecision } from "../../../domain/entities/governance-records";
import { AgenticApplicationError } from "../agentic-application.error";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";
import type {
  ToolAuthorizationRequest,
  ToolInvocation,
  ToolRegistry,
  ToolResult,
} from "../interfaces/tool-registry";

type ToolRepository = Pick<AgenticRepository,
  | "findAgentByClientId" | "findTaskForAgent" | "findRevision" | "findTool"
  | "findToolGrant" | "findActiveRevocation" | "findApproval" | "reserveBudget"
  | "appendAudit" | "appendProvenance" | "countToolInvocations">;

interface AuthorizationContext {
  readonly decision: PolicyDecision;
  readonly revisionId: string;
  readonly policyVersion: number;
}

export class ToolRegistryService implements ToolRegistry {
  constructor(
    private readonly repository: ToolRepository,
    private readonly policy: PolicyEvaluator,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async authorize(request: ToolAuthorizationRequest): Promise<PolicyDecision> {
    return this.transactions.runReadOnly(async (session) =>
      (await this.authorizeInSession(session, request)).decision);
  }

  async invoke<TOutput>(request: ToolInvocation): Promise<ToolResult<TOutput>> {
    const result = await this.transactions.run(async (session) => {
      let context: AuthorizationContext;
      try {
        context = await this.authorizeInSession(session, request);
      } catch (error) {
        const applicationError = normalizeError(error);
        await this.audit(session, request, "denied");
        return applicationError;
      }
      const reserved = await this.repository.reserveBudget(session, {
        id: this.generateId(), revisionId: context.revisionId,
        agentKind: request.principal.agentKind, taskId: request.taskId,
        idempotencyKey: request.idempotencyKey, costMicros: request.costMicros,
        occurredAt: this.now(),
      });
      if (reserved === "exceeded") {
        await this.audit(session, request, "denied", context.policyVersion);
        return new AgenticApplicationError("BUDGET_EXCEEDED", "Budget limit exceeded");
      }
      if (reserved === "duplicate") {
        return new AgenticApplicationError("TOOL_UNAVAILABLE", "No tool adapter is available in Phase A");
      }
      await this.repository.appendProvenance(session, {
        id: this.generateId(), taskId: request.taskId, sourceType: "tool_input",
        sourceId: `${request.toolName}@${request.toolVersion}`,
        sourceDigest: request.parametersDigest, classification: request.dataClassification,
        recordedBy: request.principal.subject, recordedAt: this.now(),
      });
      await this.audit(session, request, "allowed", context.policyVersion);
      return new AgenticApplicationError("TOOL_UNAVAILABLE", "No tool adapter is available in Phase A");
    });
    throw result;
  }

  private async authorizeInSession(
    session: DatabaseSession,
    request: ToolAuthorizationRequest,
  ): Promise<AuthorizationContext> {
    assertInvocation(request);
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
    if (tool.inputSchemaDigest !== request.inputSchemaDigest) {
      fail("TOOL_INPUT_INVALID", "Tool input schema does not match");
    }
    const grant = await this.repository.findToolGrant(
      session, revision.id, request.principal.agentKind, request.toolName, request.toolVersion,
    );
    if (grant === undefined) fail("TOOL_GRANT_MISSING", "Tool grant is unavailable");
    if (grant.purpose !== request.purpose || grant.dataScope !== request.dataScope) {
      fail("TOOL_SCOPE_DENIED", "Tool scope does not match the grant");
    }
    const invocationCount = await this.repository.countToolInvocations(
      session, request.taskId, request.principal.subject,
      `${request.toolName}@${request.toolVersion}`,
    );
    if (invocationCount >= grant.maxInvocations) {
      fail("TOOL_GRANT_EXHAUSTED", "Tool invocation limit has been reached");
    }
    const revoked = await this.repository.findActiveRevocation(session, "tool_grant", grant.id);
    if (revoked !== undefined) fail("POLICY_DENIED", "Tool grant has been revoked");

    const decision = await this.policy.evaluateInSession(session, {
      revisionId: revision.id, policyVersion: revision.version, actorType: "agent",
      agentKind: request.principal.agentKind,
      ...(request.department === undefined ? {} : { department: request.department }),
      resource: request.toolName, action: "invoke", purpose: request.purpose,
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
      id: this.generateId(), actorId: request.principal.subject, actorType: "agent",
      taskId: request.taskId, action: "tool.invoke", resourceType: "tool",
      resourceId: `${request.toolName}@${request.toolVersion}`, outcome,
      ...(policyVersion === undefined ? {} : { policyVersion }),
      toolVersion: request.toolVersion, correlationId: request.correlationId,
      occurredAt: this.now(),
    });
  }
}

function assertInvocation(request: ToolAuthorizationRequest): void {
  if (
    !Number.isSafeInteger(request.toolVersion) || request.toolVersion <= 0
    || !Number.isSafeInteger(request.costMicros) || request.costMicros <= 0
    || !isDigest(request.inputSchemaDigest) || !isDigest(request.parametersDigest)
  ) fail("TOOL_INPUT_INVALID", "Tool invocation input is invalid");
}

function isDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function normalizeError(error: unknown): AgenticApplicationError {
  return error instanceof AgenticApplicationError
    ? error
    : new AgenticApplicationError("TOOL_UNAVAILABLE", "Tool authorization failed");
}

function fail(code: string, message: string): never {
  throw new AgenticApplicationError(code, message);
}
