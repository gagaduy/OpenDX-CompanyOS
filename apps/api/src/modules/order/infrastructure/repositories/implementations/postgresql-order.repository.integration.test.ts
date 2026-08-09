// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runCartMigrations } from "../../../../cart/infrastructure/database/run-cart-migrations";
import { runPromotionMigrations } from "../../../../promotion/infrastructure/database/run-promotion-migrations";
import { runCheckoutMigrations } from "../../../../checkout/infrastructure/database/run-checkout-migrations";
import { OrderService } from "../../../application/services/implementations/order.service";
import { CustomerOrderOperationsReaderService } from "../../../application/services/implementations/customer-order-operations-reader";
import type { Order } from "../../../domain/entities/order";
import type { OrderLine } from "../../../domain/entities/order-line";
import { runOrderMigrations } from "../../database/run-order-migrations";
import { PostgresqlOrderRepository } from "./postgresql-order.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const ids = {
  category: "b1100000-0000-4000-8000-000000000001",
  product: "b1200000-0000-4000-8000-000000000001",
  variant: "b1300000-0000-4000-8000-000000000001",
  customer: "b1400000-0000-4000-8000-000000000001",
  cart: "b1500000-0000-4000-8000-000000000001",
  checkout: "b1600000-0000-4000-8000-000000000001",
  order: "b1700000-0000-4000-8000-000000000001",
  line: "b1800000-0000-4000-8000-000000000001",
} as const;
const now = "2026-08-06T08:00:00.000Z";

describeWithDatabase("PostgresqlOrderRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  let sequence = 0;
  const service = new OrderService(
    new PostgresqlOrderRepository(), transactions,
    () => `b1900000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    () => now,
  );
  const operations = new CustomerOrderOperationsReaderService(
    new PostgresqlOrderRepository(),
    transactions,
  );

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCartMigrations(databaseUrl!, "up");
    await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up");
    await runOrderMigrations(databaseUrl!, "up");
  });

  beforeEach(async () => {
    sequence = 0;
    await pool.query("TRUNCATE orders, checkout_sessions, carts, customers, promotions, categories, audit_events CASCADE");
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
  });

  afterAll(async () => {
    await pool.query("TRUNCATE orders, checkout_sessions, carts, customers, promotions, categories, audit_events CASCADE");
    await runOrderMigrations(databaseUrl!, "down");
    await runCheckoutMigrations(databaseUrl!, "down", 999999);
    await runPromotionMigrations(databaseUrl!, "down");
    await runCartMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("persists immutable snapshots, owned reads, and idempotent transitions", async () => {
    const order: Order = {
      id: ids.order, publicNumber: "NVC-20260806-A1B2C3D4", customerId: ids.customer, checkoutId: ids.checkout,
      addressSnapshot: { addressId: "address-1", recipientName: "Buyer", phoneNumber: "0901", addressLine: "1 Street", ward: "Ward", provinceOrCity: "City", version: 1 },
      contactSnapshot: { email: "buyer@example.com" }, subtotalVnd: 100_000, discountVnd: 0, totalVnd: 100_000,
      currency: "VND", taxMode: "included_not_separated", status: "pending_payment", reservationExpiresAt: "2026-08-06T08:15:00.000Z",
      version: 1, createdAt: now, updatedAt: now,
    };
    const lines: readonly OrderLine[] = [{ id: ids.line, orderId: ids.order, variantId: ids.variant, sku: "NOVA-128", productTitle: "Nova Phone", variantLabel: "128 GB", quantity: 1, unitPriceVnd: 100_000, discountAllocationVnd: 0, lineTotalVnd: 100_000, linePosition: 0 }];
    const created = await transactions.run((session) => service.createPending(session, {
      customerId: order.customerId,
      checkoutId: order.checkoutId,
      addressSnapshot: order.addressSnapshot,
      contactSnapshot: order.contactSnapshot,
      subtotalVnd: order.subtotalVnd,
      discountVnd: order.discountVnd,
      totalVnd: order.totalVnd,
      reservationExpiresAt: order.reservationExpiresAt,
      lines: lines.map(({ id: _id, orderId: _orderId, ...line }) => line),
      actorType: "customer",
      actorId: ids.customer,
      idempotencyKey: "created",
      correlationId: "corr-created",
    }));
    await transactions.run((session) => service.transitionInSession(session, created.id, "paid", "provider", "sepay", "PAYMENT_CONFIRMED", "paid-1", "corr-paid", "2026-08-06T08:05:00.000Z"));
    const context = { actorId: "ops-1", roles: ["operations_manager"] as const, correlationId: "corr-processing" };
    const processed = await service.transition(created.id, { targetStatus: "processing", reasonCode: "PACKING_STARTED", version: 2, idempotencyKey: "processing-1" }, context);
    const replay = await service.transition(created.id, { targetStatus: "processing", reasonCode: "PACKING_STARTED", version: 2, idempotencyKey: "processing-1" }, context);

    expect(processed).toMatchObject({ status: "processing", version: 3, customerId: ids.customer, lines: [{ sku: "NOVA-128" }] });
    expect(replay).toMatchObject({ status: "processing", version: 3 });
    await expect(service.getForCustomer(ids.customer, created.id)).resolves.not.toHaveProperty("customerId");
    await expect(service.getForCustomer("b1400000-0000-4000-8000-000000000002", created.id)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    await expect(service.listForCustomer(ids.customer, { status: "processing", page: 1, pageSize: 20 })).resolves.toMatchObject({ totalItems: 1, items: [{ id: created.id }] });
    await expect(service.listForStaff({ status: "processing", page: 1, pageSize: 20 }, context)).resolves.toMatchObject({ totalItems: 1, items: [{ customerId: ids.customer, customerEmail: "buyer@example.com" }] });
    await expect(operations.listByCustomer(ids.customer, 10)).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        status: "processing",
        paidAt: "2026-08-06T08:05:00.000Z",
      }),
    ]);
    await expect(operations.getOwned(ids.customer, created.id)).resolves.toEqual(
      expect.objectContaining({ id: created.id, publicNumber: created.publicNumber }),
    );
    await expect(
      operations.getOwned("b1400000-0000-4000-8000-000000000002", created.id),
    ).resolves.toBeUndefined();
    const history = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM order_status_history WHERE order_id=$1", [created.id]);
    expect(history.rows[0]?.count).toBe("3");
    const snapshots = await pool.query<{ address_snapshot: { recipientName: string }; sku: string }>("SELECT o.address_snapshot,l.sku FROM orders o JOIN order_lines l ON l.order_id=o.id WHERE o.id=$1", [created.id]);
    expect(snapshots.rows[0]).toEqual({ address_snapshot: expect.objectContaining({ recipientName: "Buyer" }), sku: "NOVA-128" });
  });
});
