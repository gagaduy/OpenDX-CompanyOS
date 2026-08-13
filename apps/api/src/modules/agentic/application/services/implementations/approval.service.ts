// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { ApprovalRequest } from "../../../domain/entities/approval-request";
import { decideApproval as transitionApproval } from "../../../domain/services/agent-governance-rules";
import { AgenticApplicationError } from "../agentic-application.error";
import type { ApprovalDecisionInput, ApprovalPage, ApprovalQuery, ApprovalService } from "../interfaces/approval.service";

type ApprovalRepository = Pick<AgenticRepository, "findApproval" | "listApprovals" | "decideApproval" | "appendAudit">;

export class ApprovalServiceImpl implements ApprovalService {
  constructor(
    private readonly repository: ApprovalRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
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
    if (!canApprove(principal)) fail("FORBIDDEN", "Approval role is required");
    return this.transactions.run(async (session) => {
      const current = await this.requireApproval(session, input.approvalId);
      if (!isWithinScope(current, principal)) fail("FORBIDDEN", "Approval is outside the caller scope");
      if (current.version !== input.expectedVersion) fail("STALE_VERSION", "Approval version is stale");
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
      return next;
    });
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
    ? ["tool_invocation", "emergency_revocation"]
    : [];
}
function isWithinScope(approval: ApprovalRequest, principal: StaffPrincipal): boolean {
  return principal.roles.includes("administrator") || assignedScopes(principal).includes(approval.approverScope);
}
function fail(code: string, message: string): never { throw new AgenticApplicationError(code, message); }
