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
  ["Laptops", "laptops", "Portable computers for work, study, and creation"],
  ["Phones", "phones", "Smartphones for communication, photography, and everyday apps"],
  ["Tablets", "tablets", "Versatile touch devices for work and entertainment"],
  ["Smart Watches", "smart-watches", "Connected wearables for activity and notifications"],
  ["Computer Components", "computer-components", "Performance parts and storage upgrades"],
  ["Accessories", "accessories", "Keyboards, mice, audio, and connectivity essentials"],
] as const;

const assurances = [
  ["free-delivery", "truck", "Miễn phí vận chuyển", "Cho đơn hàng đủ điều kiện"],
  ["official-warranty", "shield-check", "Bảo hành chính hãng", "Cam kết sản phẩm xác thực"],
  ["zero-installment", "badge-percent", "Trả góp 0%", "Theo điều kiện thanh toán"],
  ["customer-support", "headphones", "Hỗ trợ 24/7", "Đồng hành khi bạn cần"],
] as const;

const trustMetrics = [
  ["authentic-products", "100%", "Sản phẩm chính hãng"],
  ["trusted-brands", "30+", "Thương hiệu uy tín"],
  ["product-selection", "1.000+", "Sản phẩm đa dạng"],
  ["trusted-customers", "50.000+", "Khách hàng tin tưởng"],
] as const;

const products: readonly SeedProduct[] = [
  { name: "Nova Laptop Pro", slug: "laptop-pro", category: 0, description: "High-performance laptop with a vivid display for demanding professional work.", image: "laptop-pro.png", price: 32_990_000, options: ["16 GB / 512 GB", "32 GB / 1 TB"] },
  { name: "Nova Laptop Air", slug: "laptop-air", category: 0, description: "Lightweight all-day laptop for mobile productivity.", image: "laptop-air.png", price: 24_990_000, options: ["8 GB / 256 GB", "16 GB / 512 GB"] },
  { name: "Nova Phone Pro", slug: "phone-pro", category: 1, description: "Premium smartphone with an advanced camera system and bright display.", image: "phone-pro.png", price: 22_990_000, options: ["256 GB", "512 GB"] },
  { name: "Nova Phone Lite", slug: "phone-lite", category: 1, description: "Slim everyday smartphone with dependable battery life.", image: "phone-lite.png", price: 9_990_000, options: ["128 GB", "256 GB"] },
  { name: "Nova Tablet Pro", slug: "tablet-pro", category: 2, description: "Responsive tablet with stylus support for notes and creative work.", image: "tablet-pro.png", price: 16_490_000, options: ["Wi-Fi 128 GB", "Wi-Fi 256 GB"] },
  { name: "Nova Smart Watch", slug: "smart-watch", category: 3, description: "Connected watch for activity tracking and timely notifications.", image: "smart-watch.png", price: 6_490_000, options: ["41 mm", "45 mm"] },
  { name: "Nova Graphics Card", slug: "graphics-card", category: 4, description: "Dual-fan graphics card for high-resolution gaming and creation.", image: "graphics-card.png", price: 18_990_000, options: ["12 GB", "16 GB"] },
  { name: "Nova Solid-State Drive", slug: "solid-state-drive", category: 4, description: "Fast NVMe storage for responsive systems and applications.", image: "solid-state-drive.png", price: 2_190_000, options: ["1 TB", "2 TB"] },
  { name: "Nova Mechanical Keyboard", slug: "mechanical-keyboard", category: 5, description: "Compact wireless mechanical keyboard with tactile switches.", image: "mechanical-keyboard.png", price: 2_490_000, options: ["Tactile", "Linear"] },
  { name: "Nova Wireless Mouse", slug: "wireless-mouse", category: 5, description: "Ergonomic wireless mouse with precise tracking.", image: "wireless-mouse.png", price: 1_290_000, options: ["Graphite", "Silver"] },
  { name: "Nova USB-C Hub", slug: "usb-c-hub", category: 5, description: "Compact multiport hub for displays, storage, and peripherals.", image: "usb-c-hub.png", price: 1_590_000, options: ["6-in-1", "9-in-1"] },
  { name: "Nova Over-Ear Headphones", slug: "over-ear-headphones", category: 5, description: "Comfortable wireless headphones for focused listening.", image: "over-ear-headphones.png", price: 3_290_000, options: ["Stone", "Black"] },
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
    for (const [sortOrder, [code, iconKey, title, description]] of assurances.entries()) {
      await session.query(
        `INSERT INTO storefront_service_assurances
          (code, icon_key, title, description, sort_order, enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
         ON CONFLICT (code) DO UPDATE SET
          icon_key = EXCLUDED.icon_key, title = EXCLUDED.title,
          description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
          enabled = true, updated_at = NOW()`,
        [code, iconKey, title, description, sortOrder],
      );
    }

    for (const [sortOrder, [code, displayValue, label]] of trustMetrics.entries()) {
      await session.query(
        `INSERT INTO storefront_trust_metrics
          (code, display_value, label, sort_order, enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         ON CONFLICT (code) DO UPDATE SET
          display_value = EXCLUDED.display_value, label = EXCLUDED.label,
          sort_order = EXCLUDED.sort_order, enabled = true, updated_at = NOW()`,
        [code, displayValue, label, sortOrder],
      );
    }

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
        await session.query(`DELETE FROM product_prices WHERE variant_id = $1`, [variantId]);
        await session.query(
          `INSERT INTO product_prices
            (id, variant_id, amount_minor, currency, tax_inclusive, valid_from, valid_to, created_by)
           VALUES ($1, $2, $3, 'VND', true, '2026-08-05T00:00:00.000Z', NULL, 'system:catalog-seed')`,
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
