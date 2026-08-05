// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StorefrontVariantReaderService } from "../../../../catalog/application/services/implementations/storefront-variant-reader";
import { PostgresqlPublicCatalogRepository } from "../../../../catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository";
import type { InventoryAvailabilityReader } from "../../../../inventory";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { CartService } from "../../../application/services/implementations/cart.service";
import { CartResolutionService } from "../../../application/services/implementations/cart-resolution.service";
import { runCartMigrations } from "../../database/run-cart-migrations";
import { PostgresqlCartRepository } from "./postgresql-cart.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const ids = {
  category: "f1000000-0000-4000-8000-000000000001",
  product: "f2000000-0000-4000-8000-000000000001",
  variant: "f3000000-0000-4000-8000-000000000001",
  price: "f4000000-0000-4000-8000-000000000001",
  media: "f5000000-0000-4000-8000-000000000001",
  guest: "f6000000-0000-4000-8000-000000000001",
  customer: "f7000000-0000-4000-8000-000000000001",
} as const;

suite("PostgresqlCartRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlCartRepository();
  const variants = new StorefrontVariantReaderService(
    new PostgresqlPublicCatalogRepository(),
    transactions,
  );
  const inventory: InventoryAvailabilityReader = {
    async getByVariantIds(variantIds) {
      return new Map(
        variantIds.map((variantId) => [
          variantId,
          {
            initialized: true,
            onHand: 20,
            reserved: 0,
            available: 20,
          },
        ]),
      );
    },
  };

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCartMigrations(databaseUrl!, "up");
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE cart_resolution_requests, carts, guest_sessions, customers, audit_events, categories CASCADE",
    );
    await pool.query(
      `INSERT INTO categories(id,name,slug,sort_order,status,created_at,updated_at,version)
       VALUES($1,'Accessories','accessories',0,'active',NOW(),NOW(),1)`,
      [ids.category],
    );
    await pool.query(
      `INSERT INTO products(id,category_id,name,slug,description,attributes,status,created_at,updated_at,version)
       VALUES($1,$2,'Nova Mouse','nova-mouse','Wireless mouse','{}','published',NOW(),NOW(),1)`,
      [ids.product, ids.category],
    );
    await pool.query(
      `INSERT INTO product_variants(id,product_id,sku,title,option_values,status,created_at,updated_at,version)
       VALUES($1,$2,'MOUSE-BLACK','Black','{"color":"Black"}','active',NOW(),NOW(),1)`,
      [ids.variant, ids.product],
    );
    await pool.query(
      `INSERT INTO product_prices(id,variant_id,amount_minor,currency,tax_inclusive,valid_from,created_by)
       VALUES($1,$2,1290000,'VND',true,NOW() - interval '1 minute','test')`,
      [ids.price, ids.variant],
    );
    await pool.query(
      `INSERT INTO product_media(id,product_id,object_key,content_type,byte_size,alt_text,sort_order,is_primary,created_at)
       VALUES($1,$2,'test/mouse.png','image/png',100,'Nova Mouse',0,true,NOW())`,
      [ids.media, ids.product],
    );
    await pool.query(
      `INSERT INTO guest_sessions(id,token_hash,expires_at,last_seen_at,created_at)
       VALUES($1,$2,NOW() + interval '7 days',NOW(),NOW())`,
      [ids.guest, "a".repeat(64)],
    );
    await pool.query(
      `INSERT INTO customers(id,email,email_verified_at,status,version,created_at,updated_at)
       VALUES($1,'cart@example.com',NOW(),'active',1,NOW(),NOW())`,
      [ids.customer],
    );
  });
  afterAll(async () => {
    await runCartMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("converges concurrent first adds to one active cart and one aggregated line", async () => {
    const service = createService();
    const owner = {
      kind: "guest" as const,
      guestSessionId: ids.guest,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    };

    await Promise.all([
      service.addItem(owner, ids.variant, 1),
      service.addItem(owner, ids.variant, 1),
    ]);

    const cart = await service.get(owner);
    expect(cart).toMatchObject({ itemCount: 2, totalVnd: 2_580_000 });
    expect(cart.items).toHaveLength(1);
    const counts = await pool.query(
      "SELECT (SELECT count(*)::int FROM carts) AS carts, (SELECT count(*)::int FROM cart_items) AS items",
    );
    expect(counts.rows[0]).toEqual({ carts: 1, items: 1 });
  });

  it("merges conflicting carts once and preserves superseded history", async () => {
    const service = createService();
    const resolution = new CartResolutionService(
      repository,
      service,
      variants,
      inventory,
      transactions,
      randomUUID,
      () => new Date().toISOString(),
    );
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await service.addItem(
      { kind: "guest", guestSessionId: ids.guest, expiresAt },
      ids.variant,
      1,
    );
    await service.addItem(
      { kind: "customer", customerId: ids.customer, expiresAt },
      ids.variant,
      2,
    );

    await expect(
      resolution.inspect(ids.customer, expiresAt, ids.guest, expiresAt, true),
    ).resolves.toMatchObject({ status: "required" });
    const input = {
      customerId: ids.customer,
      customerExpiresAt: expiresAt,
      guestSessionId: ids.guest,
      guestExpiresAt: expiresAt,
      action: "merge" as const,
      idempotencyKey: "merge-request-0001",
    };
    const [merged, concurrentRetry] = await Promise.all([
      resolution.resolve(input),
      resolution.resolve(input),
    ]);
    expect(merged.resultingCart).toMatchObject({
      itemCount: 3,
      totalVnd: 3_870_000,
    });
    expect(concurrentRetry).toMatchObject({ status: "resolved" });
    await expect(
      resolution.resolve({ ...input, action: "keep_saved" }),
    ).rejects.toMatchObject({
      code: "CART_RESOLUTION_CONFLICT",
    });
    const history = await pool.query(
      "SELECT status, customer_id, guest_session_id FROM carts ORDER BY status",
    );
    expect(history.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "active",
          customer_id: ids.customer,
        }),
        expect.objectContaining({
          status: "superseded",
          guest_session_id: ids.guest,
        }),
      ]),
    );
  });

  function createService(): CartService {
    return new CartService(
      repository,
      variants,
      inventory,
      transactions,
      randomUUID,
      () => new Date().toISOString(),
    );
  }
});
