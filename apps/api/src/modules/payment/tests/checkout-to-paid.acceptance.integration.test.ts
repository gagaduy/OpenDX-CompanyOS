// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCartModule } from "../../cart";
import {
  createCatalogVariantReader,
  createStorefrontVariantReader,
} from "../../catalog";
import { createCheckoutModule } from "../../checkout";
import { createCustomerModule } from "../../customer";
import { createInventoryModule } from "../../inventory";
import { createOrderModule } from "../../order";
import { createPromotionModule } from "../../promotion";
import { runCartMigrations } from "../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "../../inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "../../order/infrastructure/database/run-order-migrations";
import { runPromotionMigrations } from "../../promotion/infrastructure/database/run-promotion-migrations";
import { seedPromotions } from "../../promotion/infrastructure/seeds/promotion.seed";
import {
  runCatalogMigrations,
  runCompanyCoreMigrations,
} from "../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import type {
  NormalizedPaymentNotification,
  PaymentGateway,
  ProviderOrderDetail,
} from "../application/providers/payment-gateway";
import { PaymentNotificationService } from "../application/services/implementations/payment-notification.service";
import { PaymentReconciliationService } from "../application/services/implementations/payment-reconciliation.service";
import { createPaymentModule } from "../payment.module";
import { runPaymentMigrations } from "../infrastructure/database/run-payment-migrations";
import { PostgresqlPaymentRepository } from "../infrastructure/repositories/implementations/postgresql-payment.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const startTime = "2026-08-09T08:00:00.000Z";
const expiredTime = "2026-08-09T08:16:00.000Z";
const ids = {
  category: "e0000000-0000-4000-8000-000000000001",
  product: "e0000000-0000-4000-8000-000000000002",
  variant: "e0000000-0000-4000-8000-000000000003",
  price: "e0000000-0000-4000-8000-000000000004",
  inventory: "e0000000-0000-4000-8000-000000000005",
  media: "e0000000-0000-4000-8000-000000000006",
} as const;

interface NotificationFixture {
  readonly notificationType: string;
  readonly providerEventId: string;
  readonly providerOrderId: string;
  readonly providerTransactionId: string;
  readonly invoiceNumber: string;
  readonly amountVnd: number;
  readonly currency: string;
}

describeWithDatabase("Phase 6 checkout-to-paid exit acceptance", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 40 });
  const transactions = new PostgresTransactionRunner(pool);
  const paymentRepository = new PostgresqlPaymentRepository();
  let currentTime = startTime;
  let providerDetail: ProviderOrderDetail | undefined;

  const gateway: PaymentGateway = {
    async createCheckout(request) {
      return {
        actionUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
        method: "POST",
        fields: [
          { name: "order_invoice_number", value: request.invoiceNumber },
          { name: "order_amount", value: String(request.amountVnd) },
        ],
      };
    },
    async getOrderDetail() {
      if (providerDetail === undefined) throw new Error("Provider detail missing");
      return providerDetail;
    },
    normalizeNotification(payload) {
      const fixture = payload as NotificationFixture;
      return {
        ...fixture,
        orderStatus: "CAPTURED",
        transactionStatus: "APPROVED",
        state: "paid",
        redactedPayload: { status: "CAPTURED" },
      } satisfies NormalizedPaymentNotification;
    },
  };
  const staffVerifier = {
    async verify() {
      return {
        sub: "acceptance-staff",
        name: "Acceptance Staff",
        realm_access: { roles: ["administrator"] },
      };
    },
  };
  const sessions = {
    createGuest: async () => ({
      rawToken: "acceptance-guest-token",
      principal: {
        guestSessionId: "e1000000-0000-4000-8000-000000000001",
        expiresAt: "2026-09-09T08:00:00.000Z",
      },
    }),
    resolveGuest: async () => ({
      guestSessionId: "e1000000-0000-4000-8000-000000000001",
      expiresAt: "2026-09-09T08:00:00.000Z",
    }),
    resolveCustomer: async () => ({
      rawToken: "acceptance-customer-token",
      principal: {
        customerId: customerId(1),
        sessionId: "e1000000-0000-4000-8000-000000000002",
        email: "buyer-1@example.com",
        expiresAt: "2026-09-09T08:00:00.000Z",
      },
    }),
  };
  const cookies = {
    guestName: "guest_session",
    customerName: "customer_session",
    csrfName: "storefront_csrf",
    secure: false,
  };
  const now = () => currentTime;
  const inventory = createInventoryModule({
    transactions,
    variantReader: createCatalogVariantReader(),
    staffTokenVerifier: staffVerifier,
    generateId: randomUUID,
    now,
    reservationTtlMs: 900_000,
    expiryIntervalMs: 30_000,
    onWorkerError: () => undefined,
  });
  const storefrontVariants = createStorefrontVariantReader(transactions);
  const customer = createCustomerModule({
    transactions,
    verifier: {
      async verify() {
        throw new Error("Authentication is outside this acceptance fixture");
      },
    },
    tokens: {
      generate: () => ({ raw: "fixture", hash: "f".repeat(64) }),
      hash: () => "f".repeat(64),
    },
    generateId: randomUUID,
    now,
    storefrontOrigin: "http://localhost:3100",
    cookies,
    authenticationRateLimit: 20,
    wishlistProducts: { async getPublishedByIds() { return []; } },
  });
  const cart = createCartModule({
    transactions,
    variants: storefrontVariants,
    availability: inventory.availability,
    sessions,
    storefrontOrigin: "http://localhost:3100",
    cookies,
    generateId: randomUUID,
    now,
  });
  const promotion = createPromotionModule({
    transactions,
    staffTokenVerifier: staffVerifier,
    generateId: randomUUID,
    now,
  });
  const order = createOrderModule({
    transactions,
    staffTokenVerifier: staffVerifier,
    customerSessions: sessions,
    cookies,
    generateId: randomUUID,
    now,
  });
  const payment = createPaymentModule({
    transactions,
    gateway,
    generateId: randomUUID,
    now,
  });
  const checkout = createCheckoutModule({
    transactions,
    carts: cart.checkoutReady,
    customers: customer.checkout,
    catalog: storefrontVariants,
    promotions: promotion.checkout,
    orders: order.checkout,
    payments: payment.checkout,
    inventory: inventory.reservations,
    sessions,
    cookies,
    storefrontOrigin: "http://localhost:3100",
    generateId: randomUUID,
    now,
    expirationMs: 900_000,
    expiryIntervalMs: 30_000,
    onWorkerError: () => undefined,
  });
  order.connectCancellation(checkout.cancellation);
  const notifications = new PaymentNotificationService(
    paymentRepository,
    gateway,
    order.checkout,
    inventory.reservations,
    promotion.checkout,
    checkout.paid,
    cart.paid,
    transactions,
    randomUUID,
    now,
  );
  const reconciliation = new PaymentReconciliationService(
    paymentRepository,
    gateway,
    notifications,
    transactions,
    randomUUID,
    now,
  );

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runInventoryMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCartMigrations(databaseUrl!, "up");
    await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up");
    await runOrderMigrations(databaseUrl!, "up");
    await runPaymentMigrations(databaseUrl!, "up");
  });

  beforeEach(async () => {
    currentTime = startTime;
    providerDetail = undefined;
    await pool.query(
      "TRUNCATE payments, orders, checkout_sessions, carts, customers, promotions, inventory_items, categories, audit_events CASCADE",
    );
    await seedBaseCommerce(pool);
    await seedPromotions(transactions);
  });

  afterAll(async () => {
    if (process.env.KEEP_ACCEPTANCE_DATABASE === "yes") {
      await pool.end();
      return;
    }
    await pool.query("TRUNCATE audit_events CASCADE");
    await runPaymentMigrations(databaseUrl!, "down");
    await runOrderMigrations(databaseUrl!, "down");
    await runCheckoutMigrations(databaseUrl!, "down", 999999);
    await runPromotionMigrations(databaseUrl!, "down");
    await runCartMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runInventoryMigrations(databaseUrl!, "down");
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("caps 20 racing checkouts at stock and applies one replayed paid event", async () => {
    await seedCustomers(pool, 21);
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) => createCheckout(index + 1)),
    );
    const completed = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof createCheckout>>> =>
        attempt.status === "fulfilled",
    );

    expect(completed).toHaveLength(10);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(10);
    await expectScalar("SELECT count(*) FROM orders", 10);
    await expectRow(
      "SELECT on_hand, reserved FROM inventory_items WHERE variant_id=$1",
      [ids.variant],
      { on_hand: 10, reserved: 10 },
    );

    const paidTarget = await paymentForOrder(completed[0]!.value.orderId);
    const paidPayload = notificationFor(paidTarget, "replayed-paid");
    const replay = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        notifications.process(paidPayload, `acceptance-replay-${index}`),
      ),
    );

    expect(replay.filter(({ result }) => result === "applied")).toHaveLength(1);
    expect(replay.filter(({ result }) => result === "already_processed")).toHaveLength(19);
    await expectAggregateConsistency(paidTarget.orderId, "paid");
    await expectScalar(
      "SELECT count(*) FROM payment_events WHERE processing_result='applied'",
      1,
    );
    await expectScalar(
      "SELECT count(*) FROM stock_movements WHERE movement_type='consume'",
      1,
    );
    await expectScalar(
      "SELECT count(*) FROM promotion_redemptions WHERE state='committed'",
      1,
    );
    await expectScalar(
      "SELECT count(*) FROM audit_events WHERE action='payment.paid'",
      1,
    );
    await expectRow(
      "SELECT on_hand, reserved FROM inventory_items WHERE variant_id=$1",
      [ids.variant],
      { on_hand: 9, reserved: 9 },
    );

    const mismatchTarget = await paymentForAnotherPendingOrder(paidTarget.orderId);
    const mismatch = await notifications.process(
      {
        ...notificationFor(mismatchTarget, "amount-mismatch"),
        amountVnd: mismatchTarget.amountVnd - 1,
      },
      "acceptance-mismatch",
    );
    expect(mismatch).toEqual({ result: "review_required" });
    await expectRow(
      "SELECT status FROM payments WHERE id=$1",
      [mismatchTarget.paymentId],
      { status: "pending_provider" },
    );
    await expectRow(
      "SELECT processing_result, failure_reason FROM payment_events WHERE provider_event_id='amount-mismatch'",
      [],
      { processing_result: "review_required", failure_reason: "AMOUNT_MISMATCH" },
    );

    await expect(
      createCheckout(21, customerAddressId(1)),
    ).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND" });
    await expectScalar(
      "SELECT count(*) FROM orders WHERE customer_id=$1",
      0,
      [customerId(21)],
    );
  });

  it("converges an IPN, reconciliation, and expiry race without partial state", async () => {
    await seedCustomers(pool, 1);
    const created = await createCheckout(1);
    const target = await paymentForOrder(created.orderId);
    const providerOrderId = `provider-${target.orderId}`;
    providerDetail = {
      providerOrderId,
      invoiceNumber: target.invoiceNumber,
      status: "CAPTURED",
      amountVnd: target.amountVnd,
      currency: "VND",
      transactionApproved: true,
      redactedEvidence: { status: "CAPTURED" },
    };
    currentTime = expiredTime;

    const race = await Promise.allSettled([
      notifications.process(
        notificationFor(target, "race-paid", providerOrderId),
        "acceptance-race-ipn",
      ),
      reconciliation.reconcile(
        target.paymentId,
        { providerOrderId },
        {
          actorId: "acceptance-finance",
          roles: ["finance_operator"],
          correlationId: "acceptance-race-reconciliation",
        },
      ),
      checkout.expiryService.expireDue(100),
    ]);
    const terminal = await pool.query<{
      order_status: "paid" | "expired";
      payment_status: "paid" | "expired";
      checkout_status: "completed" | "expired";
      reservation_status: "consumed" | "expired";
      promotion_status: "committed" | "released";
    }>(
      `SELECT o.status AS order_status, p.status AS payment_status,
              c.status AS checkout_status, r.status AS reservation_status,
              pr.state AS promotion_status
       FROM orders o
       JOIN payments p ON p.order_id=o.id
       JOIN checkout_sessions c ON c.id=o.checkout_id
       JOIN inventory_reservations r ON r.reference_type='order' AND r.reference_id=o.id::text
       JOIN promotion_redemptions pr ON pr.checkout_id=c.id
       WHERE o.id=$1`,
      [target.orderId],
    );
    const state = terminal.rows[0];
    expect(state).toBeDefined();
    if (state?.order_status === "paid") {
      expect(state).toEqual({
        order_status: "paid",
        payment_status: "paid",
        checkout_status: "completed",
        reservation_status: "consumed",
        promotion_status: "committed",
      });
    } else {
      expect(state).toEqual({
        order_status: "expired",
        payment_status: "expired",
        checkout_status: "expired",
        reservation_status: "expired",
        promotion_status: "released",
      });
    }
    const rejectedReasons = race.flatMap((result) =>
      result.status === "rejected" ? [String(result.reason)] : [],
    );
    if (state?.order_status === "paid") {
      expect(rejectedReasons).toEqual([]);
    } else {
      expect(rejectedReasons.length).toBeGreaterThanOrEqual(1);
      expect(
        rejectedReasons.every((reason) =>
          reason.includes("Inventory reservation has expired"),
        ),
      ).toBe(true);
      await expect(
        notifications.process(
          notificationFor(target, "race-paid-retry", providerOrderId),
          "acceptance-race-ipn-retry",
        ),
      ).resolves.toEqual({ result: "review_required" });
    }
    await expectScalar(
      "SELECT count(*) FROM stock_movements WHERE movement_type IN ('consume','expiry')",
      1,
    );
    await expectRow(
      "SELECT on_hand, reserved FROM inventory_items WHERE variant_id=$1",
      [ids.variant],
      state?.order_status === "paid"
        ? { on_hand: 9, reserved: 0 }
        : { on_hand: 10, reserved: 0 },
    );
  });

  it("creates one order per cart snapshot and preserves a cart changed before payment", async () => {
    await seedCustomers(pool, 1);
    const attempts = await Promise.allSettled([
      createCheckout(1),
      checkout.service.create(
        {
          addressId: customerAddressId(1),
          promotionCode: "NOVA10",
          idempotencyKey: "different-key-same-cart",
        },
        {
          customerId: customerId(1),
          customerExpiresAt: "2026-09-09T08:00:00.000Z",
          correlationId: "different-key-same-cart",
        },
      ),
    ]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expectScalar("SELECT count(*) FROM orders", 1);
    const created = attempts.find(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof createCheckout>>> =>
        attempt.status === "fulfilled",
    )!.value;
    const target = await paymentForOrder(created.orderId);
    await pool.query(
      "UPDATE carts SET version=version+1,updated_at=$2 WHERE id=$1",
      [fixtureId("c3", 1), "2026-08-09T08:01:00.000Z"],
    );
    await expect(
      notifications.process(
        notificationFor(target, "changed-cart-paid"),
        "changed-cart-paid",
      ),
    ).resolves.toEqual({ result: "applied" });
    await expectRow(
      "SELECT status,version FROM carts WHERE id=$1",
      [fixtureId("c3", 1)],
      { status: "active", version: 2 },
    );
  });

  it("converges pending-order cancellation against a paid IPN", async () => {
    await seedCustomers(pool, 1);
    const created = await createCheckout(1);
    const target = await paymentForOrder(created.orderId);
    const race = await Promise.allSettled([
      transactions.run((session) => checkout.cancellation.cancelInSession(session, {
        orderId: created.orderId,
        expectedVersion: 1,
        actorId: "acceptance-ops",
        reasonCode: "CUSTOMER_REQUEST",
        idempotencyKey: "acceptance-cancel",
        correlationId: "acceptance-cancel",
        now: startTime,
      })),
      notifications.process(
        notificationFor(target, "cancel-race-paid"),
        "cancel-race-paid",
      ),
    ]);
    expect(race.every(({ status }) => status === "fulfilled")).toBe(true);
    const state = await pool.query<{
      order_status: string;
      payment_status: string;
      checkout_status: string;
      reservation_status: string;
      promotion_status: string;
    }>(
      `SELECT o.status AS order_status,p.status AS payment_status,
              c.status AS checkout_status,r.status AS reservation_status,
              pr.state AS promotion_status
       FROM orders o
       JOIN payments p ON p.order_id=o.id
       JOIN checkout_sessions c ON c.id=o.checkout_id
       JOIN inventory_reservations r ON r.reference_type='order' AND r.reference_id=o.id::text
       JOIN promotion_redemptions pr ON pr.checkout_id=c.id
       WHERE o.id=$1`,
      [created.orderId],
    );
    expect([
      {
        order_status: "paid", payment_status: "paid",
        checkout_status: "completed", reservation_status: "consumed",
        promotion_status: "committed",
      },
      {
        order_status: "canceled", payment_status: "canceled",
        checkout_status: "canceled", reservation_status: "released",
        promotion_status: "released",
      },
    ]).toContainEqual(state.rows[0]);
    await expectScalar(
      "SELECT count(*) FROM stock_movements WHERE movement_type IN ('consume','release')",
      1,
    );
  });

  it("leaves one paid order as a backup and restore probe", async () => {
    await seedCustomers(pool, 1);
    const created = await createCheckout(1);
    const target = await paymentForOrder(created.orderId);

    await expect(
      notifications.process(
        notificationFor(target, "backup-paid"),
        "acceptance-backup-paid",
      ),
    ).resolves.toEqual({ result: "applied" });
    await expectAggregateConsistency(created.orderId, "paid");
    await expectScalar("SELECT count(*) FROM orders WHERE status='paid'", 1);
  });

  async function createCheckout(index: number, addressId = customerAddressId(index)) {
    return checkout.service.create(
      {
        addressId,
        promotionCode: "NOVA10",
        idempotencyKey: `acceptance-checkout-${index}`,
      },
      {
        customerId: customerId(index),
        customerExpiresAt: "2026-09-09T08:00:00.000Z",
        correlationId: `acceptance-checkout-${index}`,
      },
    );
  }

  async function paymentForOrder(orderId: string): Promise<PaymentTarget> {
    const result = await pool.query<PaymentRow>(
      `SELECT p.id AS payment_id, p.order_id, p.expected_amount_vnd,
              a.provider_invoice_number
       FROM payments p JOIN payment_attempts a ON a.id=p.active_attempt_id
       WHERE p.order_id=$1`,
      [orderId],
    );
    return mapPaymentTarget(result.rows[0]);
  }

  async function paymentForAnotherPendingOrder(excludedOrderId: string) {
    const result = await pool.query<PaymentRow>(
      `SELECT p.id AS payment_id, p.order_id, p.expected_amount_vnd,
              a.provider_invoice_number
       FROM payments p JOIN payment_attempts a ON a.id=p.active_attempt_id
       WHERE p.order_id<>$1 AND p.status='pending_provider' LIMIT 1`,
      [excludedOrderId],
    );
    return mapPaymentTarget(result.rows[0]);
  }

  async function expectAggregateConsistency(
    orderId: string,
    expectedStatus: "paid",
  ) {
    await expectRow(
      `SELECT o.status AS order_status, p.status AS payment_status,
              c.status AS checkout_status, r.status AS reservation_status,
              pr.state AS promotion_status, ca.status AS cart_status
       FROM orders o
       JOIN payments p ON p.order_id=o.id
       JOIN checkout_sessions c ON c.id=o.checkout_id
       JOIN carts ca ON ca.id=c.source_cart_id
       JOIN inventory_reservations r ON r.reference_type='order' AND r.reference_id=o.id::text
       JOIN promotion_redemptions pr ON pr.checkout_id=c.id
       WHERE o.id=$1`,
      [orderId],
      {
        order_status: expectedStatus,
        payment_status: expectedStatus,
        checkout_status: "completed",
        reservation_status: "consumed",
        promotion_status: "committed",
        cart_status: "checkout_ready",
      },
    );
  }

  async function expectScalar(
    query: string,
    expected: number,
    values: readonly unknown[] = [],
  ) {
    const result = await pool.query<{ count: string }>(query, [...values]);
    expect(Number(result.rows[0]?.count)).toBe(expected);
  }

  async function expectRow(
    query: string,
    values: readonly unknown[],
    expected: Readonly<Record<string, unknown>>,
  ) {
    const result = await pool.query(query, [...values]);
    expect(result.rows[0]).toEqual(expected);
  }
});

interface PaymentRow {
  readonly payment_id: string;
  readonly order_id: string;
  readonly expected_amount_vnd: string;
  readonly provider_invoice_number: string;
}

interface PaymentTarget {
  readonly paymentId: string;
  readonly orderId: string;
  readonly amountVnd: number;
  readonly invoiceNumber: string;
}

function mapPaymentTarget(row: PaymentRow | undefined): PaymentTarget {
  if (row === undefined) throw new Error("Payment fixture was not created");
  return {
    paymentId: row.payment_id,
    orderId: row.order_id,
    amountVnd: Number(row.expected_amount_vnd),
    invoiceNumber: row.provider_invoice_number,
  };
}

function notificationFor(
  target: PaymentTarget,
  eventId: string,
  providerOrderId = `provider-${target.orderId}`,
): NotificationFixture {
  return {
    notificationType: "ORDER_PAID",
    providerEventId: eventId,
    providerOrderId,
    providerTransactionId: `transaction-${eventId}`,
    invoiceNumber: target.invoiceNumber,
    amountVnd: target.amountVnd,
    currency: "VND",
  };
}

async function seedBaseCommerce(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO categories
       (id,name,slug,sort_order,status,version,created_at,updated_at)
     VALUES($1,'Acceptance technology','acceptance-technology',0,'active',1,$2,$2)`,
    [ids.category, startTime],
  );
  await pool.query(
    `INSERT INTO products
       (id,category_id,name,slug,description,status,version,created_at,updated_at)
     VALUES($1,$2,'Acceptance Phone','acceptance-phone','Acceptance product',
            'published',1,$3,$3)`,
    [ids.product, ids.category, startTime],
  );
  await pool.query(
    `INSERT INTO product_variants
       (id,product_id,sku,title,option_values,status,version,created_at,updated_at)
     VALUES($1,$2,'ACCEPT-PHONE-128','128 GB','{"storage":"128 GB"}',
            'active',1,$3,$3)`,
    [ids.variant, ids.product, startTime],
  );
  await pool.query(
    `INSERT INTO product_prices
       (id,variant_id,amount_minor,currency,tax_inclusive,valid_from,created_by)
     VALUES($1,$2,1000000,'VND',true,$3,'acceptance')`,
    [ids.price, ids.variant, startTime],
  );
  await pool.query(
    `INSERT INTO product_media
       (id,product_id,object_key,content_type,byte_size,alt_text,sort_order,
        is_primary,created_at)
     VALUES($1,$2,'acceptance/product.webp','image/webp',1,
            'Acceptance product image',0,true,$3)`,
    [ids.media, ids.product, startTime],
  );
  await pool.query(
    `INSERT INTO inventory_items
       (id,variant_id,on_hand,reserved,version,created_at,updated_at)
     VALUES($1,$2,10,0,1,$3,$3)`,
    [ids.inventory, ids.variant, startTime],
  );
}

async function seedCustomers(pool: Pool, count: number): Promise<void> {
  for (let index = 1; index <= count; index += 1) {
    await pool.query(
      `INSERT INTO customers
         (id,email,email_verified_at,full_name,status,version,created_at,updated_at)
       VALUES($1,$2,$3,'Acceptance Buyer','active',1,$3,$3)`,
      [customerId(index), `buyer-${index}@example.com`, startTime],
    );
    await pool.query(
      `INSERT INTO customer_addresses
         (id,customer_id,recipient_name,phone_number,address_line,ward,
          province_or_city,is_default,version,created_at,updated_at)
       VALUES($1,$2,'Acceptance Buyer','0900000000','1 Acceptance Street',
              'Acceptance Ward','Ha Noi',true,1,$3,$3)`,
      [customerAddressId(index), customerId(index), startTime],
    );
    await pool.query(
      `INSERT INTO carts
         (id,customer_id,status,version,expires_at,created_at,updated_at)
       VALUES($1,$2,'active',1,$3,$4,$4)`,
      [
        fixtureId("c3", index),
        customerId(index),
        "2026-09-09T08:00:00.000Z",
        startTime,
      ],
    );
    await pool.query(
      `INSERT INTO cart_items
         (id,cart_id,variant_id,quantity,last_validated_unit_price_vnd,
          created_at,updated_at)
       VALUES($1,$2,$3,1,$4,$5,$5)`,
      [
        fixtureId("c4", index),
        fixtureId("c3", index),
        ids.variant,
        1_000_000,
        startTime,
      ],
    );
  }
}

function customerId(index: number): string {
  return fixtureId("c1", index);
}

function customerAddressId(index: number): string {
  return fixtureId("c2", index);
}

function fixtureId(prefix: string, index: number): string {
  return `${prefix}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}
