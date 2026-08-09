// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { PaymentGateway } from "../../providers/payment-gateway";
import { PaymentGatewayError } from "../../providers/payment-gateway";
import type { PaymentAggregate, PaymentRepository } from "../../repositories/interfaces/payment.repository";
import type { PaymentPaidTransitionPort } from "../interfaces/payment-paid-transition";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

const now = "2026-08-06T08:10:00.000Z";
const session: DatabaseSession = { query: vi.fn() };
const aggregate: PaymentAggregate = {
  payment: {
    id: "payment-1", orderId: "order-1", provider: "sepay",
    expectedAmountVnd: 100_000, currency: "VND", status: "pending_provider",
    activeAttemptId: "attempt-1", version: 2, createdAt: now, updatedAt: now,
  },
  activeAttempt: {
    id: "attempt-1", paymentId: "payment-1",
    providerInvoiceNumber: "NVC-PAY-A1000000000040008000000000000001",
    providerOrderId: "provider-order-1", state: "pending_provider",
    idempotencyKey: "key", expiresAt: "2026-08-06T08:15:00.000Z",
    createdAt: now, updatedAt: now,
  },
};

function fixture(providerStatus = "CAPTURED") {
  const reconciliations: Parameters<PaymentRepository["insertReconciliation"]>[1][] = [];
  const repository: PaymentRepository = {
    create: vi.fn(), findById: vi.fn(async () => aggregate),
    findByOrderId: vi.fn(async () => aggregate),
    findByInvoiceNumber: vi.fn(async () => aggregate), updateState: vi.fn(),
    insertEvent: vi.fn(async () => true), linkEvent: vi.fn(), updateEventResult: vi.fn(),
    list: vi.fn(async () => ({ items: [], totalItems: 0 })),
    listEvents: vi.fn(async () => []),
    listReconciliations: vi.fn(async () => reconciliations),
    insertReconciliation: vi.fn(async (_session, record) => { reconciliations.push(record); }),
    attachProviderOrderId: vi.fn(async () => true),
    listDuePending: vi.fn(async () => [aggregate]), appendAudit: vi.fn(),
  };
  const gateway: PaymentGateway = {
    createCheckout: vi.fn(), normalizeNotification: vi.fn(),
    getOrderDetail: vi.fn(async () => {
      return {
        providerOrderId: "provider-order-1",
        invoiceNumber: aggregate.activeAttempt.providerInvoiceNumber,
        status: providerStatus,
        amountVnd: 100_000,
        currency: "VND" as const,
        transactionApproved: providerStatus === "CAPTURED",
        redactedEvidence: { status: providerStatus },
      };
    }),
  };
  const paid: PaymentPaidTransitionPort = {
    applyTrustedInSession: vi.fn(async () => ({ result: "applied" as const })),
  };
  const transactions: TransactionRunner = {
    run: vi.fn(async (work) => {
      expect(gateway.getOrderDetail).toHaveBeenCalled();
      return work(session);
    }),
    runReadOnly: (work) => work(session),
  };
  let sequence = 0;
  const service = new PaymentReconciliationService(
    repository, gateway, paid, transactions, () => `id-${++sequence}`, () => now,
  );
  return { gateway, paid, reconciliations, repository, service };
}

const financeContext = {
  actorId: "finance-1",
  roles: ["finance_operator"],
  correlationId: "corr-1",
};

describe("PaymentReconciliationService", () => {
  it("returns redacted provider events as finance evidence", async () => {
    const current = fixture();
    vi.mocked(current.repository.listEvents).mockResolvedValueOnce([{
      id: "event-1",
      paymentId: "payment-1",
      attemptId: "attempt-1",
      provider: "sepay",
      authenticationResult: "authenticated",
      notificationType: "ORDER_PAID",
      providerEventId: "provider-event-1",
      providerOrderId: "provider-order-1",
      providerTransactionId: "transaction-1",
      providerInvoiceNumber: aggregate.activeAttempt.providerInvoiceNumber,
      amountVnd: 100_000,
      currency: "VND",
      redactedPayload: { status: "CAPTURED", card: "[REDACTED]" },
      payloadHash: "internal-hash",
      normalizedState: "paid",
      processingResult: "applied",
      correlationId: "corr-event",
      receivedAt: now,
      processedAt: now,
    }]);

    const detail = await current.service.get("payment-1", financeContext);

    expect(detail.events).toEqual([expect.objectContaining({
      id: "event-1",
      notificationType: "ORDER_PAID",
      processingResult: "applied",
      redactedPayload: { status: "CAPTURED", card: "[REDACTED]" },
    })]);
    expect(detail.events[0]).not.toHaveProperty("payloadHash");
    expect(detail.events[0]).not.toHaveProperty("authenticationResult");
  });

  it("persists exact evidence and reuses the trusted paid transition", async () => {
    const current = fixture();
    await current.service.reconcile("payment-1", {}, financeContext);
    expect(current.reconciliations[0]).toMatchObject({
      comparisonResult: "matched_paid",
      providerStatus: "CAPTURED",
    });
    expect(current.paid.applyTrustedInSession).toHaveBeenCalledOnce();
    expect(current.repository.attachProviderOrderId).toHaveBeenCalledWith(
      session,
      "attempt-1",
      "provider-order-1",
    );
    expect(current.repository.appendAudit).toHaveBeenCalledOnce();
  });

  it.each([
    ["PENDING", "still_pending"],
    ["CANCELED", "unsupported"],
  ] as const)("records provider %s without changing payment", async (status, result) => {
    const current = fixture(status);
    await current.service.reconcile("payment-1", {}, financeContext);
    expect(current.reconciliations[0]?.comparisonResult).toBe(result);
    expect(current.paid.applyTrustedInSession).not.toHaveBeenCalled();
  });

  it.each([
    "timeout",
    "unauthorized",
    "not_found",
    "provider_error",
    "invalid_response",
  ] as const)("records %s provider failures with no raw response", async (category) => {
    const current = fixture();
    vi.mocked(current.gateway.getOrderDetail).mockRejectedValueOnce(
      new PaymentGatewayError(category, "provider request failed"),
    );
    await current.service.reconcile("payment-1", {}, financeContext);
    expect(current.reconciliations[0]).toMatchObject({
      comparisonResult: "provider_error",
      providerStatus: category,
    });
    expect(current.reconciliations[0]?.redactedResponse).toBeUndefined();
  });

  it("flags amount and provider-order mismatches", async () => {
    const amount = fixture();
    vi.mocked(amount.gateway.getOrderDetail).mockResolvedValueOnce({
      providerOrderId: "provider-order-1",
      invoiceNumber: aggregate.activeAttempt.providerInvoiceNumber,
      status: "CAPTURED", amountVnd: 99_999, currency: "VND",
      transactionApproved: true, redactedEvidence: {},
    });
    await amount.service.reconcile("payment-1", {}, financeContext);
    expect(amount.reconciliations[0]?.comparisonResult).toBe("mismatch");
    expect(amount.repository.attachProviderOrderId).not.toHaveBeenCalled();

    const ownership = fixture();
    vi.mocked(ownership.gateway.getOrderDetail).mockResolvedValueOnce({
      providerOrderId: "another-order",
      invoiceNumber: aggregate.activeAttempt.providerInvoiceNumber,
      status: "CAPTURED", amountVnd: 100_000, currency: "VND",
      transactionApproved: true, redactedEvidence: {},
    });
    await ownership.service.reconcile("payment-1", {}, financeContext);
    expect(ownership.reconciliations[0]?.comparisonResult).toBe("mismatch");

    const invoice = fixture();
    vi.mocked(invoice.gateway.getOrderDetail).mockResolvedValueOnce({
      providerOrderId: "provider-order-1",
      invoiceNumber: "NVC-PAY-B1000000000040008000000000000001",
      status: "CAPTURED", amountVnd: 100_000, currency: "VND",
      transactionApproved: true, redactedEvidence: {},
    });
    await invoice.service.reconcile("payment-1", {}, financeContext);
    expect(invoice.reconciliations[0]?.comparisonResult).toBe("mismatch");
  });

  it("treats an already-paid race as an idempotent paid transition", async () => {
    const current = fixture();
    vi.mocked(current.paid.applyTrustedInSession).mockResolvedValueOnce({
      result: "already_processed",
    });
    await current.service.reconcile("payment-1", {}, financeContext);
    expect(current.reconciliations[0]?.comparisonResult).toBe("matched_paid");
    expect(current.paid.applyTrustedInSession).toHaveBeenCalledOnce();
  });

  it("enforces finance authorization and bounded worker batches", async () => {
    const current = fixture();
    await expect(
      current.service.list(
        { page: 1, pageSize: 20 },
        { ...financeContext, roles: ["catalog_manager"] },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(current.service.reconcileDue(101)).rejects.toThrow(
      "Invalid reconciliation batch limit",
    );
    await expect(current.service.reconcileDue(25)).resolves.toBe(1);
  });
});
