// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import { CommandActivityServiceImpl } from "./command-activity.service";
import type { VerifiedDecisionHistoryReader } from "../../../../../shared/verified-decision-evidence";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = {
  run: (work) => work(session),
  runReadOnly: (work) => work(session),
};
const approver: StaffPrincipal = {
  subject: "approver-a",
  displayName: "Approver A",
  roles: ["agentic_approver"],
};

describe("CommandActivityServiceImpl", () => {
  it("records a server-authored department approval event", async () => {
    const repository = {
      appendCommandActivity: vi.fn(async (_session, event) => event),
    } as unknown as AgenticRepository;
    const service = new CommandActivityServiceImpl(
      repository,
      transactions,
      () => "00000000-0000-4000-8000-000000000111",
      () => "2026-09-15T09:00:00.000Z",
    );

    const event = await service.record({
      department: "support",
      decision: "approved",
      resourceType: "support_proposal",
      resourceId: "proposal-1",
      summary: "Phản hồi sản phẩm lỗi",
      idempotencyKey: "support:proposal-1:approved",
    }, approver);

    expect(event).toEqual({
      id: "00000000-0000-4000-8000-000000000111",
      actorId: "approver-a",
      department: "support",
      decision: "approved",
      resourceType: "support_proposal",
      resourceId: "proposal-1",
      summary: "Phản hồi sản phẩm lỗi",
      idempotencyKey: "support:proposal-1:approved",
      occurredAt: "2026-09-15T09:00:00.000Z",
    });
    expect(repository.appendCommandActivity).toHaveBeenCalledWith(session, event);
  });

  it("returns recent persisted activity through a read-only transaction", async () => {
    const events = [{ id: "event-1" }];
    const repository = {
      listCommandActivity: vi.fn(async () => events),
    } as unknown as AgenticRepository;
    const service = new CommandActivityServiceImpl(repository, transactions, vi.fn(), vi.fn());

    await expect(service.listRecent(30)).resolves.toEqual([{ id: "event-1", source: "command_activity" }]);
    expect(repository.listCommandActivity).toHaveBeenCalledWith(session, 30);
  });

  it("merges source-verified decisions and explicit events without duplicates", async () => {
    const evidence = {
      id: "source:inventory_replenishment_proposals:proposal-1",
      department: "operations" as const,
      decision: "approved" as const,
      resourceType: "operations_proposal" as const,
      resourceId: "proposal-1",
      summary: "Đã duyệt đề xuất bổ sung tồn kho",
      occurredAt: "2026-09-14T09:00:00.000Z",
      sourceTable: "inventory_replenishment_proposals",
      sourceId: "proposal-1",
    };
    const explicit = {
      ...evidence,
      id: "00000000-0000-4000-8000-000000000112",
      actorId: "staff-1",
      idempotencyKey: "operations:proposal-1:approved",
      occurredAt: "2026-09-14T09:01:00.000Z",
    };
    const reader: VerifiedDecisionHistoryReader = { listRecent: vi.fn(async () => [evidence]) };
    const repository = { listCommandActivity: vi.fn(async () => [explicit]) } as unknown as AgenticRepository;
    const service = new CommandActivityServiceImpl(repository, transactions, vi.fn(), vi.fn(), [reader]);

    await expect(service.listRecent(30)).resolves.toEqual([
      expect.objectContaining({ id: explicit.id, actorId: "staff-1", source: "command_activity" }),
    ]);
    expect(reader.listRecent).toHaveBeenCalledWith(session, 30);
  });

  it("keeps the newest source record for a business decision and bounds the feed", async () => {
    const base = {
      department: "marketing" as const, decision: "approved" as const,
      resourceType: "marketing_campaign" as const, resourceId: "campaign-1",
      summary: "Approved campaign", sourceTable: "marketing_publication_packages",
    };
    const reader: VerifiedDecisionHistoryReader = { listRecent: vi.fn(async () => [
      { ...base, id: "source:new", sourceId: "new", occurredAt: "2026-09-15T09:00:00.000Z" },
      { ...base, id: "source:old", sourceId: "old", occurredAt: "2026-09-14T09:00:00.000Z" },
      { ...base, id: "source:other", resourceId: "campaign-2", sourceId: "other", occurredAt: "2026-09-15T08:00:00.000Z" },
    ]) };
    const repository = { listCommandActivity: vi.fn(async () => []) } as unknown as AgenticRepository;
    const service = new CommandActivityServiceImpl(repository, transactions, vi.fn(), vi.fn(), [reader]);
    await expect(service.listRecent(1)).resolves.toEqual([
      expect.objectContaining({ id: "source:new", source: "business_history" }),
    ]);
  });

  it("reserves history for a less active department when another department has newer events", async () => {
    const marketing: VerifiedDecisionHistoryReader = { listRecent: vi.fn(async () => [
      { id: "marketing-1", department: "marketing" as const, decision: "approved" as const,
        resourceType: "marketing_campaign" as const, resourceId: "campaign-1", summary: "One",
        occurredAt: "2026-09-15T09:00:00.000Z", sourceTable: "marketing_campaigns", sourceId: "campaign-1" },
      { id: "marketing-2", department: "marketing" as const, decision: "approved" as const,
        resourceType: "marketing_campaign" as const, resourceId: "campaign-2", summary: "Two",
        occurredAt: "2026-09-15T08:00:00.000Z", sourceTable: "marketing_campaigns", sourceId: "campaign-2" },
    ]) };
    const support: VerifiedDecisionHistoryReader = { listRecent: vi.fn(async () => [
      { id: "support-1", department: "support" as const, decision: "approved" as const,
        resourceType: "support_proposal" as const, resourceId: "proposal-1", summary: "Email sent",
        occurredAt: "2026-09-13T22:50:00.000Z", sourceTable: "support_ticket_events", sourceId: "ticket-event-1" },
    ]) };
    const repository = { listCommandActivity: vi.fn(async () => []) } as unknown as AgenticRepository;
    const service = new CommandActivityServiceImpl(repository, transactions, vi.fn(), vi.fn(), [marketing, support]);
    await expect(service.listRecent(1)).resolves.toEqual([
      expect.objectContaining({ id: "marketing-1" }),
      expect.objectContaining({ id: "support-1" }),
    ]);
  });
});
