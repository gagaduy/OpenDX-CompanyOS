// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import { describe, expect, it, vi } from "vitest";
import { SupportHealthReaderService } from "./support-health-reader";

const NOW = "2026-08-16T05:00:00.000Z";
const window = {
  start: "2026-08-01T00:00:00.000Z",
  end: NOW,
  timezone: "Asia/Ho_Chi_Minh" as const,
};

describe("SupportHealthReaderService", () => {
  it("maps bounded SLA evidence and excludes ticket content", async () => {
    const { service } = fixture();
    const result = await service.slaRisk({ ...window, horizonMinutes: 240 });
    expect(result).toEqual({
      summary: {
        openTickets: 4,
        atRiskCount: 2,
        breachedCount: 1,
        countsByPriority: [
          { priority: "urgent", count: 1 },
          { priority: "high", count: 1 },
        ],
      },
      evidence: [
        {
          ticketId: "10000000-0000-4000-8000-000000000001",
          priority: "urgent",
          status: "in_progress",
          slaDueAt: "2026-08-16T04:59:00.000Z",
          minutesRemaining: -1,
          riskCode: "BREACHED",
        },
        {
          ticketId: "10000000-0000-4000-8000-000000000002",
          priority: "high",
          status: "waiting_customer",
          slaDueAt: "2026-08-16T05:30:00.000Z",
          minutesRemaining: 30,
          riskCode: "DUE_WITHIN_HORIZON",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /CANARY_SUBJECT|CANARY_DESCRIPTION|CANARY_MESSAGE|CANARY_CUSTOMER|CANARY_ASSIGNEE|CANARY_ATTACHMENT/,
    );
  });

  it("returns all six deterministic operational classes in declaration order", async () => {
    const { service } = fixture();
    await expect(service.classificationSummary(window)).resolves.toEqual({
      countsByPriority: [
        { priority: "urgent", count: 1 },
        { priority: "normal", count: 5 },
      ],
      countsByStatus: [
        { status: "new", count: 1 },
        { status: "in_progress", count: 1 },
        { status: "waiting_customer", count: 1 },
        { status: "waiting_internal", count: 1 },
        { status: "escalated", count: 1 },
        { status: "closed", count: 1 },
      ],
      operationalClasses: [
        { class: "unassigned", count: 1 },
        { class: "active_work", count: 1 },
        { class: "waiting_customer", count: 1 },
        { class: "waiting_internal", count: 1 },
        { class: "escalated", count: 1 },
        { class: "terminal", count: 1 },
      ],
      unassignedCount: 1,
      escalatedCount: 1,
    });
  });

  it("rejects windows beyond the one-minute server tolerance", async () => {
    const { service, repository } = fixture();
    await expect(service.classificationSummary({
      ...window, end: "2026-08-16T05:01:00.001Z",
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.readClassificationSummary).not.toHaveBeenCalled();
  });

  it("resolves only the order stored on the requested ticket", async () => {
    const { service, orders, repository } = fixture();
    await expect(service.findRelatedOrder("10000000-0000-4000-8000-000000000003"))
      .resolves.toEqual({
        ticketId: "10000000-0000-4000-8000-000000000003",
        hasRelatedOrder: true,
        orderId: "20000000-0000-4000-8000-000000000001",
        orderStatus: "paid",
        orderCreatedAt: "2026-08-15T00:00:00.000Z",
        reservationExpiresAt: "2026-08-16T06:00:00.000Z",
        totalVnd: 50_000,
        paymentConfirmed: true,
      });
    expect(repository.findRelatedOrderId).toHaveBeenCalledWith(
      expect.anything(),
      "10000000-0000-4000-8000-000000000003",
    );
    expect(orders.getAuthorizedContext).toHaveBeenCalledWith(
      "20000000-0000-4000-8000-000000000001",
    );
    await expect(service.findRelatedOrder("10000000-0000-4000-8000-000000000004"))
      .resolves.toEqual({
        ticketId: "10000000-0000-4000-8000-000000000004",
        hasRelatedOrder: false,
      });
  });
});

function fixture() {
  const repository = {
    readSlaRisk: vi.fn(async () => ({
      summary: {
        openTickets: 4,
        atRiskCount: 2,
        breachedCount: 1,
        countsByPriority: [{ priority: "urgent", count: 1 }, { priority: "high", count: 1 }],
      },
      evidence: [
        slaFact(1, "urgent", "in_progress", "2026-08-16T04:59:00.000Z"),
        slaFact(2, "high", "waiting_customer", "2026-08-16T05:30:00.000Z"),
      ],
    })),
    readClassificationSummary: vi.fn(async () => ({
      countsByPriority: [{ priority: "normal", count: 5 }, { priority: "urgent", count: 1 }],
      countsByStatus: [
        { status: "closed", count: 1 }, { status: "escalated", count: 1 },
        { status: "waiting_internal", count: 1 }, { status: "waiting_customer", count: 1 },
        { status: "in_progress", count: 1 }, { status: "new", count: 1 },
      ],
      operationalClasses: [
        { class: "terminal", count: 1 }, { class: "escalated", count: 1 },
        { class: "waiting_internal", count: 1 }, { class: "waiting_customer", count: 1 },
        { class: "active_work", count: 1 }, { class: "unassigned", count: 1 },
      ],
      unassignedCount: 1,
      escalatedCount: 1,
    })),
    findRelatedOrderId: vi.fn(async (_session, ticketId: string) =>
      ticketId.endsWith("3")
        ? { found: true, orderId: "20000000-0000-4000-8000-000000000001" }
        : { found: true, orderId: null }),
  };
  const orders = {
    getAuthorizedContext: vi.fn(async () => ({
      orderId: "20000000-0000-4000-8000-000000000001",
      status: "paid" as const,
      createdAt: "2026-08-15T00:00:00.000Z",
      reservationExpiresAt: "2026-08-16T06:00:00.000Z",
      totalVnd: 50_000,
      backendConfirmedPaid: true,
    })),
  };
  const transactions: TransactionRunner = {
    run: vi.fn(),
    runReadOnly: async work => work({ query: vi.fn() }),
  };
  return {
    repository,
    orders,
    service: new SupportHealthReaderService(
      repository as never,
      orders,
      transactions,
      () => NOW,
    ),
  };
}

function slaFact(index: number, priority: "urgent" | "high", status: string, slaDueAt: string) {
  return {
    ticketId: `10000000-0000-4000-8000-00000000000${index}`,
    priority,
    status,
    slaDueAt,
    subject: "CANARY_SUBJECT",
    description: "CANARY_DESCRIPTION",
    assigneeId: "CANARY_ASSIGNEE",
  };
}
