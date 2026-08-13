// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import { ApprovalServiceImpl } from "./approval.service";

const session = {} as DatabaseSession;
const tx: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const principal = (subject: string): StaffPrincipal => ({ subject, displayName: subject, roles: ["agentic_approver"] });
const pending = { id: "approval-1", state: "pending" as const, requesterId: "requester", approverScope: "tool_invocation" as const, action: "tool.invoke", resourceType: "tool", resourceId: "catalog.health@1", parametersDigest: "a".repeat(64), policyVersion: 1, configurationRevisionId: "revision", expiresAt: "2026-08-15T00:00:00.000Z", version: 1, createdAt: "" };

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
});

function harness(value: typeof pending | (Omit<typeof pending, "approverScope"> & { readonly approverScope: "governance_configuration" }), decisionResult = true) {
  const repository = {
    findApproval: vi.fn(async () => value), listApprovals: vi.fn(async () => ({ items: [value], totalItems: 1 })),
    decideApproval: vi.fn(async () => decisionResult), appendAudit: vi.fn(async () => undefined),
  };
  const service = new ApprovalServiceImpl(repository as unknown as AgenticRepository, tx,
    () => "00000000-0000-4000-8000-000000000001", () => "2026-08-14T12:00:00.000Z");
  return { service, repository };
}
