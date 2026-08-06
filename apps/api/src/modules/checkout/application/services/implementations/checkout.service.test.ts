// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { CheckoutCatalogReader } from "../../../../catalog";
import type { CheckoutReadyCartReader } from "../../../../cart";
import type { CheckoutCustomerReader } from "../../../../customer";
import type { InventoryCheckoutPort } from "../../../../inventory";
import type { OrderCheckoutPort } from "../../../../order";
import { PaymentGatewayError, type PaymentCheckoutPort } from "../../../../payment";
import type { PromotionCheckoutPort } from "../../../../promotion";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { CheckoutAggregate, CheckoutRepository } from "../../repositories/interfaces/checkout.repository";
import { CheckoutService } from "./checkout.service";

const now = "2026-08-06T08:00:00.000Z";
const expiresAt = "2026-08-06T08:15:00.000Z";
const session: DatabaseSession = { query: vi.fn() };

function fixture() {
  let stored: CheckoutAggregate | undefined;
  const repository: CheckoutRepository = {
    create: vi.fn(async (_session, checkout, lines) => { stored = { checkout, lines }; }),
    findByCustomerAndKey: vi.fn(async () => stored),
    findOwnedById: vi.fn(async () => stored),
    applyPromotion: vi.fn(async (_session, checkout) => { stored = { checkout, lines: stored!.lines }; }),
    attachOrder: vi.fn(async (_session, checkout) => { stored = { checkout, lines: stored!.lines }; }),
    completePaid: vi.fn(async () => stored?.checkout),
    listDue: vi.fn(async () => []),
    markExpired: vi.fn(async () => true),
    appendAudit: vi.fn(),
  };
  const carts: CheckoutReadyCartReader = {
    getCheckoutReady: vi.fn(),
    lockForCheckout: vi.fn(async () => ({ cartId: "cart-1", cartVersion: 2, items: [{ cartItemId: "item-1", variantId: "variant-1", quantity: 2, lastValidatedUnitPriceVnd: 100_000 }] })),
  };
  const customers: CheckoutCustomerReader = { readOwnedAddress: vi.fn(async () => ({ customerId: "customer-1", contact: { email: "buyer@example.com" }, address: { addressId: "address-1", recipientName: "Buyer", phoneNumber: "0901", addressLine: "1 Street", ward: "Ward", provinceOrCity: "City", version: 1 } })) };
  const catalog: CheckoutCatalogReader = { getByIdsInSession: vi.fn(async () => new Map([["variant-1", { variantId: "variant-1", productId: "product-1", productName: "Phone", productSlug: "phone", variantTitle: "128 GB", sku: "NOVA-128", optionValues: {}, unitPriceVnd: 100_000, primaryMediaId: "media-1", primaryMediaAltText: "Phone" }]])) };
  const promotions: PromotionCheckoutPort = { hold: vi.fn(), commit: vi.fn(), release: vi.fn() };
  const order = { id: "order-1", publicNumber: "NVC-20260806-12345678", customerId: "customer-1", checkoutId: "checkout-1", addressSnapshot: { addressId: "address-1", recipientName: "Buyer", phoneNumber: "0901", addressLine: "1 Street", ward: "Ward", provinceOrCity: "City", version: 1 }, contactSnapshot: { email: "buyer@example.com" }, subtotalVnd: 200_000, discountVnd: 0, totalVnd: 200_000, currency: "VND" as const, taxMode: "included_not_separated" as const, status: "pending_payment" as const, reservationExpiresAt: expiresAt, version: 1, createdAt: now, updatedAt: now };
  const orders: OrderCheckoutPort = { createPending: vi.fn(async () => order), transitionInSession: vi.fn() };
  const inventory: InventoryCheckoutPort = {
    reserveInSession: vi.fn(async () => ({ referenceType: "order" as const, referenceId: "order-1", status: "active" as const, expiresAt, lines: [] })),
    releaseInSession: vi.fn(), consumeInSession: vi.fn(),
  };
  const payments: PaymentCheckoutPort = {
    createPending: vi.fn(async () => ({ paymentId: "payment-1", attemptId: "attempt-1", orderId: "order-1", invoiceNumber: "NVC-PAY-A1000000000040008000000000000001", expectedAmountVnd: 200_000, currency: "VND" as const, status: "created" as const, expiresAt })),
    initiate: vi.fn(async () => ({ paymentId: "payment-1", attemptId: "attempt-1", orderId: "order-1", invoiceNumber: "NVC-PAY-A1000000000040008000000000000001", expectedAmountVnd: 200_000, currency: "VND" as const, status: "pending_provider" as const, expiresAt, initiation: { actionUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init", method: "POST" as const, fields: [{ name: "signature", value: "signed" }] } })),
  };
  const transactions: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
  let sequence = 0;
  const service = new CheckoutService(repository, carts, customers, catalog, promotions, orders, payments, inventory, transactions, () => `id-${++sequence}`, () => now, 15 * 60 * 1000);
  const request = { addressId: "address-1", idempotencyKey: "checkout-key" };
  const context = { customerId: "customer-1", customerExpiresAt: "2026-09-01T00:00:00.000Z", correlationId: "corr-1" };
  return { catalog, customers, inventory, orders, payments, repository, request, context, service };
}

describe("CheckoutService", () => {
  it("creates one authoritative order/reservation/payment and safely replays", async () => {
    const { inventory, orders, payments, request, service, context } = fixture();
    const first = await service.create(request, context);
    const replay = await service.create(request, context);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({ status: "order_created", totalVnd: 200_000, orderId: "order-1", payment: { method: "POST" } });
    expect(orders.createPending).toHaveBeenCalledTimes(1);
    expect(inventory.reserveInSession).toHaveBeenCalledTimes(1);
    expect(payments.createPending).toHaveBeenCalledTimes(2);
  });

  it("rejects changed cart price before creating an order", async () => {
    const { catalog, orders, request, service, context } = fixture();
    vi.mocked(catalog.getByIdsInSession).mockResolvedValueOnce(new Map([["variant-1", { variantId: "variant-1", productId: "product-1", productName: "Phone", productSlug: "phone", variantTitle: "128 GB", sku: "NOVA-128", optionValues: {}, unitPriceVnd: 120_000, primaryMediaId: "media-1", primaryMediaAltText: "Phone" }]]));
    await expect(service.create(request, context)).rejects.toMatchObject({ code: "PRODUCT_CHANGED" });
    expect(orders.createPending).not.toHaveBeenCalled();
  });

  it("surfaces unavailable provider only after the durable transaction", async () => {
    const { payments, repository, request, service, context } = fixture();
    vi.mocked(payments.initiate).mockRejectedValueOnce(new PaymentGatewayError("not_configured", "Payment provider is not configured"));
    await expect(service.create(request, context)).rejects.toMatchObject({ code: "PAYMENT_PROVIDER_NOT_CONFIGURED" });
    expect(repository.attachOrder).toHaveBeenCalledOnce();
    await expect(service.get("id-1", context)).resolves.toMatchObject({ status: "order_created", orderId: "order-1" });
  });
});
