// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { CheckoutCatalogReader } from "../../../../catalog";
import type { CheckoutReadyCartReader } from "../../../../cart";
import type { CheckoutCustomerReader } from "../../../../customer";
import type { InventoryCheckoutPort } from "../../../../inventory";
import type { OrderCheckoutPort } from "../../../../order";
import type { PaymentCheckoutPort, PendingPaymentDto } from "../../../../payment";
import { PaymentGatewayError } from "../../../../payment";
import type { PromotionCheckoutPort } from "../../../../promotion";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { CheckoutLine } from "../../../domain/entities/checkout-line";
import type { CheckoutSession } from "../../../domain/entities/checkout-session";
import { allocateOrderDiscount, calculateSubtotal } from "../../../domain/services/checkout-rules";
import type { CheckoutCreationDto, CheckoutCustomerContext, CheckoutDto, CreateCheckoutRequest } from "../../dtos/checkout.dto";
import { toCheckoutDto } from "../../mappers/checkout.mapper";
import type { CheckoutAggregate, CheckoutRepository } from "../../repositories/interfaces/checkout.repository";
import { CheckoutApplicationError } from "../checkout-application.error";
import type { CheckoutServiceContract } from "../interfaces/checkout.service";
import type { CheckoutPaidPort, CompletedCheckoutReference } from "../interfaces/checkout-paid-port";

interface CreatedCheckout { readonly aggregate: CheckoutAggregate; readonly payment: PendingPaymentDto; }

export class CheckoutService implements CheckoutServiceContract, CheckoutPaidPort {
  constructor(
    private readonly repository: CheckoutRepository,
    private readonly carts: CheckoutReadyCartReader,
    private readonly customers: CheckoutCustomerReader,
    private readonly catalog: CheckoutCatalogReader,
    private readonly promotions: PromotionCheckoutPort,
    private readonly orders: OrderCheckoutPort,
    private readonly payments: PaymentCheckoutPort,
    private readonly inventory: InventoryCheckoutPort,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
    private readonly expirationMs: number,
  ) {}

  async create(request: CreateCheckoutRequest, context: CheckoutCustomerContext): Promise<CheckoutCreationDto> {
    const created = await this.transactions.run((session) => this.createInSession(session, request, context));
    return this.initiate(created, context);
  }

  async get(checkoutId: string, context: CheckoutCustomerContext): Promise<CheckoutDto> {
    const aggregate = await this.transactions.runReadOnly((session) => this.repository.findOwnedById(session, context.customerId, checkoutId));
    if (aggregate === undefined || aggregate.checkout.status === "created") throw new CheckoutApplicationError("CHECKOUT_NOT_FOUND", "Checkout not found");
    return toCheckoutDto(aggregate);
  }

  async initiatePayment(checkoutId: string, context: CheckoutCustomerContext): Promise<CheckoutCreationDto> {
    const created = await this.transactions.run(async (session) => {
      const aggregate = await this.repository.findOwnedById(session, context.customerId, checkoutId);
      if (aggregate === undefined || aggregate.checkout.orderId === undefined || aggregate.checkout.status !== "order_created") throw new CheckoutApplicationError("CHECKOUT_NOT_FOUND", "Pending checkout not found");
      if (Date.parse(aggregate.checkout.expiresAt) <= Date.parse(this.now())) throw new CheckoutApplicationError("CHECKOUT_EXPIRED", "Checkout expired");
      const payment = await this.payments.createPending(session, {
        orderId: aggregate.checkout.orderId, expectedAmountVnd: aggregate.checkout.totalVnd,
        expiresAt: aggregate.checkout.expiresAt, idempotencyKey: aggregate.checkout.idempotencyKey,
        actorId: context.customerId, correlationId: context.correlationId,
      });
      return { aggregate, payment };
    });
    return this.initiate(created, context);
  }

  async completePaid(session: Parameters<CheckoutPaidPort["completePaid"]>[0], checkoutId: string, orderId: string, now: string): Promise<CompletedCheckoutReference> {
    const checkout = await this.repository.completePaid(session, checkoutId, orderId, now);
    if (checkout === undefined) throw new CheckoutApplicationError("CHECKOUT_NOT_FOUND", "Pending checkout not found");
    return { checkoutId, cartId: checkout.sourceCartId, cartVersion: checkout.sourceCartVersion, customerId: checkout.customerId };
  }

  private async createInSession(session: Parameters<CheckoutRepository["create"]>[0], request: CreateCheckoutRequest, context: CheckoutCustomerContext): Promise<CreatedCheckout> {
    const timestamp = this.now();
    const expiresAt = new Date(Date.parse(timestamp) + this.expirationMs).toISOString();
    const cart = await this.carts.lockForCheckout(session, context.customerId, context.customerExpiresAt);
    const fingerprint = createFingerprint(request, cart.cartVersion);
    const existing = await this.repository.findByCustomerAndKey(session, context.customerId, request.idempotencyKey, true);
    if (existing !== undefined) {
      if (existing.checkout.requestFingerprint !== fingerprint || existing.checkout.orderId === undefined) throw new CheckoutApplicationError("IDEMPOTENCY_CONFLICT", "Checkout key belongs to another request");
      const payment = await this.payments.createPending(session, {
        orderId: existing.checkout.orderId, expectedAmountVnd: existing.checkout.totalVnd,
        expiresAt: existing.checkout.expiresAt, idempotencyKey: request.idempotencyKey,
        actorId: context.customerId, correlationId: context.correlationId,
        ...(request.paymentMethod === undefined ? {} : { paymentMethod: request.paymentMethod }),
      });
      return { aggregate: existing, payment };
    }
    const existingSnapshot = await this.repository.findByCartSnapshot(
      session,
      cart.cartId,
      cart.cartVersion,
      true,
    );
    if (existingSnapshot !== undefined) {
      throw new CheckoutApplicationError(
        "CART_ALREADY_CHECKED_OUT",
        "This cart version already belongs to another checkout",
      );
    }
    const [customer, variants] = await Promise.all([
      this.customers.readOwnedAddress(session, context.customerId, request.addressId),
      this.catalog.getByIdsInSession(session, cart.items.map((item) => item.variantId)),
    ]);
    const checkoutId = this.generateId();
    const lines: CheckoutLine[] = cart.items.map((item, position) => {
      const variant = variants.get(item.variantId);
      if (variant === undefined || variant.unitPriceVnd !== item.lastValidatedUnitPriceVnd) throw new CheckoutApplicationError("PRODUCT_CHANGED", "Product availability or price changed");
      const lineSubtotalVnd = variant.unitPriceVnd * item.quantity;
      return { id: this.generateId(), checkoutId, variantId: item.variantId, sku: variant.sku, productTitle: variant.productName, variantLabel: variant.variantTitle, quantity: item.quantity, unitPriceVnd: variant.unitPriceVnd, lineSubtotalVnd, linePosition: position };
    });
    const subtotalVnd = calculateSubtotal(lines);
    let checkout: CheckoutSession = {
      id: checkoutId, customerId: context.customerId, sourceCartId: cart.cartId, sourceCartVersion: cart.cartVersion,
      addressSnapshot: customer.address, contactSnapshot: customer.contact,
      subtotalVnd, discountVnd: 0, totalVnd: subtotalVnd, currency: "VND", taxMode: "included_not_separated",
      status: "created", idempotencyKey: request.idempotencyKey, requestFingerprint: fingerprint,
      expiresAt, createdAt: timestamp, updatedAt: timestamp,
    };
    await this.repository.create(session, checkout, lines);
    if (request.promotionCode !== undefined) {
      const held = await this.promotions.hold(session, { code: request.promotionCode, customerId: context.customerId, checkoutId, subtotalVnd, idempotencyKey: request.idempotencyKey, expiresAt, correlationId: context.correlationId, now: timestamp });
      checkout = { ...checkout, promotionId: held.promotionId, promotionCode: held.code, promotionVersion: held.version, discountVnd: held.discountVnd, totalVnd: held.totalVnd };
      await this.repository.applyPromotion(session, checkout);
    }
    const allocations = allocateOrderDiscount(lines.map((line) => line.lineSubtotalVnd), checkout.discountVnd);
    const order = await this.orders.createPending(session, {
      customerId: context.customerId, checkoutId, addressSnapshot: customer.address, contactSnapshot: customer.contact,
      ...(checkout.promotionCode === undefined ? {} : { promotionCode: checkout.promotionCode }),
      subtotalVnd, discountVnd: checkout.discountVnd, totalVnd: checkout.totalVnd, reservationExpiresAt: expiresAt,
      lines: lines.map((line, index) => ({ variantId: line.variantId, sku: line.sku, productTitle: line.productTitle, variantLabel: line.variantLabel, quantity: line.quantity, unitPriceVnd: line.unitPriceVnd, discountAllocationVnd: allocations[index]!, lineTotalVnd: line.lineSubtotalVnd - allocations[index]!, linePosition: line.linePosition })),
      actorType: "customer", actorId: context.customerId, idempotencyKey: `order:${request.idempotencyKey}`, correlationId: context.correlationId,
    });
    const reservation = await this.inventory.reserveInSession(session, { referenceType: "order", referenceId: order.id, expiresAt, lines: lines.map(({ variantId, quantity }) => ({ variantId, quantity })) }, { actorType: "system", actorId: "system:checkout", correlationId: context.correlationId });
    if (reservation.expiresAt !== expiresAt) throw new Error("Checkout and inventory expiration are inconsistent");
    const payment = await this.payments.createPending(session, { orderId: order.id, expectedAmountVnd: checkout.totalVnd, expiresAt, idempotencyKey: request.idempotencyKey, actorId: context.customerId, correlationId: context.correlationId, ...(request.paymentMethod === undefined ? {} : { paymentMethod: request.paymentMethod }) });
    checkout = { ...checkout, orderId: order.id, status: "order_created", updatedAt: timestamp };
    await this.repository.attachOrder(session, checkout);
    await this.repository.appendAudit(session, { id: this.generateId(), actorId: context.customerId, action: "checkout.order.created", resourceId: checkout.id, correlationId: context.correlationId, metadata: { orderId: order.id, totalVnd: checkout.totalVnd }, occurredAt: timestamp });
    return { aggregate: { checkout, lines }, payment };
  }

  private async initiate(created: CreatedCheckout, context: CheckoutCustomerContext): Promise<CheckoutCreationDto> {
    try {
      const initiation = await this.payments.initiate({ paymentId: created.payment.paymentId, customerId: context.customerId, orderDescription: `NovaCommerce order ${created.aggregate.checkout.orderId}`, actorId: context.customerId, correlationId: context.correlationId });
      return { ...toCheckoutDto(created.aggregate), payment: initiation.initiation };
    } catch (error) {
      if (error instanceof PaymentGatewayError && error.category === "not_configured") throw new CheckoutApplicationError("PAYMENT_PROVIDER_NOT_CONFIGURED", "Payment provider is not configured");
      throw error;
    }
  }
}
function createFingerprint(request: CreateCheckoutRequest, cartVersion: number): string {
  return createHash("sha256").update(JSON.stringify({ addressId: request.addressId, cartVersion, promotionCode: request.promotionCode?.trim().toUpperCase() ?? null, paymentMethod: request.paymentMethod ?? null })).digest("hex");
}
