// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository, RevocationRecord } from "../../repositories/interfaces/agentic.repository";
import type { ApprovalRequest } from "../../../domain/entities/approval-request";
import { AgenticApplicationError } from "../agentic-application.error";

export interface EmergencyRevocationInput {
  readonly targetType: RevocationRecord["targetType"];
  readonly targetId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly approvalId?: string;
}
export type EmergencyRevocationResult =
  | { readonly kind: "revocation"; readonly status: "created" | "duplicate"; readonly revocation: RevocationRecord }
  | ({ readonly kind: "approval" } & ApprovalRequest);

type RevocationRepository = Pick<AgenticRepository,
  "createRevocation" | "createApproval" | "appendAudit" | "findActiveRevision" | "findApproval">;

export class EmergencyRevocationService {
  constructor(
    private readonly repository: RevocationRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async request(input: EmergencyRevocationInput, principal: StaffPrincipal): Promise<EmergencyRevocationResult> {
    if (input.targetId.trim().length === 0 || input.reason.trim().length === 0 || input.idempotencyKey.trim().length === 0) {
      fail("CONFIGURATION_INVALID", "Revocation input is invalid");
    }
    if (principal.roles.includes("administrator")) return this.activate(input, principal);
    if (!principal.roles.includes("agentic_governance_admin")) fail("FORBIDDEN", "Revocation permission is required");
    if (input.approvalId !== undefined) return this.activateApproved(input, principal);
    return this.requestApproval(input, principal);
  }

  private async activate(input: EmergencyRevocationInput, principal: StaffPrincipal): Promise<EmergencyRevocationResult> {
    return this.transactions.run(async (session) => {
      const at = this.now();
      const revocation: RevocationRecord = {
        id: this.generateId(), targetType: input.targetType, targetId: input.targetId,
        reason: input.reason.trim(), activatedBy: principal.subject, activatedAt: at,
        idempotencyKey: input.idempotencyKey,
        ...(input.approvalId === undefined ? {} : { approvalId: input.approvalId }),
      };
      const status = await this.repository.createRevocation(session, revocation);
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorId: principal.subject, actorType: "staff",
        action: "revocation.activate", resourceType: input.targetType,
        resourceId: input.targetId, outcome: "allowed", correlationId: input.correlationId,
        occurredAt: at,
      });
      return { kind: "revocation", status, revocation };
    });
  }

  private async activateApproved(input: EmergencyRevocationInput, principal: StaffPrincipal): Promise<EmergencyRevocationResult> {
    return this.transactions.run(async (session) => {
      const approval = await this.repository.findApproval(session, input.approvalId!);
      if (
        approval === undefined || approval.state !== "approved"
        || approval.requesterId !== principal.subject || approval.action !== "revocation.create"
        || approval.resourceType !== input.targetType || approval.resourceId !== input.targetId
        || approval.parametersDigest !== parametersDigest(input)
        || Date.parse(this.now()) >= Date.parse(approval.expiresAt)
      ) fail("APPROVAL_REQUIRED", "Approval evidence does not match the revocation");
      const at = this.now();
      const revocation: RevocationRecord = {
        id: this.generateId(), targetType: input.targetType, targetId: input.targetId,
        reason: input.reason.trim(), activatedBy: principal.subject, activatedAt: at,
        approvalId: approval.id, idempotencyKey: input.idempotencyKey,
      };
      const status = await this.repository.createRevocation(session, revocation);
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorId: principal.subject, actorType: "staff",
        action: "revocation.activate-approved", resourceType: input.targetType,
        resourceId: input.targetId, outcome: "allowed", correlationId: input.correlationId,
        occurredAt: at,
      });
      return { kind: "revocation", status, revocation };
    });
  }

  private async requestApproval(input: EmergencyRevocationInput, principal: StaffPrincipal): Promise<EmergencyRevocationResult> {
    return this.transactions.run(async (session) => {
      const active = await this.repository.findActiveRevision(session);
      if (active === undefined) fail("NO_ACTIVE_CONFIGURATION", "No active configuration exists");
      const at = this.now();
      const approval: ApprovalRequest = {
        id: this.generateId(), state: "pending", requesterId: principal.subject,
        action: "revocation.create", resourceType: input.targetType, resourceId: input.targetId,
        parametersDigest: parametersDigest(input),
        policyVersion: active.version, configurationRevisionId: active.id,
        expiresAt: new Date(Date.parse(at) + 60 * 60 * 1000).toISOString(),
        version: 1, createdAt: at,
      };
      await this.repository.createApproval(session, approval);
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorId: principal.subject, actorType: "staff",
        action: "revocation.request", resourceType: input.targetType,
        resourceId: input.targetId, outcome: "allowed", correlationId: input.correlationId,
        occurredAt: at,
      });
      return { kind: "approval", ...approval };
    });
  }
}

function fail(code: string, message: string): never { throw new AgenticApplicationError(code, message); }

function parametersDigest(input: EmergencyRevocationInput): string {
  return createHash("sha256").update(JSON.stringify({
    targetType: input.targetType, targetId: input.targetId,
    reason: input.reason, idempotencyKey: input.idempotencyKey,
  })).digest("hex");
}
