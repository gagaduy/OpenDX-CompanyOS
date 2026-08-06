// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { PaymentGateway } from "../../providers/payment-gateway";
import type { PaymentAggregate, PaymentRepository } from "../../repositories/interfaces/payment.repository";
import { PaymentService } from "./payment.service";

const timestamp = "2026-08-06T08:00:00.000Z";
const expiresAt = "2026-08-06T08:15:00.000Z";
const session: DatabaseSession = { query: vi.fn() };

function fixture() {
  let aggregate: PaymentAggregate | undefined;
  const audits: string[] = [];
  const repository: PaymentRepository = {
    create: vi.fn(async (_session, payment, attempt) => { aggregate = { payment, activeAttempt: attempt }; }),
    findById: vi.fn(async () => aggregate),
    findByOrderId: vi.fn(async () => aggregate),
    findByInvoiceNumber: vi.fn(async () => aggregate),
    insertEvent: vi.fn(async () => true),
    linkEvent: vi.fn(),
    updateEventResult: vi.fn(),
    updateState: vi.fn(async (_session, payment, attempt, expectedVersion) => {
      if (aggregate?.payment.version !== expectedVersion) return false;
      aggregate = { payment, activeAttempt: attempt };
      return true;
    }),
    appendAudit: vi.fn(async (_session, entry) => { audits.push(entry.action); }),
  };
  const transactions: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
  const createCheckout: PaymentGateway["createCheckout"] = vi.fn(async ({ invoiceNumber }) => ({
      actionUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
      method: "POST" as const,
      fields: [{ name: "order_invoice_number", value: invoiceNumber }, { name: "signature", value: "synthetic-signature" }],
    }));
  const gateway: PaymentGateway = {
    createCheckout,
    getOrderDetail: vi.fn(),
    normalizeNotification: vi.fn(),
  };
  const ids = [
    "a1000000-0000-4000-8000-000000000001",
    "a1000000-0000-4000-8000-000000000002",
    "a1000000-0000-4000-8000-000000000003",
    "a1000000-0000-4000-8000-000000000004",
  ];
  const service = new PaymentService(repository, transactions, gateway, () => ids.shift()!, () => timestamp);
  const request = {
    orderId: "order-1", expectedAmountVnd: 100_000, expiresAt,
    idempotencyKey: "checkout-1", actorId: "customer-1", correlationId: "corr-1",
  };
  return { audits, gateway, repository, request, service };
}

describe("PaymentService", () => {
  it("creates one immutable payment attempt and replays the same request", async () => {
    const { repository, request, service } = fixture();
    const first = await service.createPending(session, request);
    const replay = await service.createPending(session, request);

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      status: "created", invoiceNumber: "NVC-PAY-A1000000000040008000000000000002",
      expectedAmountVnd: 100_000,
    });
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it("rejects changed payment facts under an existing order", async () => {
    const { request, service } = fixture();
    await service.createPending(session, request);
    await expect(service.createPending(session, { ...request, expectedAmountVnd: 99_999 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("signs after persistence and safely replays an unexpired initiation", async () => {
    const { audits, gateway, request, repository, service } = fixture();
    const pending = await service.createPending(session, request);
    const initiationRequest = { paymentId: pending.paymentId, customerId: "customer-1", orderDescription: "Order NVC-1", actorId: "customer-1", correlationId: "corr-init" };

    const first = await service.initiate(initiationRequest);
    const replay = await service.initiate(initiationRequest);

    expect(first).toEqual(replay);
    expect(first.status).toBe("pending_provider");
    expect(gateway.createCheckout).toHaveBeenCalledTimes(2);
    expect(repository.updateState).toHaveBeenCalledTimes(1);
    expect(audits).toEqual(["payment.created", "payment.initiated"]);
  });

  it("keeps a created attempt recoverable when provider initiation fails", async () => {
    const { gateway, request, repository, service } = fixture();
    const pending = await service.createPending(session, request);
    vi.mocked(gateway.createCheckout).mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(service.initiate({ paymentId: pending.paymentId, customerId: "customer-1", orderDescription: "Order NVC-1", actorId: "customer-1", correlationId: "corr-init" })).rejects.toThrow("provider unavailable");
    expect(repository.updateState).not.toHaveBeenCalled();
    await expect(service.createPending(session, request)).resolves.toMatchObject({ status: "created", attemptId: pending.attemptId });
  });
});
