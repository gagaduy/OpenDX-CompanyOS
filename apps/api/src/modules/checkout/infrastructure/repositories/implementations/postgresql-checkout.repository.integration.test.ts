// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createCatalogVariantReader, type CheckoutCatalogReader } from "../../../../catalog";
import type { CheckoutReadyCartReader } from "../../../../cart";
import { CartService } from "../../../../cart/application/services/implementations/cart.service";
import { PostgresqlCartRepository } from "../../../../cart/infrastructure/repositories/implementations/postgresql-cart.repository";
import type { CheckoutCustomerReader } from "../../../../customer";
import { InventoryReservationService } from "../../../../inventory/application/services/implementations/inventory-reservation.service";
import { PostgresqlInventoryRepository } from "../../../../inventory/infrastructure/repositories/implementations/postgresql-inventory.repository";
import { PostgresqlInventoryAuditRepository } from "../../../../inventory/infrastructure/repositories/implementations/postgresql-inventory-audit.repository";
import { OrderService } from "../../../../order/application/services/implementations/order.service";
import { PostgresqlOrderRepository } from "../../../../order/infrastructure/repositories/implementations/postgresql-order.repository";
import { PaymentService } from "../../../../payment/application/services/implementations/payment.service";
import { PaymentNotificationService } from "../../../../payment/application/services/implementations/payment-notification.service";
import { PaymentReconciliationService } from "../../../../payment/application/services/implementations/payment-reconciliation.service";
import type { PaymentGateway } from "../../../../payment";
import { SePayPaymentGateway } from "../../../../payment";
import { PostgresqlPaymentRepository } from "../../../../payment/infrastructure/repositories/implementations/postgresql-payment.repository";
import type { PromotionCheckoutPort } from "../../../../promotion";
import { runCartMigrations } from "../../../../cart/infrastructure/database/run-cart-migrations";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "../../../../inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "../../../../order/infrastructure/database/run-order-migrations";
import { runPaymentMigrations } from "../../../../payment/infrastructure/database/run-payment-migrations";
import { runPromotionMigrations } from "../../../../promotion/infrastructure/database/run-promotion-migrations";
import { runCatalogMigrations, runCompanyCoreMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { CheckoutService } from "../../../application/services/implementations/checkout.service";
import { CheckoutExpiryService } from "../../../application/services/implementations/checkout-expiry.service";
import { runCheckoutMigrations } from "../../database/run-checkout-migrations";
import { PostgresqlCheckoutRepository } from "./postgresql-checkout.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const now = "2026-08-06T08:00:00.000Z";
const variantId = "d1300000-0000-4000-8000-000000000001";
const customers = ["d1400000-0000-4000-8000-000000000001", "d1400000-0000-4000-8000-000000000002"] as const;
const carts = ["d1500000-0000-4000-8000-000000000001", "d1500000-0000-4000-8000-000000000002"] as const;

suite("atomic checkout PostgreSQL orchestration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const cartReader: CheckoutReadyCartReader = {
    getCheckoutReady: vi.fn(),
    lockForCheckout: vi.fn(async (_session, customerId) => ({ cartId: carts[customerId === customers[0] ? 0 : 1], cartVersion: 1, items: [{ cartItemId: randomUUID(), variantId, quantity: 1, lastValidatedUnitPriceVnd: 100_000 }] })),
  };
  const customerReader: CheckoutCustomerReader = { readOwnedAddress: vi.fn(async (_session, customerId) => ({ customerId, contact: { email: `${customerId}@example.com` }, address: { addressId: "d1410000-0000-4000-8000-000000000001", recipientName: "Buyer", phoneNumber: "0901", addressLine: "1 Street", ward: "Ward", provinceOrCity: "City", version: 1 } })) };
  const catalog: CheckoutCatalogReader = { getByIdsInSession: vi.fn(async () => new Map([[variantId, { variantId, productId: "d1200000-0000-4000-8000-000000000001", productName: "Nova Phone", productSlug: "nova-phone", variantTitle: "128 GB", sku: "NOVA-128", optionValues: {}, unitPriceVnd: 100_000, primaryMediaId: "d1250000-0000-4000-8000-000000000001", primaryMediaAltText: "Phone" }]])) };
  const promotions: PromotionCheckoutPort = { hold: vi.fn(), commit: vi.fn(), release: vi.fn() };

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up"); await runCompanyCoreMigrations(databaseUrl!, "up"); await runInventoryMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up"); await runCartMigrations(databaseUrl!, "up"); await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up"); await runOrderMigrations(databaseUrl!, "up"); await runPaymentMigrations(databaseUrl!, "up");
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE payments,orders,checkout_sessions,carts,customers,promotions,inventory_items,categories,audit_events CASCADE");
    await pool.query("INSERT INTO categories(id,name,slug,sort_order,status,version,created_at,updated_at) VALUES('d1100000-0000-4000-8000-000000000001','Phones','phones',0,'active',1,$1,$1)", [now]);
    await pool.query("INSERT INTO products(id,category_id,name,slug,description,status,version,created_at,updated_at) VALUES('d1200000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000001','Nova Phone','nova-phone','Phone','published',1,$1,$1)", [now]);
    await pool.query("INSERT INTO product_variants(id,product_id,sku,title,option_values,status,version,created_at,updated_at) VALUES($1,'d1200000-0000-4000-8000-000000000001','NOVA-128','128 GB','{\"Storage\":\"128 GB\"}','active',1,$2,$2)", [variantId, now]);
    for (let index=0; index<customers.length; index++) {
      await pool.query("INSERT INTO customers(id,email,email_verified_at,status,version,created_at,updated_at) VALUES($1,$2,$3,'active',1,$3,$3)", [customers[index], `buyer${index}@example.com`, now]);
      await pool.query("INSERT INTO carts(id,customer_id,status,version,expires_at,created_at,updated_at) VALUES($1,$2,'active',1,'2026-09-01T00:00:00.000Z',$3,$3)", [carts[index], customers[index], now]);
    }
    await pool.query("INSERT INTO inventory_items(id,variant_id,on_hand,reserved,version,created_at,updated_at) VALUES('d1350000-0000-4000-8000-000000000001',$1,1,0,1,$2,$2)", [variantId, now]);
  });
  afterAll(async () => {
    await pool.query("TRUNCATE payments,orders,checkout_sessions,carts,customers,promotions,inventory_items,categories,audit_events CASCADE");
    await runPaymentMigrations(databaseUrl!,"down"); await runOrderMigrations(databaseUrl!,"down"); await runCheckoutMigrations(databaseUrl!,"down",999999); await runPromotionMigrations(databaseUrl!,"down"); await runCartMigrations(databaseUrl!,"down"); await runCustomerMigrations(databaseUrl!,"down"); await runInventoryMigrations(databaseUrl!,"down"); await runCompanyCoreMigrations(databaseUrl!,"down"); await runCatalogMigrations(databaseUrl!,"down"); await pool.end();
  });

  it("lets one scarce-stock checkout commit and rolls the loser back without orphans", async () => {
    const inventory = new InventoryReservationService(new PostgresqlInventoryRepository(), createCatalogVariantReader(), new PostgresqlInventoryAuditRepository(), transactions, randomUUID, () => now, 900_000);
    const order = new OrderService(new PostgresqlOrderRepository(), transactions, randomUUID, () => now);
    const gateway: PaymentGateway = {
      createCheckout: vi.fn(async ({ invoiceNumber }) => {
        const committed = await pool.query("SELECT 1 FROM payment_attempts WHERE provider_invoice_number=$1", [invoiceNumber]);
        if (committed.rowCount !== 1) throw new Error("Payment initiation ran before commit");
        return { actionUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init", method: "POST" as const, fields: [{ name: "signature", value: "synthetic" }] };
      }), getOrderDetail: vi.fn(), normalizeNotification: vi.fn(),
    };
    const payment = new PaymentService(new PostgresqlPaymentRepository(), transactions, gateway, randomUUID, () => now);
    const checkout = new CheckoutService(new PostgresqlCheckoutRepository(), cartReader, customerReader, catalog, promotions, order, payment, inventory, transactions, randomUUID, () => now, 900_000);
    const results = await Promise.allSettled(customers.map((customerId, index) => checkout.create({ addressId: "d1410000-0000-4000-8000-000000000001", idempotencyKey: `checkout-key-${index}` }, { customerId, customerExpiresAt: "2026-09-01T00:00:00.000Z", correlationId: `corr-${index}` })));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const counts = await pool.query<{ checkouts:string; orders:string; payments:string; reservations:string; reserved:number }>("SELECT (SELECT count(*)::text FROM checkout_sessions) checkouts,(SELECT count(*)::text FROM orders) orders,(SELECT count(*)::text FROM payments) payments,(SELECT count(*)::text FROM inventory_reservations) reservations,(SELECT reserved FROM inventory_items WHERE variant_id=$1) reserved", [variantId]);
    expect(counts.rows[0]).toEqual({ checkouts:"1", orders:"1", payments:"1", reservations:"1", reserved:1 });
  });

  it("converges twenty duplicate IPNs to one complete paid transition", async () => {
    const inventory = new InventoryReservationService(new PostgresqlInventoryRepository(), createCatalogVariantReader(), new PostgresqlInventoryAuditRepository(), transactions, randomUUID, () => now, 900_000);
    const order = new OrderService(new PostgresqlOrderRepository(), transactions, randomUUID, () => now);
    const gateway = new SePayPaymentGateway({ checkoutUrl:"https://pay-sandbox.sepay.vn/v1/checkout/init",apiBaseUrl:"https://pgapi-sandbox.sepay.vn",merchantId:"merchant",secretKey:"secret",successUrl:"https://example.test/success",errorUrl:"https://example.test/error",cancelUrl:"https://example.test/cancel",requestTimeoutMs:1000 });
    const paymentRepository = new PostgresqlPaymentRepository();
    const payment = new PaymentService(paymentRepository, transactions, gateway, randomUUID, () => now);
    const checkout = new CheckoutService(new PostgresqlCheckoutRepository(), cartReader, customerReader, catalog, promotions, order, payment, inventory, transactions, randomUUID, () => now, 900_000);
    await checkout.create({ addressId:"d1410000-0000-4000-8000-000000000001",idempotencyKey:"checkout-paid" }, { customerId:customers[0],customerExpiresAt:"2026-09-01T00:00:00.000Z",correlationId:"corr-checkout" });
    const persisted = await pool.query<{provider_invoice_number:string;order_id:string}>("SELECT a.provider_invoice_number,p.order_id FROM payment_attempts a JOIN payments p ON p.id=a.payment_id");
    const invoice = persisted.rows[0]!.provider_invoice_number;
    const cartPaid = new CartService(new PostgresqlCartRepository(), { getByIds:vi.fn(async()=>new Map()) }, { getByVariantIds:vi.fn(async()=>new Map()) }, transactions, randomUUID, () => now);
    const notification = new PaymentNotificationService(paymentRepository,gateway,order,inventory,promotions,checkout,cartPaid,transactions,randomUUID,()=>"2026-08-06T08:05:00.000Z");
    const payload={timestamp:1757058220,notification_type:"ORDER_PAID",order:{id:"provider-event",order_id:"SEPAY-ORDER-1",order_status:"CAPTURED",order_currency:"VND",order_amount:"100000.00",order_invoice_number:invoice,ip_address:"14.1.2.3"},transaction:{id:"provider-event-transaction",transaction_id:"SEPAY-TXN-1",transaction_status:"APPROVED",transaction_amount:"100000",transaction_currency:"VND",card_number:"4111XXXXXXXX1111"},customer:{customer_id:customers[0]}};
    const results=await Promise.all(Array.from({length:20},(_,index)=>notification.process(payload,`corr-ipn-${index}`)));
    expect(results.filter(({result})=>result==="applied")).toHaveLength(1);
    expect(results.filter(({result})=>result==="already_processed")).toHaveLength(19);
    const states=await pool.query<{payment_status:string;order_status:string;checkout_status:string;cart_status:string;reservation_status:string;events:string;consume_movements:string;paid_audits:string}>(`SELECT p.status payment_status,o.status order_status,c.status checkout_status,cart.status cart_status,r.status reservation_status,(SELECT count(*)::text FROM payment_events) events,(SELECT count(*)::text FROM stock_movements WHERE movement_type='consume') consume_movements,(SELECT count(*)::text FROM audit_events WHERE action='payment.paid') paid_audits FROM payments p JOIN orders o ON o.id=p.order_id JOIN checkout_sessions c ON c.order_id=o.id JOIN carts cart ON cart.id=c.source_cart_id JOIN inventory_reservations r ON r.reference_id=o.id::text`);
    expect(states.rows[0]).toEqual({payment_status:"paid",order_status:"paid",checkout_status:"completed",cart_status:"checkout_ready",reservation_status:"consumed",events:"1",consume_movements:"1",paid_audits:"1"});
    expect(promotions.commit).toHaveBeenCalledTimes(1);
  });

  it("expires unpaid checkout exactly once after inventory expiry wins the race", async () => {
    const checkoutTime = now;
    const expiryTime = "2026-08-06T08:16:00.000Z";
    const inventoryRepository = new PostgresqlInventoryRepository();
    const inventoryAudit = new PostgresqlInventoryAuditRepository();
    const inventory = new InventoryReservationService(
      inventoryRepository, createCatalogVariantReader(), inventoryAudit,
      transactions, randomUUID, () => checkoutTime, 900_000,
    );
    const order = new OrderService(
      new PostgresqlOrderRepository(), transactions, randomUUID, () => checkoutTime,
    );
    const gateway: PaymentGateway = {
      createCheckout: vi.fn(async () => ({
        actionUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
        method: "POST" as const,
        fields: [{ name: "signature", value: "synthetic" }],
      })),
      getOrderDetail: vi.fn(),
      normalizeNotification: vi.fn(),
    };
    const payment = new PaymentService(
      new PostgresqlPaymentRepository(), transactions, gateway, randomUUID,
      () => checkoutTime,
    );
    const checkoutRepository = new PostgresqlCheckoutRepository();
    const checkout = new CheckoutService(
      checkoutRepository, cartReader, customerReader, catalog, promotions,
      order, payment, inventory, transactions, randomUUID,
      () => checkoutTime, 900_000,
    );
    await checkout.create(
      {
        addressId: "d1410000-0000-4000-8000-000000000001",
        idempotencyKey: "checkout-expiry",
      },
      {
        customerId: customers[0],
        customerExpiresAt: "2026-09-01T00:00:00.000Z",
        correlationId: "corr-checkout-expiry",
      },
    );

    const expiryInventory = new InventoryReservationService(
      inventoryRepository, createCatalogVariantReader(), inventoryAudit,
      transactions, randomUUID, () => expiryTime, 900_000,
    );
    await expect(
      expiryInventory.expireDue(100, {
        actorType: "system",
        actorId: "system:inventory-expiry",
        correlationId: "corr-inventory-expiry",
      }),
    ).resolves.toBe(1);

    const expiry = new CheckoutExpiryService(
      checkoutRepository, payment, order, expiryInventory, promotions,
      transactions, randomUUID, () => expiryTime,
    );
    await expect(expiry.expireDue(100)).resolves.toBe(1);
    await expect(expiry.expireDue(100)).resolves.toBe(0);

    const states = await pool.query<{
      payment_status: string;
      order_status: string;
      checkout_status: string;
      reservation_status: string;
      reserved: number;
      payment_expired_audits: string;
      checkout_expired_audits: string;
    }>(
      `SELECT p.status payment_status,o.status order_status,
              c.status checkout_status,r.status reservation_status,i.reserved,
              (SELECT count(*)::text FROM audit_events WHERE action='payment.expired') payment_expired_audits,
              (SELECT count(*)::text FROM audit_events WHERE action='checkout.expired') checkout_expired_audits
       FROM payments p JOIN orders o ON o.id=p.order_id
       JOIN checkout_sessions c ON c.order_id=o.id
       JOIN inventory_reservations r ON r.reference_id=o.id::text
       JOIN inventory_items i ON i.variant_id=r.variant_id`,
    );
    expect(states.rows[0]).toEqual({
      payment_status: "expired",
      order_status: "expired",
      checkout_status: "expired",
      reservation_status: "expired",
      reserved: 0,
      payment_expired_audits: "1",
      checkout_expired_audits: "1",
    });
    expect(promotions.release).toHaveBeenCalledOnce();
  });

  it("converges concurrent IPN and reconciliation to one paid transition", async () => {
    const inventory = new InventoryReservationService(
      new PostgresqlInventoryRepository(), createCatalogVariantReader(),
      new PostgresqlInventoryAuditRepository(), transactions, randomUUID,
      () => now, 900_000,
    );
    const order = new OrderService(
      new PostgresqlOrderRepository(), transactions, randomUUID, () => now,
    );
    const normalizer = new SePayPaymentGateway({
      checkoutUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
      apiBaseUrl: "https://pgapi-sandbox.sepay.vn",
      merchantId: "merchant", secretKey: "secret",
      successUrl: "https://example.test/success",
      errorUrl: "https://example.test/error",
      cancelUrl: "https://example.test/cancel", requestTimeoutMs: 1_000,
    });
    let invoiceNumber = "";
    const gateway: PaymentGateway = {
      createCheckout: vi.fn(async ({ invoiceNumber: invoice }) => {
        invoiceNumber = invoice;
        return {
          actionUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
          method: "POST" as const,
          fields: [{ name: "signature", value: "synthetic" }],
        };
      }),
      normalizeNotification: (payload) => normalizer.normalizeNotification(payload),
      getOrderDetail: vi.fn(async () => ({
        providerOrderId: "SEPAY-ORDER-RACE", invoiceNumber,
        status: "CAPTURED", amountVnd: 100_000, currency: "VND" as const,
        transactionApproved: true, redactedEvidence: { status: "CAPTURED" },
      })),
    };
    const paymentRepository = new PostgresqlPaymentRepository();
    const payment = new PaymentService(
      paymentRepository, transactions, gateway, randomUUID, () => now,
    );
    const checkout = new CheckoutService(
      new PostgresqlCheckoutRepository(), cartReader, customerReader, catalog,
      promotions, order, payment, inventory, transactions, randomUUID,
      () => now, 900_000,
    );
    await checkout.create(
      {
        addressId: "d1410000-0000-4000-8000-000000000001",
        idempotencyKey: "checkout-race",
      },
      {
        customerId: customers[0],
        customerExpiresAt: "2026-09-01T00:00:00.000Z",
        correlationId: "corr-checkout-race",
      },
    );
    const persisted = await pool.query<{ id: string }>("SELECT id FROM payments");
    const cartPaid = new CartService(
      new PostgresqlCartRepository(),
      { getByIds: vi.fn(async () => new Map()) },
      { getByVariantIds: vi.fn(async () => new Map()) },
      transactions, randomUUID, () => now,
    );
    const paidTransition = new PaymentNotificationService(
      paymentRepository, gateway, order, inventory, promotions, checkout,
      cartPaid, transactions, randomUUID, () => "2026-08-06T08:05:00.000Z",
    );
    const reconciliation = new PaymentReconciliationService(
      paymentRepository, gateway, paidTransition, transactions, randomUUID,
      () => "2026-08-06T08:05:00.000Z",
    );
    const payload = {
      timestamp: 1757058220,
      notification_type: "ORDER_PAID",
      order: {
        id: "provider-event-race", order_id: "SEPAY-ORDER-RACE",
        order_status: "CAPTURED", order_currency: "VND",
        order_amount: "100000.00", order_invoice_number: invoiceNumber,
      },
      transaction: {
        id: "provider-event-transaction-race",
        transaction_id: "SEPAY-TXN-RACE", transaction_status: "APPROVED",
        transaction_amount: "100000", transaction_currency: "VND",
      },
    };
    await Promise.all([
      paidTransition.process(payload, "corr-ipn-race"),
      reconciliation.reconcile(
        persisted.rows[0]!.id,
        { providerOrderId: "SEPAY-ORDER-RACE" },
        {
          actorId: "finance-1", roles: ["finance_operator"],
          correlationId: "corr-reconciliation-race",
        },
      ),
    ]);

    const counts = await pool.query<{
      payment_status: string;
      paid_audits: string;
      consume_movements: string;
      reconciliations: string;
    }>(
      `SELECT p.status payment_status,
              (SELECT count(*)::text FROM audit_events WHERE action='payment.paid') paid_audits,
              (SELECT count(*)::text FROM stock_movements WHERE movement_type='consume') consume_movements,
              (SELECT count(*)::text FROM payment_reconciliations) reconciliations
       FROM payments p`,
    );
    expect(counts.rows[0]).toEqual({
      payment_status: "paid",
      paid_audits: "1",
      consume_movements: "1",
      reconciliations: "1",
    });
  });
});
