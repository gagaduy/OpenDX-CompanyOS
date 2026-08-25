// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { ApprovalRequest } from "../../../domain/entities/approval-request";
import { ApprovalServiceImpl } from "./approval.service";

const session = {} as DatabaseSession;
const tx: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const principal = (subject: string): StaffPrincipal => ({ subject, displayName: subject, roles: ["agentic_approver"] });
const pending = { id: "approval-1", state: "pending" as const, requesterId: "requester", approverScope: "tool_invocation" as const, action: "tool.invoke", resourceType: "tool", resourceId: "catalog.health@1", parametersDigest: "a".repeat(64), policyVersion: 1, configurationRevisionId: "revision", expiresAt: "2026-08-15T00:00:00.000Z", version: 1, createdAt: "" };
const workflowPending = {
  ...pending,
  requesterId: "system:workflow",
  approverScope: "workflow_execution" as const,
  action: "agentic.workflow.complete",
  resourceType: "workflow_run",
  resourceId: "run-1",
  taskId: "task-1",
  workflowVersion: 1,
  configurationRevisionId: "revision-1",
  policyVersion: 4,
  parametersDigest: workflowDigest(),
};

describe("ApprovalServiceImpl", () => {
  it("rejects self, expired, and stale decisions before returning a mutation", async () => {
    await expect(harness(pending).service.decide({ approvalId: "approval-1", expectedVersion: 1, decision: "approved", reason: "ok" }, principal("requester")))
      .rejects.toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
    await expect(harness({ ...pending, expiresAt: "2026-08-14T12:00:00.000Z" }).service.decide({ approvalId: "approval-1", expectedVersion: 1, decision: "approved", reason: "ok" }, principal("approver")))
      .rejects.toMatchObject({ code: "APPROVAL_EXPIRED" });
    const stale = harness(pending, false);
    await expect(stale.service.decide({ approvalId: "approval-1", expectedVersion: 1, decision: "approved", reason: "ok" }, principal("approver")))
      .rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("persists one exact decision with audit", async () => {
    const { service, repository } = harness(pending);
    await expect(service.decide({ approvalId: "approval-1", expectedVersion: 1, decision: "rejected", reason: "insufficient evidence" }, principal("approver")))
      .resolves.toMatchObject({ state: "rejected", decidedBy: "approver", version: 2 });
    expect(repository.decideApproval).toHaveBeenCalledOnce();
    expect(repository.appendAudit).toHaveBeenCalledOnce();
  });

  it("rejects an approver outside the request's assigned scope", async () => {
    const outside = { ...pending, approverScope: "governance_configuration" as const };
    const { service, repository } = harness(outside);

    await expect(service.decide({ approvalId: outside.id, expectedVersion: 1, decision: "approved", reason: "ok" }, principal("approver")))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.decideApproval).not.toHaveBeenCalled();
  });

  it("commits a bound workflow receipt before requesting signal delivery", async () => {
    const { service, repository, dispatcher } = harness(workflowPending);
    vi.mocked(dispatcher.dispatchOnce).mockImplementation(async () => {
      expect(repository.receipts).toHaveLength(1);
      expect(repository.receipts[0]).toMatchObject({ deliveryState: "pending" });
    });

    await expect(service.decide({
      approvalId: workflowPending.id,
      expectedVersion: 1,
      decision: "approved",
      reason: "Approved with reviewed evidence",
    }, principal("approver"))).resolves.toMatchObject({ state: "approved", version: 2 });

    expect(repository.receipts[0]).toMatchObject({
      workflowRunId: "run-1",
      signalKind: "approval",
      approvalId: workflowPending.id,
      payloadDigest: workflowPending.parametersDigest,
      decision: "approved",
      applicationDecisionVersion: 2,
      deliveryState: "pending",
    });
    expect(repository.receipts[0]?.idempotencyKey).toBe(repository.receipts[0]?.id);
    expect(dispatcher.dispatchOnce).toHaveBeenCalledOnce();
  });

  it("rejects a workflow approval whose frozen plan digest no longer matches", async () => {
    const invalid = { ...workflowPending, parametersDigest: "f".repeat(64) };
    const { service, repository, dispatcher } = harness(invalid);

    await expect(service.decide({
      approvalId: invalid.id,
      expectedVersion: 1,
      decision: "approved",
      reason: "Approved with reviewed evidence",
    }, principal("approver"))).rejects.toMatchObject({ code: "APPROVAL_BINDING_INVALID" });

    expect(repository.receipts).toHaveLength(0);
    expect(dispatcher.dispatchOnce).not.toHaveBeenCalled();
  });

  it("converges an exact decision replay and rejects a conflicting replay", async () => {
    const decided = {
      ...workflowPending,
      state: "approved" as const,
      decidedBy: "approver",
      decisionReason: "Approved with reviewed evidence",
      decidedAt: "2026-08-14T12:00:00.000Z",
      version: 2,
    };
    const replay = harness(decided);

    await expect(replay.service.decide({
      approvalId: decided.id,
      expectedVersion: 1,
      decision: "approved",
      reason: "Approved with reviewed evidence",
    }, principal("approver"))).resolves.toEqual(decided);
    expect(replay.repository.decideApproval).not.toHaveBeenCalled();
    expect(replay.dispatcher.dispatchOnce).toHaveBeenCalledOnce();

    await expect(replay.service.decide({
      approvalId: decided.id,
      expectedVersion: 1,
      decision: "rejected",
      reason: "Rejected after review",
    }, principal("approver"))).rejects.toMatchObject({
      code: "APPROVAL_DECISION_CONFLICT",
    });
  });

  it("allows task owners and governance oversight to read without granting decision authority", async () => {
    const owner: StaffPrincipal = { subject: "operator-a", displayName: "Operator A", roles: ["agentic_operator"] };
    const other: StaffPrincipal = { subject: "operator-b", displayName: "Operator B", roles: ["agentic_operator"] };
    const governance: StaffPrincipal = { subject: "governance-a", displayName: "Governance A", roles: ["agentic_governance_admin"] };
    const owned = harness(workflowPending);

    await expect(owned.service.get(workflowPending.id, owner)).resolves.toEqual(workflowPending);
    await expect(owned.service.get(workflowPending.id, other)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(owned.service.get(workflowPending.id, governance)).resolves.toEqual(workflowPending);
    await owned.service.list({ page: 1, pageSize: 25 }, owner);
    expect(owned.repository.listApprovals).toHaveBeenLastCalledWith(session, 1, 25, { readerId: "operator-a" });
    await owned.service.list({ page: 1, pageSize: 25 }, governance);
    expect(owned.repository.listApprovals).toHaveBeenLastCalledWith(session, 1, 25, undefined);
    await expect(owned.service.decide({ approvalId: workflowPending.id, expectedVersion: 1, decision: "approved", reason: "Reviewed" }, governance))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("exactly replays a revision request", async () => {
    const decided = { ...pending, state: "revision_requested" as const, decidedBy: "approver", decisionReason: "Clarify evidence", decidedAt: "2026-08-14T12:00:00.000Z", version: 2 };
    const replay = harness(decided);
    await expect(replay.service.decide({ approvalId: decided.id, expectedVersion: 1, decision: "revision_requested", reason: "Clarify evidence" }, principal("approver")))
      .resolves.toEqual(decided);
    expect(replay.repository.decideApproval).not.toHaveBeenCalled();
  });
});

function harness(value: ApprovalRequest, decisionResult = true) {
  const receipts: Record<string, unknown>[] = [];
  const repository = {
    findApproval: vi.fn(async () => value), listApprovals: vi.fn(async () => ({ items: [value], totalItems: 1 })),
    decideApproval: vi.fn(async () => decisionResult), appendAudit: vi.fn(async () => undefined),
    findWorkflowRun: vi.fn(async () => value.resourceType === "workflow_run" ? ({
      id: value.resourceId, taskId: "task-1", workflowName: "StoreHealthReviewWorkflowV1",
      workflowVersion: 1, planRevision: 2, temporalWorkflowId: "store-health-v1:run-1",
      state: "awaiting_human_approval", projectionSequence: 8, version: 9,
      createdAt: "", updatedAt: "",
    }) : undefined),
    findTaskById: vi.fn(async () => ({
      id: "task-1", state: "ready", createdBy: "operator-a",
      goal: "Review store health", instructions: "Use the fixed plan",
      configurationRevisionId: "revision-1", version: 2,
      createdAt: "", updatedAt: "",
    })),
    createWorkflowSignalReceipt: vi.fn(async (_session: DatabaseSession, receipt: Record<string, unknown>) => {
      receipts.push(receipt);
      return { status: "created", receipt };
    }),
    receipts,
  };
  const dispatcher = { dispatchOnce: vi.fn(async () => undefined) };
  const service = new ApprovalServiceImpl(repository as unknown as AgenticRepository, tx,
    () => "00000000-0000-4000-8000-000000000001", () => "2026-08-14T12:00:00.000Z",
    dispatcher);
  return { service, repository, dispatcher };
}

function workflowDigest(): string {
  return createHash("sha256").update(JSON.stringify({
    taskId: "task-1",
    workflowRunId: "run-1",
    workflowVersion: 1,
    planRevision: 2,
    configurationRevisionId: "revision-1",
    policyVersion: 4,
    action: "agentic.workflow.complete",
  })).digest("hex");
}
