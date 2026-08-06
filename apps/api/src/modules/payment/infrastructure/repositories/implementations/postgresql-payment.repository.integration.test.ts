// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCartMigrations } from "../../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runOrderMigrations } from "../../../../order/infrastructure/database/run-order-migrations";
import { runPromotionMigrations } from "../../../../promotion/infrastructure/database/run-promotion-migrations";
import { PaymentService } from "../../../application/services/implementations/payment.service";
import type { PaymentGateway } from "../../../application/providers/payment-gateway";
import { runPaymentMigrations } from "../../database/run-payment-migrations";
import { PostgresqlPaymentRepository } from "./postgresql-payment.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const now = "2026-08-06T08:00:00.000Z";
const ids = {
  category: "c1100000-0000-4000-8000-000000000001",
  product: "c1200000-0000-4000-8000-000000000001",
  variant: "c1300000-0000-4000-8000-000000000001",
  customer: "c1400000-0000-4000-8000-000000000001",
  cart: "c1500000-0000-4000-8000-000000000001",
  checkout: "c1600000-0000-4000-8000-000000000001",
  order: "c1700000-0000-4000-8000-000000000001",
} as const;

describeWithDatabase("PostgresqlPaymentRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlPaymentRepository();
  const createCheckout: PaymentGateway["createCheckout"] = vi.fn(async ({ invoiceNumber }) => ({
    actionUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
    method: "POST" as const,
    fields: [{ name: "order_invoice_number", value: invoiceNumber }, { name: "signature", value: "must-not-be-persisted" }],
  }));
  const gateway: PaymentGateway = {
    createCheckout,
    getOrderDetail: vi.fn(),
    normalizeNotification: vi.fn(),
  };
  let sequence = 0;
  const service = new PaymentService(
    repository, transactions, gateway,
    () => `c1900000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    () => now,
  );

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCartMigrations(databaseUrl!, "up");
    await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up");
    await runOrderMigrations(databaseUrl!, "up");
    await runPaymentMigrations(databaseUrl!, "up");
  });

  beforeEach(async () => {
    sequence = 0;
    vi.clearAllMocks();
    await pool.query("TRUNCATE payments, orders, checkout_sessions, carts, customers, promotions, categories, audit_events CASCADE");
    await pool.query("INSERT INTO categories(id,name,slug,sort_order,status,version,created_at,updated_at) VALUES($1,'Phones','phones',0,'active',1,NOW(),NOW())", [ids.category]);
    await pool.query("INSERT INTO products(id,category_id,name,slug,description,status,version,created_at,updated_at) VALUES($1,$2,'Nova Phone','nova-phone','Phone','published',1,NOW(),NOW())", [ids.product, ids.category]);
    await pool.query("INSERT INTO product_variants(id,product_id,sku,title,option_values,status,version,created_at,updated_at) VALUES($1,$2,'NOVA-128','128 GB','{}','active',1,NOW(),NOW())", [ids.variant, ids.product]);
    await pool.query("INSERT INTO customers(id,email,email_verified_at,status,version,created_at,updated_at) VALUES($1,'buyer@example.com',NOW(),'active',1,NOW(),NOW())", [ids.customer]);
    await pool.query("INSERT INTO carts(id,customer_id,status,version,expires_at,created_at,updated_at) VALUES($1,$2,'active',1,'2026-08-07T00:00:00.000Z',$3,$3)", [ids.cart, ids.customer, now]);
    await pool.query(
      `INSERT INTO checkout_sessions
       (id,customer_id,source_cart_id,source_cart_version,address_snapshot,contact_snapshot,subtotal_vnd,discount_vnd,total_vnd,status,idempotency_key,request_fingerprint,expires_at,created_at,updated_at)
       VALUES($1,$2,$3,1,'{}','{}',100000,0,100000,'order_created','checkout-key',$4,'2026-08-06T08:15:00.000Z',$5,$5)`,
      [ids.checkout, ids.customer, ids.cart, "a".repeat(64), now],
    );
    await pool.query(
      `INSERT INTO orders
       (id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,subtotal_vnd,discount_vnd,total_vnd,status,reservation_expires_at,created_at,updated_at)
       VALUES($1,'NVC-20260806-C1700000',$2,$3,'{}','{}',100000,0,100000,'pending_payment','2026-08-06T08:15:00.000Z',$4,$4)`,
      [ids.order, ids.customer, ids.checkout, now],
    );
  });

  afterAll(async () => {
    await pool.query("TRUNCATE payments, orders, checkout_sessions, carts, customers, promotions, categories, audit_events CASCADE");
    await runPaymentMigrations(databaseUrl!, "down");
    await runOrderMigrations(databaseUrl!, "down");
    await runCheckoutMigrations(databaseUrl!, "down");
    await runPromotionMigrations(databaseUrl!, "down");
    await runCartMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("persists one replayable attempt and never persists checkout secrets", async () => {
    const request = {
      orderId: ids.order, expectedAmountVnd: 100_000, expiresAt: "2026-08-06T08:15:00.000Z",
      idempotencyKey: "checkout-key", actorId: ids.customer, correlationId: "corr-create",
    };
    const created = await transactions.run((session) => service.createPending(session, request));
    const replay = await transactions.run((session) => service.createPending(session, request));
    const initiated = await service.initiate({
      paymentId: created.paymentId, customerId: ids.customer, orderDescription: "Order NVC-20260806-C1700000",
      actorId: ids.customer, correlationId: "corr-initiate",
    });

    expect(replay).toEqual(created);
    expect(initiated).toMatchObject({ paymentId: created.paymentId, attemptId: created.attemptId, status: "pending_provider" });
    const stored = await pool.query<{ payment_count: string; attempt_count: string; database_text: string }>(
      `SELECT (SELECT count(*)::text FROM payments) AS payment_count,
              (SELECT count(*)::text FROM payment_attempts) AS attempt_count,
              concat_ws(' ',p.status,a.state,a.provider_invoice_number) AS database_text
       FROM payments p JOIN payment_attempts a ON a.id=p.active_attempt_id`,
    );
    expect(stored.rows[0]).toMatchObject({ payment_count: "1", attempt_count: "1" });
    expect(stored.rows[0]?.database_text).not.toMatch(/must-not-be-persisted|secret|signature/i);
    await expect(transactions.run((session) => service.createPending(session, { ...request, expectedAmountVnd: 99_999 }))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});
