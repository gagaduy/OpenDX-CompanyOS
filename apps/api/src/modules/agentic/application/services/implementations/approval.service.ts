// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { ApprovalRequest } from "../../../domain/entities/approval-request";
import type { WorkflowSignalReceipt } from "../../../domain/entities/workflow-run";
import { decideApproval as transitionApproval } from "../../../domain/services/agent-governance-rules";
import { AgenticApplicationError } from "../agentic-application.error";
import type { ApprovalDecisionInput, ApprovalDecisionResult, ApprovalPage, ApprovalQuery, ApprovalService } from "../interfaces/approval.service";

type ApprovalRepository = Pick<AgenticRepository,
  | "findApproval" | "listApprovals" | "decideApproval" | "appendAudit"
  | "findWorkflowRun" | "findTaskById" | "createWorkflowSignalReceipt">;

export interface WorkflowSignalDispatcher {
  dispatchOnce(): Promise<void>;
}

export class ApprovalServiceImpl implements ApprovalService {
  constructor(
    private readonly repository: ApprovalRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
    private readonly workflowSignals?: WorkflowSignalDispatcher,
    private readonly onDispatchError: (error: unknown) => void = () => undefined,
  ) {}

  async list(query: ApprovalQuery, principal: StaffPrincipal): Promise<ApprovalPage> {
    if (!canApprove(principal) && !principal.roles.includes("agentic_operator") && !principal.roles.includes("agentic_governance_admin")) {
      fail("FORBIDDEN", "Approval access is not permitted");
    }
    const filter = principal.roles.includes("administrator")
      ? undefined
      : canApprove(principal)
        ? { approverScopes: assignedScopes(principal) }
        : { requesterId: principal.subject };
    return this.transactions.runReadOnly((session) =>
      this.repository.listApprovals(session, query.page, query.pageSize, filter));
  }

  async get(id: string, principal: StaffPrincipal): Promise<ApprovalRequest> {
    if (!canApprove(principal) && !principal.roles.includes("agentic_operator") && !principal.roles.includes("agentic_governance_admin")) {
      fail("FORBIDDEN", "Approval access is not permitted");
    }
    return this.transactions.runReadOnly(async (session) => {
      const approval = await this.requireApproval(session, id);
      if (!canApprove(principal) && approval.requesterId !== principal.subject) fail("FORBIDDEN", "Approval is outside the caller scope");
      if (canApprove(principal) && !isWithinScope(approval, principal)) fail("FORBIDDEN", "Approval is outside the caller scope");
      return approval;
    });
  }

  async decide(input: ApprovalDecisionInput, principal: StaffPrincipal): Promise<ApprovalRequest> {
    return (await this.decideCommand(input, principal)).approval;
  }

  async decideCommand(
    input: ApprovalDecisionInput,
    principal: StaffPrincipal,
  ): Promise<ApprovalDecisionResult> {
    if (!canApprove(principal)) fail("FORBIDDEN", "Approval role is required");
    const result = await this.transactions.run(async (session) => {
      const current = await this.requireApproval(session, input.approvalId);
      if (!isWithinScope(current, principal)) fail("FORBIDDEN", "Approval is outside the caller scope");
      if (current.version !== input.expectedVersion) {
        const requestedState = input.decision === "approved" ? "approved" : "rejected";
        if (
          current.version === input.expectedVersion + 1
          && current.state === requestedState
          && current.decidedBy === principal.subject
          && current.decisionReason === input.reason.trim()
        ) {
          return {
            approval: current,
            signalCreated: current.approverScope === "workflow_execution",
            disposition: "replayed" as const,
          };
        }
        if (current.state === "approved" || current.state === "rejected") {
          fail("APPROVAL_DECISION_CONFLICT", "Approval already has a different decision");
        }
        fail("STALE_VERSION", "Approval version is stale");
      }
      const at = this.now();
      const next = transitionApproval(current, {
        decidedBy: principal.subject, decision: input.decision, reason: input.reason, now: at,
      });
      if (!await this.repository.decideApproval(session, current.id, input.expectedVersion, input.decision, principal.subject, input.reason.trim(), at)) {
        fail("STALE_VERSION", "Approval decision is stale");
      }
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorId: principal.subject, actorType: "staff",
        action: "approval.decide", resourceType: "approval_request", resourceId: current.id,
        outcome: "allowed", correlationId: current.id, occurredAt: at,
      });
      const signalCreated = await this.createWorkflowReceipt(session, current, next, at);
      return { approval: next, signalCreated, disposition: "accepted" as const };
    });
    if (result.signalCreated && this.workflowSignals !== undefined) {
      await this.workflowSignals.dispatchOnce().catch(this.onDispatchError);
    }
    return {
      approval: result.approval,
      disposition: result.disposition,
      workflowSignal: result.signalCreated,
    };
  }

  private async createWorkflowReceipt(
    session: DatabaseSession,
    current: ApprovalRequest,
    next: ApprovalRequest,
    at: string,
  ): Promise<boolean> {
    if (current.approverScope !== "workflow_execution") return false;
    const run = await this.repository.findWorkflowRun(session, current.resourceId);
    const task = run === undefined
      ? undefined
      : await this.repository.findTaskById(session, run.taskId);
    if (
      run === undefined
      || task === undefined
      || current.requesterId !== "system:workflow"
      || current.action !== "agentic.workflow.complete"
      || current.resourceType !== "workflow_run"
      || current.taskId !== run.taskId
      || current.workflowVersion !== run.workflowVersion
      || task.version !== run.planRevision
      || task.configurationRevisionId !== current.configurationRevisionId
      || current.parametersDigest !== workflowApprovalDigest({
        taskId: run.taskId,
        workflowRunId: run.id,
        workflowVersion: run.workflowVersion,
        planRevision: run.planRevision,
        configurationRevisionId: current.configurationRevisionId,
        policyVersion: current.policyVersion,
        action: current.action,
      })
    ) fail("APPROVAL_BINDING_INVALID", "Workflow approval binding is invalid");
    const receiptId = this.generateId();
    const receipt: WorkflowSignalReceipt = {
      id: receiptId,
      workflowRunId: run.id,
      signalKind: "approval",
      idempotencyKey: receiptId,
      approvalId: current.id,
      payloadDigest: current.parametersDigest,
      decision: next.state === "approved" ? "approved" : "rejected",
      applicationDecisionVersion: next.version,
      deliveryState: "pending",
      createdAt: at,
    };
    const stored = await this.repository.createWorkflowSignalReceipt(session, receipt);
    if (stored.status === "conflict") {
      fail("WORKFLOW_SIGNAL_CONFLICT", "Workflow approval signal conflicts with stored evidence");
    }
    return stored.status === "created";
  }

  private async requireApproval(session: DatabaseSession, id: string): Promise<ApprovalRequest> {
    const approval = await this.repository.findApproval(session, id);
    if (approval === undefined) fail("APPROVAL_NOT_FOUND", "Approval was not found");
    return approval;
  }
}

function canApprove(principal: StaffPrincipal): boolean {
  return principal.roles.includes("administrator") || principal.roles.includes("agentic_approver");
}
function assignedScopes(principal: StaffPrincipal): readonly ApprovalRequest["approverScope"][] {
  return principal.roles.includes("agentic_approver")
    ? ["tool_invocation", "emergency_revocation", "workflow_execution"]
    : [];
}
function isWithinScope(approval: ApprovalRequest, principal: StaffPrincipal): boolean {
  return principal.roles.includes("administrator") || assignedScopes(principal).includes(approval.approverScope);
}
function workflowApprovalDigest(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function fail(code: string, message: string): never { throw new AgenticApplicationError(code, message); }
