// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";
import type { CatalogQueryPort } from "../../application/ports/catalog-query.port";
import type { FeaturedProductItem } from "../../domain/entities/email-campaign.entity";

export class DatabaseCatalogQueryAdapter implements CatalogQueryPort {
  private readonly apiBaseUrl: string;

  constructor(
    private readonly database: Pool,
    apiBaseUrl?: string,
  ) {
    this.apiBaseUrl = (
      apiBaseUrl ||
      process.env.API_BASE_URL ||
      process.env.API_PUBLIC_URL ||
      `http://localhost:${process.env.API_PORT || 4000}`
    ).replace(/\/+$/, "");
  }

  async getLatestProducts(limit: number = 4): Promise<FeaturedProductItem[]> {
    const query = `
      SELECT 
        p.id AS product_id,
        p.name,
        p.slug,
        COALESCE(c.name, 'Sản phẩm') AS category_name,
        pv.sku,
        COALESCE(pp.amount_minor, 0) AS regular_price_vnd,
        pm.object_key
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.status = 'active'
      LEFT JOIN product_prices pp ON pp.variant_id = pv.id AND pp.valid_to IS NULL
      LEFT JOIN product_media pm ON pm.product_id = p.id AND pm.is_primary = true
      WHERE p.status != 'archived'
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $1
    `;

    const result = await this.database.query<{
      product_id: string;
      name: string;
      slug: string;
      category_name: string;
      sku: string | null;
      regular_price_vnd: string | number;
      object_key: string | null;
    }>(query, [limit]);

    return this.mapRowsToFeaturedProducts(result.rows);
  }

  async getProductsByIds(productIds: string[]): Promise<FeaturedProductItem[]> {
    if (!productIds || productIds.length === 0) {
      return [];
    }

    const query = `
      SELECT 
        p.id AS product_id,
        p.name,
        p.slug,
        COALESCE(c.name, 'Sản phẩm') AS category_name,
        pv.sku,
        COALESCE(pp.amount_minor, 0) AS regular_price_vnd,
        pm.object_key
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.status = 'active'
      LEFT JOIN product_prices pp ON pp.variant_id = pv.id AND pp.valid_to IS NULL
      LEFT JOIN product_media pm ON pm.product_id = p.id AND pm.is_primary = true
      WHERE p.id = ANY($1) AND p.status != 'archived'
      ORDER BY p.created_at DESC
    `;

    const result = await this.database.query<{
      product_id: string;
      name: string;
      slug: string;
      category_name: string;
      sku: string | null;
      regular_price_vnd: string | number;
      object_key: string | null;
    }>(query, [productIds]);

    return this.mapRowsToFeaturedProducts(result.rows);
  }

  private mapRowsToFeaturedProducts(
    rows: Array<{
      product_id: string;
      name: string;
      slug: string;
      category_name: string;
      sku: string | null;
      regular_price_vnd: string | number;
      object_key: string | null;
    }>,
  ): FeaturedProductItem[] {
    const seenIds = new Set<string>();
    const items: FeaturedProductItem[] = [];

    for (const r of rows) {
      if (seenIds.has(r.product_id)) continue;
      seenIds.add(r.product_id);

      let imageUrl = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop";
      if (r.object_key) {
        if (r.object_key.startsWith("http://") || r.object_key.startsWith("https://")) {
          imageUrl = r.object_key;
        } else {
          imageUrl = `${this.apiBaseUrl}/v1/storefront/media-content?key=${encodeURIComponent(r.object_key)}`;
        }
      }

      items.push({
        productId: r.product_id,
        name: r.name,
        sku: r.sku || `SKU-${r.product_id.slice(0, 6).toUpperCase()}`,
        regularPriceVnd: Number(r.regular_price_vnd) || 100000,
        imageUrl,
        categoryName: r.category_name,
        storefrontUrl: `/products/${r.slug}`,
      });
    }

    return items;
  }
}
