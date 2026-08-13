// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import { ConfigurationServiceImpl } from "./configuration.service";

const session = {} as DatabaseSession;
const tx: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const admin = (subject: string): StaffPrincipal => ({ subject, displayName: subject, roles: ["agentic_governance_admin", "agentic_approver"] });
const emptyChildren = { policies: [], toolGrants: [], modelConfigurations: [], budgetLimits: [] };

describe("ConfigurationServiceImpl", () => {
  it("creates owned drafts with a canonical digest and mandatory audit", async () => {
    const { service, repository } = harness();
    const revision = await service.createDraft({ children: emptyChildren }, admin("creator"));
    expect(revision).toMatchObject({ state: "draft", createdBy: "creator", version: 1 });
    expect(revision.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.createRevision).toHaveBeenCalledOnce();
    expect(repository.replaceRevisionChildren).toHaveBeenCalledOnce();
    expect(repository.appendAudit).toHaveBeenCalledOnce();
  });

  it("forbids overlapping-role self approval and activates a different-subject decision", async () => {
    const pending = { id: "revision-1", state: "pending_approval" as const, createdBy: "creator", payloadDigest: "a".repeat(64), version: 2, createdAt: "", updatedAt: "" };
    const own = harness({ revision: pending });
    await expect(own.service.decide({ revisionId: "revision-1", expectedVersion: 2, decision: "activate" }, admin("creator")))
      .rejects.toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
    expect(own.repository.activateRevision).not.toHaveBeenCalled();

    const other = harness({ revision: pending });
    await expect(other.service.decide({ revisionId: "revision-1", expectedVersion: 2, decision: "activate" }, admin("approver")))
      .resolves.toMatchObject({ state: "active", decidedBy: "approver", version: 3 });
    expect(other.repository.activateRevision).toHaveBeenCalledOnce();
  });

  it("propagates required audit failure so the surrounding transaction rolls back", async () => {
    const { service } = harness({ auditFailure: true });
    await expect(service.createDraft({ children: emptyChildren }, admin("creator")))
      .rejects.toThrow("audit unavailable");
  });
});

function harness(options: { readonly revision?: Record<string, unknown>; readonly auditFailure?: boolean } = {}) {
  const repository = {
    createRevision: vi.fn(async () => undefined), replaceRevisionChildren: vi.fn(async () => true),
    findRevision: vi.fn(async () => options.revision), findActiveRevision: vi.fn(async () => undefined),
    updateRevision: vi.fn(async () => true), activateRevision: vi.fn(async () => true),
    rejectRevision: vi.fn(async () => true),
    appendAudit: vi.fn(async () => { if (options.auditFailure) throw new Error("audit unavailable"); }),
  };
  let id = 0;
  const service = new ConfigurationServiceImpl(repository as unknown as AgenticRepository, tx,
    () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    () => "2026-08-14T12:00:00.000Z");
  return { service, repository };
}
