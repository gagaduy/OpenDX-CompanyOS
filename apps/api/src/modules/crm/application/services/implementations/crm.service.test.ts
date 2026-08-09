// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { CustomerOperationsReader } from "../../../../customer";
import type { CustomerOrderOperationsReader } from "../../../../order";
import type { CrmNote } from "../../../domain/entities/crm-note";
import type { Followup } from "../../../domain/entities/followup";
import type { CrmRepository } from "../../repositories/interfaces/crm.repository";
import { CrmService } from "./crm.service";

const now = "2026-08-10T12:00:00.000Z";
const customerId = "b2400000-0000-4000-8000-000000000001";
const noteId = "b2500000-0000-4000-8000-000000000001";
const followupId = "b2600000-0000-4000-8000-000000000001";
const context = {
  actorId: "crm-operator-1",
  roles: ["crm_operator"] as const,
  correlationId: "corr-crm",
};
const session: DatabaseSession = { query: vi.fn() };

describe("CrmService", () => {
  it("composes a read-only Customer 360 and independently calculates all applicable segments", async () => {
    const sourceCustomer = customerDetail();
    const listByCustomer = vi.fn(async () => [{
      id: "order-1", publicNumber: "NVC-1", status: "completed", totalVnd: 50_000_000,
      createdAt: "2026-04-01T00:00:00.000Z", paidAt: "2026-04-01T00:05:00.000Z",
    }]);
    const dependencies = fixture({
      customerReader: { get: vi.fn(async () => sourceCustomer) },
      orderReader: {
        listByCustomer,
        getPaidCustomerFacts: vi.fn(async () => ({
          paidOrderCount: 2,
          lifetimePaidVnd: 50_000_000,
          latestPaidAt: "2026-05-12T12:00:00.000Z",
        })),
      },
      repository: {
        listNotes: vi.fn(async () => [note()]),
        listFollowups: vi.fn(async () => [followup()]),
      },
    });

    const result = await dependencies.service.getCustomer(customerId, context);

    expect(result).toEqual({
      customer: sourceCustomer,
      orders: [expect.objectContaining({ id: "order-1" })],
      paidFacts: {
        paidOrderCount: 2,
        lifetimePaidVnd: 50_000_000,
        latestPaidAt: "2026-05-12T12:00:00.000Z",
      },
      segments: ["repeat_customer", "high_value", "inactive_90d"],
      calculatedAt: now,
      notes: [note()],
      followups: [followup()],
    });
    expect(listByCustomer).toHaveBeenCalledWith(customerId, 20);
    expect(dependencies.transactions.runReadOnly).toHaveBeenCalledTimes(1);
    expect(dependencies.transactions.run).not.toHaveBeenCalled();
    expect(sourceCustomer).toEqual(customerDetail());
  });

  it("creates an append-only correction linked to a note owned by the same customer in one transaction", async () => {
    const create = vi.fn(async (_session: DatabaseSession, _value: CrmNote) => undefined);
    const appendAudit = vi.fn(async () => undefined);
    const dependencies = fixture({ repository: {
      findNote: vi.fn(async (_session, requestedCustomerId, requestedNoteId) =>
        requestedCustomerId === customerId && requestedNoteId === noteId ? note() : undefined),
      createNote: create,
      appendAudit,
    } });

    const created = await dependencies.service.createNote(customerId, {
      body: " Corrected customer preference ",
      correctsNoteId: noteId,
    }, context);

    expect(created).toEqual(expect.objectContaining({
      customerId,
      authorId: context.actorId,
      body: "Corrected customer preference",
      correctsNoteId: noteId,
    }));
    expect(dependencies.transactions.run).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      action: "crm.note.created",
      metadata: { correction: true },
    }));
    expect(JSON.stringify(appendAudit.mock.calls)).not.toContain("Corrected customer preference");
  });

  it("rejects a correction target outside the customer without appending a note", async () => {
    const createNote = vi.fn();
    const dependencies = fixture({ repository: {
      findNote: vi.fn(async () => undefined),
      createNote,
    } });

    await expect(dependencies.service.createNote(customerId, {
      body: "Replacement",
      correctsNoteId: noteId,
    }, context)).rejects.toMatchObject({ code: "NOTE_NOT_FOUND" });
    expect(createNote).not.toHaveBeenCalled();
  });

  it("self-claims an unassigned follow-up and rejects a stale retry", async () => {
    const stored = followup();
    const updateFollowup = vi.fn(async () => true);
    const dependencies = fixture({ repository: {
      findFollowup: vi.fn(async () => stored),
      updateFollowup,
      appendAudit: vi.fn(async () => undefined),
    } });

    await expect(dependencies.service.updateFollowup(customerId, followupId, {
      action: "claim", version: 1,
    }, context)).resolves.toEqual(expect.objectContaining({
      assigneeId: context.actorId,
      version: 2,
    }));
    expect(updateFollowup).toHaveBeenCalledWith(session, expect.objectContaining({ version: 2 }), 1);

    const stale = fixture({ repository: {
      findFollowup: vi.fn(async () => ({ ...stored, assigneeId: context.actorId, version: 2 })),
    } });
    await expect(stale.service.updateFollowup(customerId, followupId, {
      action: "claim", version: 1,
    }, context)).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("converges a same-actor current-version claim without another write", async () => {
    const updateFollowup = vi.fn();
    const current = { ...followup(), assigneeId: context.actorId, version: 2 };
    const dependencies = fixture({ repository: {
      findFollowup: vi.fn(async () => current),
      updateFollowup,
      appendAudit: vi.fn(async () => undefined),
    } });

    await expect(dependencies.service.updateFollowup(customerId, followupId, {
      action: "claim", version: 2,
    }, context)).resolves.toEqual(current);
    expect(updateFollowup).not.toHaveBeenCalled();
  });

  it("completes an assigned follow-up with the authorized actor and text-free audit metadata", async () => {
    const appendAudit = vi.fn(async () => undefined);
    const dependencies = fixture({ repository: {
      findFollowup: vi.fn(async () => ({ ...followup(), assigneeId: "crm-owner", version: 2 })),
      updateFollowup: vi.fn(async () => true),
      appendAudit,
    } });

    await expect(dependencies.service.updateFollowup(customerId, followupId, {
      action: "complete", version: 2,
    }, context)).resolves.toEqual(expect.objectContaining({
      status: "completed",
      assigneeId: "crm-owner",
      completedById: context.actorId,
      completedAt: now,
      version: 3,
    }));
    expect(appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      action: "crm.followup.completed",
      metadata: { version: 3 },
    }));
    expect(JSON.stringify(appendAudit.mock.calls)).not.toContain("Call customer");
  });

  it("audits a denied service call before reading customer PII", async () => {
    const get = vi.fn();
    const appendDeniedAudit = vi.fn(async () => undefined);
    const dependencies = fixture({
      customerReader: { get },
      repository: { appendDeniedAudit },
    });

    await expect(dependencies.service.getCustomer(customerId, {
      actorId: "support-1",
      roles: ["support_operator"] as never,
      correlationId: "corr-denied",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(get).not.toHaveBeenCalled();
    expect(appendDeniedAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      actorId: "support-1",
      action: "crm.customer.read.denied",
      metadata: {},
    }));
    expect(JSON.stringify(appendDeniedAudit.mock.calls)).not.toContain("buyer@example.com");
  });

  it("returns all five authoritative segment counts at one calculation instant", async () => {
    const counts = new Map([
      ["new_customer", 1],
      ["first_time_buyer", 2],
      ["repeat_customer", 3],
      ["high_value", 4],
      ["inactive_90d", 5],
    ]);
    const listPaidSegmentCustomers = vi.fn(async (query: { segmentId: string }) => ({
      items: [], totalItems: counts.get(query.segmentId) ?? 0,
    }));
    const dependencies = fixture({ orderReader: { listPaidSegmentCustomers } });

    const result = await dependencies.service.listSegments(context);

    expect(result.calculatedAt).toBe(now);
    expect(result.items.map(({ id, customerCount }) => [id, customerCount])).toEqual([
      ["new_customer", 1],
      ["first_time_buyer", 2],
      ["repeat_customer", 3],
      ["high_value", 4],
      ["inactive_90d", 5],
    ]);
    expect(listPaidSegmentCustomers).toHaveBeenCalledTimes(5);
    expect(listPaidSegmentCustomers).toHaveBeenCalledWith(expect.objectContaining({
      asOf: now, page: 1, pageSize: 1,
    }));
  });
});

function fixture(overrides: {
  readonly repository?: Partial<CrmRepository>;
  readonly customerReader?: Partial<CustomerOperationsReader>;
  readonly orderReader?: Partial<CustomerOrderOperationsReader>;
} = {}) {
  const repository = {
    listNotes: vi.fn(async () => []),
    findNote: vi.fn(async () => undefined),
    createNote: vi.fn(async (_session: DatabaseSession, _value: CrmNote) => undefined),
    listFollowups: vi.fn(async () => []),
    findFollowup: vi.fn(async () => undefined),
    createFollowup: vi.fn(async (_session: DatabaseSession, value: Followup) => value),
    updateFollowup: vi.fn(async () => true),
    appendAudit: vi.fn(async () => undefined),
    appendDeniedAudit: vi.fn(async () => undefined),
    countOverdueFollowups: vi.fn(async () => 0),
    ...overrides.repository,
  } as unknown as CrmRepository;
  const customerReader = {
    search: vi.fn(async () => ({ items: [], totalItems: 0 })),
    get: vi.fn(async () => customerDetail()),
    getMany: vi.fn(async () => []),
    ...overrides.customerReader,
  } as unknown as CustomerOperationsReader;
  const orderReader = {
    listByCustomer: vi.fn(async () => []),
    getPaidCustomerFacts: vi.fn(async () => ({ paidOrderCount: 0, lifetimePaidVnd: 0 })),
    listPaidSegmentCustomers: vi.fn(async () => ({ items: [], totalItems: 0 })),
    ...overrides.orderReader,
  } as unknown as CustomerOrderOperationsReader;
  const transactions: TransactionRunner = {
    run: vi.fn((work) => work(session)),
    runReadOnly: vi.fn((work) => work(session)),
  };
  return {
    repository,
    transactions,
    service: new CrmService(
      repository,
      customerReader,
      orderReader,
      transactions,
      () => "b2700000-0000-4000-8000-000000000001",
      () => now,
    ),
  };
}

function customerDetail() {
  return {
    id: customerId,
    email: "buyer@example.com",
    fullName: "Nova Buyer",
    phoneNumber: "0901000001",
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    addresses: [{
      id: "address-1", recipientName: "Buyer", phoneNumber: "0901000001",
      addressLine: "1 Street", ward: "Ward", provinceOrCity: "HCMC", isDefault: true,
    }],
  };
}

function note(): CrmNote {
  return {
    id: noteId,
    customerId,
    authorId: "crm-operator-0",
    body: "Original preference",
    createdAt: "2026-08-09T00:00:00.000Z",
  };
}

function followup(): Followup {
  return {
    id: followupId,
    customerId,
    dueAt: "2026-08-11T00:00:00.000Z",
    description: "Call customer",
    status: "open",
    version: 1,
    createdById: "crm-operator-0",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
}
