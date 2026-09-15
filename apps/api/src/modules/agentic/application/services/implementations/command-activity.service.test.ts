// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import { CommandActivityServiceImpl } from "./command-activity.service";

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

    await expect(service.listRecent(30)).resolves.toBe(events);
    expect(repository.listCommandActivity).toHaveBeenCalledWith(session, 30);
  });
});
