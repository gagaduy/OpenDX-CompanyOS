// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../../../app";
import { StorefrontVariantReaderService } from "../../catalog/application/services/implementations/storefront-variant-reader";
import { PostgresqlPublicCatalogRepository } from "../../catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository";
import type { CustomerSessionServiceContract } from "../../customer";
import { runCustomerMigrations } from "../../customer/infrastructure/database/run-customer-migrations";
import type { InventoryAvailabilityReader } from "../../inventory";
import { runCatalogMigrations } from "../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import { createCartModule } from "../cart.module";
import { runCartMigrations } from "../infrastructure/database/run-cart-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const origin = "http://localhost:3100";
const expiresAt = "2099-01-01T00:00:00.000Z";
const ids = {
  category: "d1000000-0000-4000-8000-000000000001",
  product: "d2000000-0000-4000-8000-000000000001",
  variant: "d3000000-0000-4000-8000-000000000001",
  price: "d4000000-0000-4000-8000-000000000001",
  media: "d5000000-0000-4000-8000-000000000001",
  guest: "d6000000-0000-4000-8000-000000000001",
  customer: "d7000000-0000-4000-8000-000000000001",
} as const;

suite("cart API integration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  let module: ReturnType<typeof createCartModule>;
  let app: ReturnType<typeof createApiApp>;

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCartMigrations(databaseUrl!, "up");
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE cart_resolution_requests, carts, guest_sessions, customers, audit_events, categories CASCADE",
    );
    await seedFixture(pool);
    const sessions: CustomerSessionServiceContract = {
      async createGuest() {
        throw new Error("Not used by Cart routes");
      },
      async resolveGuest(raw) {
        if (raw !== "guest-token") throw new Error("Invalid guest token");
        return { guestSessionId: ids.guest, expiresAt };
      },
      async resolveCustomer(raw) {
        if (raw !== "customer-token" && raw !== "rotated-customer-token")
          throw new Error("Invalid customer token");
        return {
          rawToken: "rotated-customer-token",
          principal: {
            customerId: ids.customer,
            sessionId: "session-1",
            email: "cart@example.com",
            expiresAt,
          },
        };
      },
    };
    const availability: InventoryAvailabilityReader = {
      async getByVariantIds(variantIds) {
        return new Map(
          variantIds.map((variantId) => [
            variantId,
            {
              initialized: true,
              onHand: 8,
              reserved: 0,
              available: 8,
            },
          ]),
        );
      },
    };
    module = createCartModule({
      transactions,
      variants: new StorefrontVariantReaderService(
        new PostgresqlPublicCatalogRepository(),
        transactions,
      ),
      availability,
      sessions,
      storefrontOrigin: origin,
      cookies: {
        guestName: "opendx_guest",
        customerName: "opendx_customer",
        csrfName: "opendx_csrf",
        secure: false,
      },
      generateId: randomUUID,
      now: () => new Date().toISOString(),
    });
    app = createApiApp({
      storefrontOrigin: origin,
      storefrontRouter: module.router,
    });
  });
  afterAll(async () => {
    await runCartMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("keeps anonymous reads stateless and protects guest mutations with origin and CSRF", async () => {
    const anonymous = await request(app).get("/v1/storefront/cart").expect(200);
    expect(anonymous.body.data).toMatchObject({
      ownerKind: "anonymous",
      status: "empty",
    });
    expect(anonymous.headers["set-cookie"]).toBeUndefined();
    await request(app)
      .post("/v1/storefront/cart/items")
      .set("Origin", origin)
      .send({ variantId: ids.variant, quantity: 1 })
      .expect(401);
    await request(app)
      .post("/v1/storefront/cart/items")
      .set("Origin", origin)
      .set("Cookie", "opendx_guest=guest-token")
      .send({ variantId: ids.variant, quantity: 1 })
      .expect(403);

    const added = await request(app)
      .post("/v1/storefront/cart/items")
      .set("Origin", origin)
      .set("x-csrf-token", "csrf-token")
      .set("Cookie", "opendx_guest=guest-token; opendx_csrf=csrf-token")
      .send({ variantId: ids.variant, quantity: 2 })
      .expect(201);
    expect(added.body.data).toMatchObject({
      itemCount: 2,
      totalVnd: 2_580_000,
    });
    expect(added.body.data.items[0]).toMatchObject({
      productName: "Nova Mouse",
      sku: "MOUSE-BLACK",
      availableQuantity: 8,
    });

    const restoredGuest = await request(app)
      .get("/v1/storefront/cart")
      .set("Cookie", "opendx_customer=invalid-token; opendx_guest=guest-token")
      .expect(200);
    expect(restoredGuest.body.data.ownerKind).toBe("guest");
    const clearedCookies = ([] as string[]).concat(
      restoredGuest.headers["set-cookie"] ?? [],
    );
    expect(
      clearedCookies.some((value) => value.startsWith("opendx_customer=")),
    ).toBe(true);
  });

  it("allows customer checkout-readiness validation without creating checkout state", async () => {
    await module.service.addItem(
      { kind: "customer", customerId: ids.customer, expiresAt },
      ids.variant,
      1,
    );
    const response = await request(app)
      .post("/v1/storefront/cart/checkout-readiness")
      .set("Origin", origin)
      .set("x-csrf-token", "csrf-token")
      .set("Cookie", "opendx_customer=customer-token; opendx_csrf=csrf-token")
      .expect(200);
    expect(response.body.data).toMatchObject({
      ownerKind: "customer",
      itemCount: 1,
    });
    const tables = await pool.query(
      "SELECT to_regclass('public.orders') AS orders, to_regclass('public.checkouts') AS checkouts",
    );
    expect(tables.rows[0]).toEqual({ orders: null, checkouts: null });
  });

  it.each([
    ["keep_guest", 1],
    ["keep_saved", 2],
    ["merge", 3],
  ] as const)(
    "resolves %s through HTTP idempotently without deleting cart history",
    async (action, expectedQuantity) => {
      await module.service.addItem(
        { kind: "guest", guestSessionId: ids.guest, expiresAt },
        ids.variant,
        1,
      );
      await module.service.addItem(
        { kind: "customer", customerId: ids.customer, expiresAt },
        ids.variant,
        2,
      );
      const cookie =
        "opendx_customer=customer-token; opendx_guest=guest-token; opendx_csrf=csrf-token";
      const inspected = await request(app)
        .get("/v1/storefront/cart/resolution")
        .set("Cookie", cookie)
        .expect(200);
      expect(inspected.body.data.status).toBe("required");

      const input = { action, idempotencyKey: `resolution-${action}-0001` };
      const resolved = await request(app)
        .post("/v1/storefront/cart/resolution")
        .set("Origin", origin)
        .set("x-csrf-token", "csrf-token")
        .set("Cookie", cookie)
        .send(input)
        .expect(200);
      expect(resolved.body.data).toMatchObject({
        status: "resolved",
        resultingCart: {
          itemCount: expectedQuantity,
          totalVnd: expectedQuantity * 1_290_000,
        },
      });
      await request(app)
        .post("/v1/storefront/cart/resolution")
        .set("Origin", origin)
        .set("x-csrf-token", "csrf-token")
        .set("Cookie", cookie)
        .send(input)
        .expect(200);

      const history = await pool.query(
        "SELECT status FROM carts ORDER BY status",
      );
      expect(history.rows).toEqual([
        { status: "active" },
        { status: "superseded" },
      ]);
      const records = await pool.query(
        "SELECT action FROM cart_resolution_requests",
      );
      expect(records.rows).toEqual([{ action }]);
    },
  );
});

async function seedFixture(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO categories(id,name,slug,sort_order,status,created_at,updated_at,version) VALUES($1,'Accessories','accessories',0,'active',NOW(),NOW(),1)`,
    [ids.category],
  );
  await pool.query(
    `INSERT INTO products(id,category_id,name,slug,description,attributes,status,created_at,updated_at,version) VALUES($1,$2,'Nova Mouse','nova-mouse','Wireless mouse','{}','published',NOW(),NOW(),1)`,
    [ids.product, ids.category],
  );
  await pool.query(
    `INSERT INTO product_variants(id,product_id,sku,title,option_values,status,created_at,updated_at,version) VALUES($1,$2,'MOUSE-BLACK','Black','{"color":"Black"}','active',NOW(),NOW(),1)`,
    [ids.variant, ids.product],
  );
  await pool.query(
    `INSERT INTO product_prices(id,variant_id,amount_minor,currency,tax_inclusive,valid_from,created_by) VALUES($1,$2,1290000,'VND',true,NOW() - interval '1 minute','test')`,
    [ids.price, ids.variant],
  );
  await pool.query(
    `INSERT INTO product_media(id,product_id,object_key,content_type,byte_size,alt_text,sort_order,is_primary,created_at) VALUES($1,$2,'test/mouse.png','image/png',100,'Nova Mouse',0,true,NOW())`,
    [ids.media, ids.product],
  );
  await pool.query(
    `INSERT INTO guest_sessions(id,token_hash,expires_at,last_seen_at,created_at) VALUES($1,$2,$3,NOW(),NOW())`,
    [ids.guest, "b".repeat(64), expiresAt],
  );
  await pool.query(
    `INSERT INTO customers(id,email,email_verified_at,status,version,created_at,updated_at) VALUES($1,'cart@example.com',NOW(),'active',1,NOW(),NOW())`,
    [ids.customer],
  );
}
