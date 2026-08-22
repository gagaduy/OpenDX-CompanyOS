// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import { AgenticQueryServiceImpl } from "./agentic-query.service";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const principal = (role: StaffPrincipal["roles"][number]): StaffPrincipal => ({ subject: "reader", displayName: "Reader", roles: [role] });

describe("AgenticQueryServiceImpl audit scope", () => {
  it("passes explicit filters and a governance-only resource scope to the repository", async () => {
    const repository = { listAudit: vi.fn(async () => []), listAgents: vi.fn(), findAgentByKind: vi.fn() };
    const service = new AgenticQueryServiceImpl(repository as unknown as AgenticRepository, transactions);

    await service.listAudit({ limit: 25, actorId: "actor-a", outcome: "denied" }, principal("agentic_governance_admin"));

    expect(repository.listAudit).toHaveBeenCalledWith(session, {
      limit: 25, actorId: "actor-a", outcome: "denied",
      resourceTypes: ["configuration_revision", "approval_request", "agent", "tool_grant", "model"],
    });
  });

  it("rejects callers without an audit role even when presentation guards are bypassed", async () => {
    const repository = { listAudit: vi.fn(async () => []), listAgents: vi.fn(), findAgentByKind: vi.fn() };
    const service = new AgenticQueryServiceImpl(repository as unknown as AgenticRepository, transactions);

    await expect(service.listAudit({ limit: 25 }, principal("agentic_operator")))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.listAudit).not.toHaveBeenCalled();
  });

  it("uses an explicit safe resource allow-list for Auditors", async () => {
    const repository = { listAudit: vi.fn(async () => []), listAgents: vi.fn(), findAgentByKind: vi.fn() };
    const service = new AgenticQueryServiceImpl(repository as unknown as AgenticRepository, transactions);

    await service.listAudit({ limit: 25 }, principal("agentic_auditor"));

    expect(repository.listAudit).toHaveBeenCalledWith(session, {
      limit: 25,
      resourceTypes: ["configuration_revision", "approval_request", "agent", "tool_grant", "model", "agentic_task", "tool"],
    });
  });
});
