// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCartMigrations } from "../../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runOrderMigrations } from "../../../../order/infrastructure/database/run-order-migrations";
import { runPromotionMigrations } from "../../../../promotion/infrastructure/database/run-promotion-migrations";
import { PostgresqlPublicCatalogRepository } from "./postgresql-public-catalog.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const ids = {
  category: "e1000000-0000-4000-8000-000000000001",
  published: "e2000000-0000-4000-8000-000000000001",
  draft: "e2000000-0000-4000-8000-000000000002",
  variant: "e3000000-0000-4000-8000-000000000001",
  price: "e4000000-0000-4000-8000-000000000001",
  media: "e5000000-0000-4000-8000-000000000001",
} as const;

describeWithDatabase("PostgresqlPublicCatalogRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlPublicCatalogRepository();

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
    await pool.query("TRUNCATE audit_events, categories CASCADE");
    await pool.query(
      `INSERT INTO categories
        (id, name, slug, sort_order, status, created_at, updated_at, version)
       VALUES ($1, 'Phones', 'phones', 0, 'active', NOW(), NOW(), 1)`,
      [ids.category],
    );
    await pool.query(
      `INSERT INTO products
        (id, category_id, name, slug, brand, description, attributes, status,
         created_at, updated_at, version)
       VALUES
        ($1, $3, 'Phone X', 'phone-x', 'Nova', 'Technology phone',
         '{"screen":"6.5 inch"}', 'published', NOW(), NOW(), 2),
        ($2, $3, 'Draft Phone', 'draft-phone', 'Nova', 'Private draft',
         '{}', 'draft', NOW(), NOW(), 1)`,
      [ids.published, ids.draft, ids.category],
    );
    await pool.query(
      `INSERT INTO product_variants
        (id, product_id, sku, title, option_values, status,
         created_at, updated_at, version)
       VALUES ($1, $2, 'TECH-PHONE-BLACK', 'Black', '{"color":"Black"}',
               'active', NOW(), NOW(), 1)`,
      [ids.variant, ids.published],
    );
    await pool.query(
      `INSERT INTO product_prices
        (id, variant_id, amount_minor, currency, tax_inclusive, valid_from,
         valid_to, created_by)
       VALUES ($1, $2, 19990000, 'VND', true, NOW(), NULL, 'staff-catalog')`,
      [ids.price, ids.variant],
    );
    await pool.query(
      `INSERT INTO product_media
        (id, product_id, object_key, content_type, byte_size, alt_text,
         sort_order, is_primary, created_at)
       VALUES ($1, $2, 'seed/phone-x.png', 'image/png', 100,
               'Phone X front', 0, true, NOW())`,
      [ids.media, ids.published],
    );
  });
  afterAll(async () => {
    await runOrderMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCheckoutMigrations(databaseUrl!, "down", 999999).catch(() => undefined);
    await runPromotionMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCartMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCustomerMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCompanyCoreMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("returns complete published products and excludes drafts", async () => {
    const page = await transactions.runReadOnly((session) =>
      repository.listProducts(session, { page: 1, pageSize: 20 }),
    );

    expect(page.totalItems).toBe(1);
    expect(page.items).toEqual([
      expect.objectContaining({
        id: ids.published,
        slug: "phone-x",
        primaryMedia: { id: ids.media, altText: "Phone X front" },
        variants: [
          expect.objectContaining({
            id: ids.variant,
            sku: "TECH-PHONE-BLACK",
            price: { amountMinor: 19_990_000, currency: "VND" },
          }),
        ],
      }),
    ]);
    await expect(
      transactions.runReadOnly((session) =>
        repository.findProductBySlug(session, "draft-phone"),
      ),
    ).resolves.toBeUndefined();
  });

  it("reports publication readiness and authorizes only published media", async () => {
    const readiness = await transactions.runReadOnly((session) =>
      repository.inspectPublicationReadiness(session, ids.published),
    );
    expect(readiness).toEqual({
      categoryActive: true,
      primaryImageCount: 1,
      activeVariants: [{ variantId: ids.variant, hasCurrentPrice: true }],
    });
    const media = await transactions.runReadOnly((session) =>
      repository.findMediaAuthorization(session, ids.published, ids.media),
    );
    expect(media).toEqual({
      productId: ids.published,
      mediaId: ids.media,
      objectKey: "seed/phone-x.png",
      contentType: "image/png",
    });
  });

  it("batch reads only active variants on complete published products", async () => {
    const variants = await transactions.runReadOnly((session) =>
      repository.findStorefrontVariants(session, [ids.variant]),
    );
    expect(variants).toEqual([expect.objectContaining({
      variantId: ids.variant,
      productId: ids.published,
      productName: "Phone X",
      sku: "TECH-PHONE-BLACK",
      unitPriceVnd: 19_990_000,
      primaryMediaId: ids.media,
    })]);

    await pool.query("UPDATE products SET status = 'draft' WHERE id = $1", [ids.published]);
    await expect(
      transactions.runReadOnly((session) => repository.findStorefrontVariants(session, [ids.variant])),
    ).resolves.toEqual([]);
  });

  it("orders newest products by store insertion time rather than updates", async () => {
    const newestIds = {
      oldProduct: "e2000000-0000-4000-8000-000000000010",
      newProduct: "e2000000-0000-4000-8000-000000000011",
      oldVariant: "e3000000-0000-4000-8000-000000000010",
      newVariant: "e3000000-0000-4000-8000-000000000011",
      oldPrice: "e4000000-0000-4000-8000-000000000010",
      newPrice: "e4000000-0000-4000-8000-000000000011",
      oldMedia: "e5000000-0000-4000-8000-000000000010",
      newMedia: "e5000000-0000-4000-8000-000000000011",
    };
    await insertCompleteProduct(pool, {
      productId: newestIds.oldProduct,
      variantId: newestIds.oldVariant,
      priceId: newestIds.oldPrice,
      mediaId: newestIds.oldMedia,
      name: "Updated Older Phone",
      slug: "updated-older-phone",
      amountMinor: 12_000_000,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    });
    await insertCompleteProduct(pool, {
      productId: newestIds.newProduct,
      variantId: newestIds.newVariant,
      priceId: newestIds.newPrice,
      mediaId: newestIds.newMedia,
      name: "Newly Added Phone",
      slug: "newly-added-phone",
      amountMinor: 13_000_000,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    });

    const page = await transactions.runReadOnly((session) =>
      repository.listProducts(session, { page: 1, pageSize: 10, sort: "newest" }),
    );
    const returnedIds = page.items.map((item) => item.id);
    expect(returnedIds.indexOf(newestIds.newProduct)).toBeLessThan(
      returnedIds.indexOf(newestIds.oldProduct),
    );
  });

  it("orders best-selling products by all-time paid order quantities", async () => {
    const products = {
      top: "e2000000-0000-4000-8000-000000000020",
      second: "e2000000-0000-4000-8000-000000000021",
      unsold: "e2000000-0000-4000-8000-000000000022",
    };
    const variants = {
      top: "e3000000-0000-4000-8000-000000000020",
      second: "e3000000-0000-4000-8000-000000000021",
      unsold: "e3000000-0000-4000-8000-000000000022",
    };
    await insertCompleteProduct(pool, {
      productId: products.top,
      variantId: variants.top,
      priceId: "e4000000-0000-4000-8000-000000000020",
      mediaId: "e5000000-0000-4000-8000-000000000020",
      name: "Top Seller",
      slug: "top-seller",
      amountMinor: 10_000_000,
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    await insertCompleteProduct(pool, {
      productId: products.second,
      variantId: variants.second,
      priceId: "e4000000-0000-4000-8000-000000000021",
      mediaId: "e5000000-0000-4000-8000-000000000021",
      name: "Second Seller",
      slug: "second-seller",
      amountMinor: 11_000_000,
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    await insertCompleteProduct(pool, {
      productId: products.unsold,
      variantId: variants.unsold,
      priceId: "e4000000-0000-4000-8000-000000000022",
      mediaId: "e5000000-0000-4000-8000-000000000022",
      name: "Unsold Phone",
      slug: "unsold-phone",
      amountMinor: 12_000_000,
      createdAt: "2026-08-03T00:00:00.000Z",
    });
    await insertOrderLine(pool, {
      orderId: "e6000000-0000-4000-8000-000000000020",
      checkoutId: "e7000000-0000-4000-8000-000000000020",
      cartId: "e8000000-0000-4000-8000-000000000020",
      customerId: "e9000000-0000-4000-8000-000000000020",
      variantId: variants.top,
      quantity: 5,
      status: "paid",
      sequence: 20,
    });
    await insertOrderLine(pool, {
      orderId: "e6000000-0000-4000-8000-000000000021",
      checkoutId: "e7000000-0000-4000-8000-000000000021",
      cartId: "e8000000-0000-4000-8000-000000000021",
      customerId: "e9000000-0000-4000-8000-000000000021",
      variantId: variants.second,
      quantity: 2,
      status: "completed",
      sequence: 21,
    });
    await insertOrderLine(pool, {
      orderId: "e6000000-0000-4000-8000-000000000022",
      checkoutId: "e7000000-0000-4000-8000-000000000022",
      cartId: "e8000000-0000-4000-8000-000000000022",
      customerId: "e9000000-0000-4000-8000-000000000022",
      variantId: variants.second,
      quantity: 99,
      status: "canceled",
      sequence: 22,
    });

    const page = await transactions.runReadOnly((session) =>
      repository.listProducts(session, { page: 1, pageSize: 10, sort: "best_selling" }),
    );
    const returnedIds = page.items.map((item) => item.id);
    expect(returnedIds.indexOf(products.top)).toBeLessThan(
      returnedIds.indexOf(products.second),
    );
    expect(returnedIds.indexOf(products.second)).toBeLessThan(
      returnedIds.indexOf(products.unsold),
    );
  });

  it("filters on-sale products using current and previous price history", async () => {
    const saleProduct = "e2000000-0000-4000-8000-000000000030";
    const nonSaleProduct = "e2000000-0000-4000-8000-000000000031";
    await insertCompleteProduct(pool, {
      productId: saleProduct,
      variantId: "e3000000-0000-4000-8000-000000000030",
      priceId: "e4000000-0000-4000-8000-000000000030",
      previousPriceId: "e4000000-0000-4000-8000-000000000130",
      mediaId: "e5000000-0000-4000-8000-000000000030",
      name: "Discounted Phone",
      slug: "discounted-phone",
      amountMinor: 8_000_000,
      previousAmountMinor: 10_000_000,
      createdAt: "2026-08-03T00:00:00.000Z",
    });
    await insertCompleteProduct(pool, {
      productId: nonSaleProduct,
      variantId: "e3000000-0000-4000-8000-000000000031",
      priceId: "e4000000-0000-4000-8000-000000000031",
      previousPriceId: "e4000000-0000-4000-8000-000000000131",
      mediaId: "e5000000-0000-4000-8000-000000000031",
      name: "Raised Price Phone",
      slug: "raised-price-phone",
      amountMinor: 9_000_000,
      previousAmountMinor: 8_000_000,
      createdAt: "2026-08-04T00:00:00.000Z",
    });

    const page = await transactions.runReadOnly((session) =>
      repository.listProducts(session, {
        page: 1,
        pageSize: 10,
        discountStatus: "on_sale",
      }),
    );
    const returnedIds = page.items.map((item) => item.id);
    expect(returnedIds).toContain(saleProduct);
    expect(returnedIds).not.toContain(nonSaleProduct);
  });
});

async function insertCompleteProduct(
  pool: Pool,
  input: {
    readonly productId: string;
    readonly variantId: string;
    readonly priceId: string;
    readonly previousPriceId?: string;
    readonly mediaId: string;
    readonly name: string;
    readonly slug: string;
    readonly amountMinor: number;
    readonly previousAmountMinor?: number;
    readonly createdAt: string;
    readonly updatedAt?: string;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO products
      (id, category_id, name, slug, brand, description, attributes, status,
       created_at, updated_at, version)
     VALUES ($1, $2, $3, $4, 'Nova', 'Technology product', '{}',
       'published', $5, $6, 1)`,
    [input.productId, ids.category, input.name, input.slug, input.createdAt, input.updatedAt ?? input.createdAt],
  );
  await pool.query(
     `INSERT INTO product_variants
      (id, product_id, sku, title, option_values, status,
       created_at, updated_at, version)
     VALUES ($1, $2, $3, 'Default', '{"Option":"Default"}', 'active', $4, $4, 1)`,
    [input.variantId, input.productId, `${input.slug.toUpperCase()}-SKU`, input.createdAt],
  );
  if (input.previousPriceId !== undefined && input.previousAmountMinor !== undefined) {
    await pool.query(
      `INSERT INTO product_prices
        (id, variant_id, amount_minor, currency, tax_inclusive, valid_from,
         valid_to, created_by)
       VALUES ($1, $2, $3, 'VND', true,
         '2026-08-01T00:00:00.000Z', '2026-08-05T00:00:00.000Z',
         'staff-catalog')`,
      [input.previousPriceId, input.variantId, input.previousAmountMinor],
    );
  }
  await pool.query(
    `INSERT INTO product_prices
      (id, variant_id, amount_minor, currency, tax_inclusive, valid_from,
       valid_to, created_by)
     VALUES ($1, $2, $3, 'VND', true,
       '2026-08-05T00:00:00.000Z', NULL, 'staff-catalog')`,
    [input.priceId, input.variantId, input.amountMinor],
  );
  await pool.query(
    `INSERT INTO product_media
      (id, product_id, object_key, content_type, byte_size, alt_text,
       sort_order, is_primary, created_at)
     VALUES ($1, $2, $3, 'image/png', 100, $4, 0, true, $5)`,
    [input.mediaId, input.productId, `seed/${input.slug}.png`, `${input.name} front`, input.createdAt],
  );
}

async function insertOrderLine(
  pool: Pool,
  input: {
    readonly orderId: string;
    readonly checkoutId: string;
    readonly cartId: string;
    readonly customerId: string;
    readonly variantId: string;
    readonly quantity: number;
    readonly status: "paid" | "completed" | "canceled";
    readonly sequence: number;
  },
): Promise<void> {
  const now = "2026-08-10T00:00:00.000Z";
  const total = input.quantity * 1_000_000;
  await pool.query(
    `INSERT INTO customers
      (id, email, email_verified_at, full_name, status, version, created_at, updated_at)
     VALUES ($1, $2, $3, 'Buyer', 'active', 1, $3, $3)`,
    [input.customerId, `buyer-${input.sequence}@example.com`, now],
  );
  await pool.query(
    `INSERT INTO carts
      (id, customer_id, status, version, expires_at, created_at, updated_at)
     VALUES ($1, $2, 'checkout_ready', 1, $3::timestamptz + interval '1 day', $3, $3)`,
    [input.cartId, input.customerId, now],
  );
  await pool.query(
    `INSERT INTO checkout_sessions
      (id, customer_id, source_cart_id, source_cart_version,
       address_snapshot, contact_snapshot, subtotal_vnd, discount_vnd,
       total_vnd, currency, tax_mode, status, idempotency_key,
       request_fingerprint, expires_at, completed_at, created_at, updated_at)
     VALUES ($1, $2, $3, 1, '{}', '{}', $4, 0, $4, 'VND',
       'included_not_separated', 'order_created', $5, $6,
       $7::timestamptz + interval '1 day', $7, $7, $7)`,
    [input.checkoutId, input.customerId, input.cartId, total, `checkout-${input.sequence}`, String(input.sequence).padStart(64, "a"), now],
  );
  await pool.query(
    `INSERT INTO orders
      (id, public_number, customer_id, checkout_id, address_snapshot,
       contact_snapshot, subtotal_vnd, discount_vnd, total_vnd, currency,
       tax_mode, status, reservation_expires_at, paid_at, completed_at,
       version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, '{}', '{}', $5, 0, $5, 'VND',
       'included_not_separated', $6, $7::timestamptz + interval '1 day',
       $8, $9, 1, $7, $7)`,
    [
      input.orderId,
      `NVC-20260810-${input.sequence.toString(16).toUpperCase().padStart(8, "0")}`,
      input.customerId,
      input.checkoutId,
      total,
      input.status,
      now,
      input.status === "canceled" ? null : now,
      input.status === "completed" ? now : null,
    ],
  );
  await pool.query(
    `INSERT INTO order_lines
      (id, order_id, variant_id, sku, product_title, variant_label, quantity,
       unit_price_vnd, discount_allocation_vnd, line_total_vnd, line_position)
     VALUES (gen_random_uuid(), $1, $2, 'SKU', 'Product', 'Default', $3,
       1000000, 0, $4, 0)`,
    [input.orderId, input.variantId, input.quantity, total],
  );
}
