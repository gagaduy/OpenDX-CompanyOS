// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { CustomerOperationsReader } from "../../../../customer";
import type { CustomerOrderOperationsReader } from "../../../../order";
import type { SupportTicket } from "../../../domain/entities/support-ticket";
import type { SupportRepository } from "../../repositories/interfaces/support.repository";
import { SupportService } from "./support.service";

describe("SupportService", () => {
  it("does not allow a CRM operator to browse the support queue", async () => {
    const { service, repository } = fixture();

    await expect(service.list({ page: 1, pageSize: 20 }, { actorId: "crm", roles: ["crm_operator"], correlationId: "c" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("limits support queue browsing to available tickets or the operator assignee", async () => {
    const { service, repository } = fixture();

    await service.list({ page: 1, pageSize: 20 }, support("support-a"));

    expect(repository.list).toHaveBeenCalledWith(expect.anything(), { page: 1, pageSize: 20, availableOrAssigneeId: "support-a" });
  });

  it("rejects support operators working tickets assigned to a different operator", async () => {
    const { service } = fixture({ ticket: ticket({ assigneeId: "support-a", status: "assigned" }) });

    await expect(service.detail("ticket-1", support("support-b"))).rejects.toMatchObject({ code: "TICKET_NOT_OWNED" });
    await expect(service.transition("ticket-1", { status: "in_progress", version: 1, idempotencyKey: "move-1" }, support("support-b"))).rejects.toMatchObject({ code: "TICKET_NOT_OWNED" });
    await expect(service.appendMessage("ticket-1", "Investigating", support("support-b"))).rejects.toMatchObject({ code: "TICKET_NOT_OWNED" });
  });

  it("returns a stable order ownership error when the selected order belongs to another customer", async () => {
    const { service } = fixture({ ownedOrder: undefined });

    await expect(service.create({
      customerId: "customer-1",
      orderId: "order-1",
      subject: "Subject",
      description: "Description",
      priority: "normal",
    }, crm("crm-1"))).rejects.toMatchObject({ code: "ORDER_NOT_OWNED_BY_CUSTOMER" });
  });

  it("does not append messages to closed tickets", async () => {
    const { service, repository } = fixture({ ticket: ticket({ status: "closed" }) });

    await expect(service.appendMessage("ticket-1", "Follow up", support("support-a"))).rejects.toMatchObject({ code: "TICKET_CLOSED" });
    expect(repository.appendMessage).not.toHaveBeenCalled();
  });

  it("converges duplicate transition keys after locking the ticket and scoping by ticket", async () => {
    const { service, repository } = fixture({ ticket: ticket({ status: "in_progress", version: 2 }) });
    const findEventByKey = repository.findEventByKey as unknown as { mockResolvedValueOnce(value: Awaited<ReturnType<SupportRepository["findEventByKey"]>>): void };
    findEventByKey.mockResolvedValueOnce({ id: "event-1", ticketId: "ticket-1", actorId: "support-a", fromStatus: "assigned", toStatus: "in_progress", source: "manual", idempotencyKey: "move-1", occurredAt: at });

    const result = await service.transition("ticket-1", { status: "in_progress", version: 1, idempotencyKey: "move-1" }, support("support-a"));

    expect(result).toMatchObject({ id: "ticket-1", status: "in_progress", version: 2 });
    expect(repository.find).toHaveBeenCalledWith(expect.anything(), "ticket-1", true);
    expect(repository.findEventByKey).toHaveBeenCalledWith(expect.anything(), "ticket-1", "move-1");
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("allows administrator reassignment without a status transition", async () => {
    const { service, repository } = fixture({ ticket: ticket({ assigneeId: "support-a", status: "in_progress", version: 3 }) });

    const result = await service.reassign("ticket-1", { assigneeId: "support-b", version: 3, idempotencyKey: "reassign-1" }, admin());

    expect(result).toMatchObject({ assigneeId: "support-b", status: "in_progress", version: 4 });
    expect(repository.appendEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fromStatus: "in_progress", toStatus: "in_progress", idempotencyKey: "reassign-1" }));
  });
});

const at = "2026-08-10T00:00:00.000Z";

function fixture(options: { readonly ticket?: SupportTicket; readonly ownedOrder?: Awaited<ReturnType<CustomerOrderOperationsReader["getOwned"]>> } = {}) {
  const currentTicket = options.ticket ?? ticket();
  const repository = {
    create: vi.fn(async () => undefined),
    find: vi.fn(async () => currentTicket),
    list: vi.fn(async () => ({ items: [currentTicket], totalItems: 1 })),
    update: vi.fn(async () => true),
    appendEvent: vi.fn(async () => true),
    findEventByKey: vi.fn(async () => undefined),
    appendMessage: vi.fn(async () => undefined),
    listMessages: vi.fn(async () => []),
    listEvents: vi.fn(async () => []),
    createAttachment: vi.fn(async () => undefined),
    findAttachment: vi.fn(async () => undefined),
    countRetainedAttachments: vi.fn(async () => ({ count: 0, bytes: 0 })),
    claimAttachmentsForScan: vi.fn(async () => []),
    markAttachmentClean: vi.fn(async () => false),
    markAttachmentRejected: vi.fn(async () => false),
    claimAttachmentsForRetention: vi.fn(async () => []),
    markAttachmentDeleted: vi.fn(async () => false),
    appendAudit: vi.fn(async () => undefined),
    claimBreached: vi.fn(async () => []),
    countSummary: vi.fn(async () => ({ openTickets: 0, slaBreaches: 0 })),
    appendDeniedAudit: vi.fn(async () => undefined),
  } satisfies Record<keyof SupportRepository, ReturnType<typeof vi.fn>>;
  const customers = {
    get: vi.fn(async () => ({ id: "customer-1", email: "buyer@example.com" })),
    getSupportContext: vi.fn(async () => ({ id: "customer-1", email: "buyer@example.com" })),
  } as unknown as CustomerOperationsReader;
  const orders = {
    getOwned: vi.fn(async () => Object.hasOwn(options, "ownedOrder") ? options.ownedOrder : { id: "order-1", publicNumber: "NO-1", status: "paid", totalVnd: 1000, createdAt: at }),
  } as unknown as CustomerOrderOperationsReader;
  const transactions: TransactionRunner = {
    run: async work => work({ query: vi.fn() }),
    runReadOnly: async work => work({ query: vi.fn() }),
  };
  return {
    repository,
    service: new SupportService(repository, customers, orders, transactions, nextId(), () => at),
  };
}

function ticket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: "ticket-1",
    customerId: "customer-1",
    subject: "Subject",
    description: "Description",
    priority: "normal",
    status: "new",
    version: 1,
    createdById: "crm-1",
    slaPausedSeconds: 0,
    slaStoppedSeconds: 0,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function nextId() {
  let sequence = 0;
  return () => `id-${++sequence}`;
}

function admin() { return { actorId: "admin-1", roles: ["administrator" as const], correlationId: "c" }; }
function crm(actorId: string) { return { actorId, roles: ["crm_operator" as const], correlationId: "c" }; }
function support(actorId: string) { return { actorId, roles: ["support_operator" as const], correlationId: "c" }; }
