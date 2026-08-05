// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  PublicationReadinessSnapshot,
  PublicCatalogRepository,
  PublicMediaAuthorization,
  PublicProductListResult,
  PublicProductProjection,
} from "../../../application/repositories/interfaces/public-catalog.repository";
import type { PublicProductListQuery } from "../../../application/dtos/requests/public-catalog-request.dto";
import type { PublicCategoryDto } from "../../../application/dtos/responses/public-catalog-response.dto";
import { assertAttributes, assertVariantOptions } from "../../../domain/services/catalog-rules";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

interface ReadinessRow {
  category_active: boolean;
  primary_image_count: number;
}

interface ReadinessVariantRow {
  variant_id: string;
  has_current_price: boolean;
}

interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
}

interface ProductRow {
  id: string;
  category_id: string;
  category_name: string;
  name: string;
  slug: string;
  brand: string | null;
  description: string;
  attributes: unknown;
  primary_media_id: string;
  primary_media_alt_text: string;
}

interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  title: string;
  option_values: unknown;
  amount_minor: string;
  currency: string;
}

interface MediaRow {
  product_id: string;
  media_id: string;
  object_key: string;
  content_type: string;
}

const completePublishedProduct = `p.status = 'published'
  AND category.status = 'active'
  AND EXISTS (
    SELECT 1 FROM product_media required_media
    WHERE required_media.product_id = p.id AND required_media.is_primary = true
  )
  AND EXISTS (
    SELECT 1 FROM product_variants required_variant
    WHERE required_variant.product_id = p.id AND required_variant.status = 'active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM product_variants unpriced_variant
    WHERE unpriced_variant.product_id = p.id
      AND unpriced_variant.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM product_prices current_price
        WHERE current_price.variant_id = unpriced_variant.id
          AND current_price.valid_from <= NOW()
          AND (current_price.valid_to IS NULL OR current_price.valid_to > NOW())
      )
  )`;

const productProjectionColumns = `p.id, p.category_id,
  category.name AS category_name, p.name, p.slug, p.brand, p.description,
  p.attributes, primary_media.id AS primary_media_id,
  primary_media.alt_text AS primary_media_alt_text`;

const productProjectionJoins = `JOIN categories category ON category.id = p.category_id
  JOIN LATERAL (
    SELECT media.id, media.alt_text
    FROM product_media media
    WHERE media.product_id = p.id AND media.is_primary = true
    LIMIT 1
  ) primary_media ON true`;

export class PostgresqlPublicCatalogRepository implements PublicCatalogRepository {
  async inspectPublicationReadiness(
    session: DatabaseSession,
    productId: string,
  ): Promise<PublicationReadinessSnapshot | undefined> {
    const product = await session.query<ReadinessRow>(
      `SELECT category.status = 'active' AS category_active,
              (SELECT count(*)::int FROM product_media media
               WHERE media.product_id = p.id AND media.is_primary = true)
                AS primary_image_count
       FROM products p
       JOIN categories category ON category.id = p.category_id
       WHERE p.id = $1`,
      [productId],
    );
    const row = product.rows[0];
    if (row === undefined) return undefined;

    const variants = await session.query<ReadinessVariantRow>(
      `SELECT variant.id AS variant_id,
              EXISTS (
                SELECT 1 FROM product_prices price
                WHERE price.variant_id = variant.id
                  AND price.valid_from <= NOW()
                  AND (price.valid_to IS NULL OR price.valid_to > NOW())
              ) AS has_current_price
       FROM product_variants variant
       WHERE variant.product_id = $1 AND variant.status = 'active'
       ORDER BY variant.id`,
      [productId],
    );
    return {
      categoryActive: row.category_active,
      primaryImageCount: row.primary_image_count,
      activeVariants: variants.rows.map((variant) => ({
        variantId: variant.variant_id,
        hasCurrentPrice: variant.has_current_price,
      })),
    };
  }

  async listCategories(session: DatabaseSession): Promise<readonly PublicCategoryDto[]> {
    const result = await session.query<CategoryRow>(
      `SELECT category.id, category.parent_id, category.name, category.slug,
              category.description, category.sort_order
       FROM categories category
       WHERE category.status = 'active'
         AND EXISTS (
           SELECT 1 FROM products p
           WHERE p.category_id = category.id AND ${completePublishedProduct}
         )
       ORDER BY category.sort_order, category.name, category.id`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      ...(row.parent_id === null ? {} : { parentId: row.parent_id }),
      name: row.name,
      slug: row.slug,
      ...(row.description === null ? {} : { description: row.description }),
      sortOrder: row.sort_order,
    }));
  }

  async listProducts(
    session: DatabaseSession,
    query: PublicProductListQuery,
  ): Promise<PublicProductListResult> {
    const values: unknown[] = [];
    const filters = [completePublishedProduct];
    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (query.query !== undefined && query.query.trim().length > 0) {
      const parameter = bind(`%${query.query.trim()}%`);
      filters.push(`(p.name ILIKE ${parameter} OR p.brand ILIKE ${parameter} OR EXISTS (
        SELECT 1 FROM product_variants search_variant
        WHERE search_variant.product_id = p.id AND search_variant.sku ILIKE ${parameter}
      ))`);
    }
    if (query.category !== undefined && query.category.trim().length > 0) {
      filters.push(`lower(category.slug) = lower(${bind(query.category.trim())})`);
    }
    const where = filters.join(" AND ");
    const count = await session.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM products p
       JOIN categories category ON category.id = p.category_id
       WHERE ${where}`,
      values,
    );
    const limit = bind(query.pageSize);
    const offset = bind((query.page - 1) * query.pageSize);
    const products = await session.query<ProductRow>(
      `SELECT ${productProjectionColumns}
       FROM products p
       ${productProjectionJoins}
       WHERE ${where}
       ORDER BY p.updated_at DESC, p.id
       LIMIT ${limit} OFFSET ${offset}`,
      values,
    );
    return {
      items: await this.mapProducts(session, products.rows),
      totalItems: Number(count.rows[0]?.total ?? 0),
    };
  }

  async findProductBySlug(
    session: DatabaseSession,
    slug: string,
  ): Promise<PublicProductProjection | undefined> {
    const result = await session.query<ProductRow>(
      `SELECT ${productProjectionColumns}
       FROM products p
       ${productProjectionJoins}
       WHERE lower(p.slug) = lower($1) AND ${completePublishedProduct}`,
      [slug],
    );
    if (result.rows[0] === undefined) return undefined;
    return (await this.mapProducts(session, result.rows))[0];
  }

  async findMediaAuthorization(
    session: DatabaseSession,
    productId: string,
    mediaId: string,
  ): Promise<PublicMediaAuthorization | undefined> {
    const result = await session.query<MediaRow>(
      `SELECT p.id AS product_id, media.id AS media_id,
              media.object_key, media.content_type
       FROM products p
       JOIN categories category ON category.id = p.category_id
       JOIN product_media media ON media.product_id = p.id
       WHERE p.id = $1 AND media.id = $2 AND ${completePublishedProduct}`,
      [productId, mediaId],
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : {
          productId: row.product_id,
          mediaId: row.media_id,
          objectKey: row.object_key,
          contentType: row.content_type,
        };
  }

  private async mapProducts(
    session: DatabaseSession,
    rows: readonly ProductRow[],
  ): Promise<readonly PublicProductProjection[]> {
    if (rows.length === 0) return [];
    const variants = await session.query<VariantRow>(
      `SELECT variant.id, variant.product_id, variant.sku, variant.title,
              variant.option_values, price.amount_minor::text, price.currency
       FROM product_variants variant
       JOIN LATERAL (
         SELECT candidate.amount_minor, candidate.currency
         FROM product_prices candidate
         WHERE candidate.variant_id = variant.id
           AND candidate.valid_from <= NOW()
           AND (candidate.valid_to IS NULL OR candidate.valid_to > NOW())
         ORDER BY candidate.valid_from DESC
         LIMIT 1
       ) price ON true
       WHERE variant.product_id = ANY($1::uuid[]) AND variant.status = 'active'
       ORDER BY variant.product_id, variant.created_at, variant.id`,
      [rows.map(({ id }) => id)],
    );
    const byProduct = new Map<string, VariantRow[]>();
    for (const variant of variants.rows) {
      const current = byProduct.get(variant.product_id) ?? [];
      current.push(variant);
      byProduct.set(variant.product_id, current);
    }
    return rows.map((row) => {
      assertAttributes(row.attributes);
      return {
        id: row.id,
        categoryId: row.category_id,
        categoryName: row.category_name,
        name: row.name,
        slug: row.slug,
        ...(row.brand === null ? {} : { brand: row.brand }),
        description: row.description,
        attributes: structuredClone(row.attributes),
        primaryMedia: {
          id: row.primary_media_id,
          altText: row.primary_media_alt_text,
        },
        variants: (byProduct.get(row.id) ?? []).map(mapVariant),
      };
    });
  }
}

function mapVariant(row: VariantRow): PublicProductProjection["variants"][number] {
  assertVariantOptions(row.option_values);
  if (row.currency !== "VND") throw new Error(`Invalid public currency: ${row.currency}`);
  const amountMinor = Number(row.amount_minor);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error("Product price exceeds safe integer range");
  }
  return {
    id: row.id,
    sku: row.sku,
    title: row.title,
    optionValues: structuredClone(row.option_values),
    price: { amountMinor, currency: "VND" },
  };
}
