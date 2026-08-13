// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { ApprovalRequest } from "../../../domain/entities/approval-request";
import { EmergencyRevocationService } from "./emergency-revocation.service";

const session = {} as DatabaseSession;
const tx: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const principal = (subject: string, role: StaffPrincipal["roles"][number]): StaffPrincipal => ({ subject, displayName: subject, roles: [role] });
const input = { targetType: "agent" as const, targetId: "catalog", reason: "Emergency stop", idempotencyKey: "stop-catalog", correlationId: "corr" };

describe("EmergencyRevocationService", () => {
  it("allows only Administrator to activate immediately and converges replay", async () => {
    const { service, repository } = harness();
    await expect(service.request(input, principal("operator", "agentic_operator")))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.request(input, principal("admin", "administrator")))
      .resolves.toMatchObject({ kind: "revocation", status: "created" });
    repository.createRevocation.mockResolvedValueOnce("duplicate");
    await expect(service.request(input, principal("admin", "administrator")))
      .resolves.toMatchObject({ kind: "revocation", status: "duplicate" });
  });

  it("makes Governance Admin request approval instead of activating", async () => {
    const { service, repository } = harness();
    await expect(service.request(input, principal("governance", "agentic_governance_admin")))
      .resolves.toMatchObject({ kind: "approval", state: "pending", requesterId: "governance" });
    expect(repository.createRevocation).not.toHaveBeenCalled();
    expect(repository.createApproval).toHaveBeenCalledOnce();
  });

  it("lets the requester activate only after a different human approved the exact request", async () => {
    const { service, repository } = harness();
    const requested = await service.request(input, principal("governance", "agentic_governance_admin"));
    expect(requested.kind).toBe("approval");
    if (requested.kind !== "approval") throw new Error("Expected approval");
    repository.findApproval.mockResolvedValueOnce({
      ...requested, state: "approved", decidedBy: "approver",
      decidedAt: "2026-08-14T12:10:00.000Z", version: 2,
    });
    await expect(service.request({ ...input, approvalId: requested.id }, principal("governance", "agentic_governance_admin")))
      .resolves.toMatchObject({ kind: "revocation", revocation: { approvalId: requested.id } });
  });
});

function harness() {
  const repository = {
    createRevocation: vi.fn(async (): Promise<"created" | "duplicate"> => "created"), createApproval: vi.fn(async () => undefined),
    appendAudit: vi.fn(async () => undefined), findActiveRevision: vi.fn(async () => ({ id: "revision", version: 2 })),
    findApproval: vi.fn(async (): Promise<ApprovalRequest | undefined> => undefined),
  };
  let id = 0;
  const service = new EmergencyRevocationService(repository as unknown as AgenticRepository, tx,
    () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    () => "2026-08-14T12:00:00.000Z");
  return { service, repository };
}
