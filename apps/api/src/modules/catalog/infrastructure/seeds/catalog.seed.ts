// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import type { TransactionRunner } from "../../../../shared/database/transaction";
import type { ProductMediaStorage } from "../../application/storage/product-media.storage";

interface SeedProduct {
  readonly name: string;
  readonly slug: string;
  readonly category: number;
  readonly description: string;
  readonly image: string;
  readonly price: number;
  readonly options: readonly [string, string];
}

const categories = [
  ["Drinkware", "drinkware", "Reusable drinkware for work and travel"],
  ["Bags", "bags", "Practical bags for everyday journeys"],
  ["Home", "home", "Simple objects for a comfortable home"],
  ["Accessories", "accessories", "Useful everyday personal accessories"],
] as const;

const products: readonly SeedProduct[] = [
  { name: "Steel Bottle", slug: "steel-bottle", category: 0, description: "Vacuum-insulated stainless-steel bottle.", image: "steel-bottle.png", price: 349_000, options: ["500 ml", "750 ml"] },
  { name: "Ceramic Mug", slug: "ceramic-mug", category: 0, description: "Glazed ceramic mug for coffee and tea.", image: "ceramic-mug.png", price: 189_000, options: ["Sand", "Charcoal"] },
  { name: "Travel Tumbler", slug: "travel-tumbler", category: 0, description: "Lidded tumbler designed for daily commutes.", image: "travel-tumbler.png", price: 299_000, options: ["350 ml", "500 ml"] },
  { name: "Canvas Tote", slug: "canvas-tote", category: 1, description: "Durable cotton canvas tote with an inner pocket.", image: "canvas-tote.png", price: 249_000, options: ["Natural", "Black"] },
  { name: "Commuter Backpack", slug: "commuter-backpack", category: 1, description: "Structured backpack with a padded laptop sleeve.", image: "commuter-backpack.png", price: 899_000, options: ["16 L", "22 L"] },
  { name: "Canvas Duffel", slug: "canvas-duffel", category: 1, description: "Compact canvas duffel for short trips.", image: "canvas-duffel.png", price: 749_000, options: ["Olive", "Navy"] },
  { name: "Desk Lamp", slug: "desk-lamp", category: 2, description: "Adjustable task lamp with warm, focused light.", image: "desk-lamp.png", price: 629_000, options: ["White", "Graphite"] },
  { name: "Throw Pillow", slug: "throw-pillow", category: 2, description: "Textured throw pillow with a removable cover.", image: "throw-pillow.png", price: 279_000, options: ["Clay", "Oat"] },
  { name: "Terracotta Planter", slug: "terracotta-planter", category: 2, description: "Natural terracotta planter with drainage tray.", image: "terracotta-planter.png", price: 219_000, options: ["Small", "Medium"] },
  { name: "Compact Umbrella", slug: "compact-umbrella", category: 3, description: "Wind-resistant folding umbrella for daily carry.", image: "compact-umbrella.png", price: 329_000, options: ["Black", "Forest"] },
  { name: "Kraft Notebook", slug: "kraft-notebook", category: 3, description: "Lay-flat ruled notebook made with recycled paper.", image: "kraft-notebook.png", price: 119_000, options: ["A5", "A6"] },
  { name: "Over-Ear Headphones", slug: "over-ear-headphones", category: 3, description: "Comfortable wireless headphones for focused listening.", image: "over-ear-headphones.png", price: 1_290_000, options: ["Stone", "Black"] },
];

function id(prefix: 1 | 2 | 3 | 4 | 5, sequence: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

export async function seedCatalog(
  transactions: TransactionRunner,
  storage: ProductMediaStorage,
): Promise<void> {
  const media = await Promise.all(
    products.map(async (product, productIndex) => {
      const bytes = await readFile(new URL(`./assets/${product.image}`, import.meta.url));
      const objectKey = `seed/catalog/${product.slug}.png`;
      await storage.upload(objectKey, bytes, "image/png");
      return { id: id(5, productIndex + 1), objectKey, byteSize: bytes.byteLength };
    }),
  );

  await transactions.run(async (session) => {
    for (const [categoryIndex, category] of categories.entries()) {
      await session.query(
        `INSERT INTO categories
          (id, name, slug, description, sort_order, status, created_at, updated_at, version)
         VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW(), 1)
         ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order, status = EXCLUDED.status, updated_at = NOW()`,
        [id(1, categoryIndex + 1), category[0], category[1], category[2], categoryIndex],
      );
    }

    for (const [productIndex, product] of products.entries()) {
      const productId = id(2, productIndex + 1);
      await session.query(
        `INSERT INTO products
          (id, category_id, name, slug, brand, description, attributes, status, created_at, updated_at, version)
         VALUES ($1, $2, $3, $4, 'NovaCommerce', $5, $6::jsonb, 'draft', NOW(), NOW(), 1)
         ON CONFLICT (id) DO UPDATE SET
          category_id = EXCLUDED.category_id, name = EXCLUDED.name, slug = EXCLUDED.slug,
          brand = EXCLUDED.brand, description = EXCLUDED.description,
          attributes = EXCLUDED.attributes, status = EXCLUDED.status, updated_at = NOW()`,
        [productId, id(1, product.category + 1), product.name, product.slug, product.description, JSON.stringify({ seeded: true })],
      );

      for (const [optionIndex, option] of product.options.entries()) {
        const sequence = productIndex * 2 + optionIndex + 1;
        const variantId = id(3, sequence);
        await session.query(
          `INSERT INTO product_variants
            (id, product_id, sku, title, option_values, status, created_at, updated_at, version)
           VALUES ($1, $2, $3, $4, $5::jsonb, 'active', NOW(), NOW(), 1)
           ON CONFLICT (id) DO UPDATE SET
            product_id = EXCLUDED.product_id, sku = EXCLUDED.sku, title = EXCLUDED.title,
            option_values = EXCLUDED.option_values, status = EXCLUDED.status, updated_at = NOW()`,
          [variantId, productId, `NOVA-${String(productIndex + 1).padStart(3, "0")}-${optionIndex + 1}`, option, JSON.stringify({ option })],
        );
        await session.query(
          `INSERT INTO product_prices
            (id, variant_id, amount_minor, currency, tax_inclusive, valid_from, valid_to, created_by)
           VALUES ($1, $2, $3, 'VND', true, '2026-08-05T00:00:00.000Z', NULL, 'system:catalog-seed')
           ON CONFLICT (id) DO UPDATE SET
            variant_id = EXCLUDED.variant_id, amount_minor = EXCLUDED.amount_minor,
            currency = EXCLUDED.currency, tax_inclusive = EXCLUDED.tax_inclusive,
            valid_from = EXCLUDED.valid_from, valid_to = NULL, created_by = EXCLUDED.created_by`,
          [id(4, sequence), variantId, product.price + optionIndex * 50_000],
        );
      }

      await session.query(
        `INSERT INTO product_media
          (id, product_id, object_key, content_type, byte_size, alt_text, sort_order, is_primary, created_at)
         VALUES ($1, $2, $3, 'image/png', $4, $5, 0, true, NOW())
         ON CONFLICT (id) DO UPDATE SET
          product_id = EXCLUDED.product_id, object_key = EXCLUDED.object_key,
          content_type = EXCLUDED.content_type, byte_size = EXCLUDED.byte_size,
          alt_text = EXCLUDED.alt_text, sort_order = 0, is_primary = true`,
        [media[productIndex]!.id, productId, media[productIndex]!.objectKey, media[productIndex]!.byteSize, `${product.name} product image`],
      );
    }
  });
}
