// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import { AgenticApplicationError } from "../agentic-application.error";
import { PostgresqlBudgetService } from "./budget.service";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = {
  run: (work) => work(session), runReadOnly: (work) => work(session),
};
const reservation = {
  revisionId: "revision", agentKind: "catalog" as const, taskId: "task",
  idempotencyKey: "reserve-1", costMicros: 50, correlationId: "corr-1",
};

describe("PostgresqlBudgetService", () => {
  it("rejects non-positive, fractional, and unsafe costs before persistence", async () => {
    const repository = { reserveBudget: vi.fn(), settleBudget: vi.fn(), appendAudit: vi.fn() };
    const service = createService(repository);
    for (const costMicros of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(service.reserve({ ...reservation, costMicros }))
        .rejects.toMatchObject({ code: "BUDGET_INVALID" } satisfies Partial<AgenticApplicationError>);
    }
    expect(repository.reserveBudget).not.toHaveBeenCalled();
  });

  it("reserves idempotently, reports exceeded limits, and appends safe audit", async () => {
    const repository = {
      reserveBudget: vi.fn().mockResolvedValueOnce("reserved").mockResolvedValueOnce("duplicate").mockResolvedValueOnce("exceeded"),
      settleBudget: vi.fn(), appendAudit: vi.fn(),
    };
    const service = createService(repository);
    await expect(service.reserve(reservation)).resolves.toBe("reserved");
    await expect(service.reserve(reservation)).resolves.toBe("duplicate");
    await expect(service.reserve({ ...reservation, idempotencyKey: "reserve-2" })).resolves.toBe("exceeded");
    expect(repository.appendAudit).toHaveBeenCalledTimes(3);
    expect(repository.appendAudit.mock.calls[2]?.[1]).toMatchObject({
      outcome: "denied", action: "budget.reserve", resourceId: "task",
    });
  });

  it("settles once and propagates mandatory audit failure", async () => {
    const repository = {
      reserveBudget: vi.fn(), settleBudget: vi.fn().mockResolvedValue("settled"),
      appendAudit: vi.fn().mockRejectedValue(new Error("audit unavailable")),
    };
    const service = createService(repository);
    await expect(service.settle({
      reservationId: "reservation", idempotencyKey: "settle-1",
      actualCostMicros: 40, correlationId: "corr-2",
    })).rejects.toThrow("audit unavailable");
    expect(repository.settleBudget).toHaveBeenCalledOnce();
  });

  it("propagates idempotency conflicts with non-success audit outcomes", async () => {
    const repository = {
      reserveBudget: vi.fn().mockResolvedValue("conflict"),
      settleBudget: vi.fn().mockResolvedValue("conflict"),
      appendAudit: vi.fn(),
    };
    const service = createService(repository);
    await expect(service.reserve(reservation)).resolves.toBe("conflict");
    await expect(service.settle({
      reservationId: "reservation", idempotencyKey: "settle-1",
      actualCostMicros: 40, correlationId: "corr-2",
    })).resolves.toBe("conflict");
    expect(repository.appendAudit.mock.calls[0]?.[1]).toMatchObject({ outcome: "denied" });
    expect(repository.appendAudit.mock.calls[1]?.[1]).toMatchObject({ outcome: "failed" });
  });
});

function createService(repository: {
  reserveBudget: ReturnType<typeof vi.fn>;
  settleBudget: ReturnType<typeof vi.fn>;
  appendAudit: ReturnType<typeof vi.fn>;
}): PostgresqlBudgetService {
  let id = 0;
  return new PostgresqlBudgetService(
    repository as unknown as Pick<AgenticRepository, "reserveBudget" | "settleBudget" | "appendAudit">,
    transactions, () => `id-${++id}`,
    () => "2026-08-14T12:00:00.000Z");
}
