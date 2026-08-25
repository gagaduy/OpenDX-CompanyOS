// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type {
  CatalogHealthRepository,
  CatalogMerchandisingSummary,
  CatalogProductCompleteness,
  CatalogPublicationEvidence,
  CatalogPublicationReadinessQuery,
  CatalogPublicationReadinessSummary,
  CatalogReadinessReason,
} from "../../../application/services/interfaces/catalog-health-reader";

type Row = Record<string, unknown>;

const productHealthCte = `
  WITH product_health AS (
    SELECT product.id,product.status,product.updated_at,
      length(trim(COALESCE(product.brand,'')))>0 AS has_brand,
      product.attributes<>'{}'::jsonb AS has_attributes,
      variant.active_count,variant.priced_count,
      media.media_count,media.primary_count
    FROM products product
    LEFT JOIN LATERAL (
      SELECT count(*)::bigint AS active_count,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM product_prices price
          WHERE price.variant_id=variant.id AND price.valid_from<=$3
            AND (price.valid_to IS NULL OR $3<price.valid_to)
        ))::bigint AS priced_count
      FROM product_variants variant
      WHERE variant.product_id=product.id AND variant.status='active'
    ) variant ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::bigint AS media_count,
        count(*) FILTER (WHERE media.is_primary)::bigint AS primary_count
      FROM product_media media WHERE media.product_id=product.id
    ) media ON true
    WHERE product.status='draft' AND product.updated_at>=$1 AND product.updated_at<$2
  ), readiness AS (
    SELECT *,array_remove(ARRAY[
      CASE WHEN NOT has_brand THEN 'MISSING_BRAND' END,
      CASE WHEN NOT has_attributes THEN 'EMPTY_ATTRIBUTES' END,
      CASE WHEN active_count=0 THEN 'NO_ACTIVE_VARIANT' END,
      CASE WHEN active_count>0 AND priced_count<active_count THEN 'MISSING_CURRENT_PRICE' END,
      CASE WHEN media_count=0 THEN 'NO_MEDIA' END,
      CASE WHEN primary_count<>1 THEN 'PRIMARY_MEDIA_INVALID' END
    ],NULL)::text[] AS reason_codes
    FROM product_health
  )`;

export class PostgresqlCatalogHealthRepository implements CatalogHealthRepository {
  async readProductCompleteness(
    session: DatabaseSession,
    asOf: string,
  ): Promise<CatalogProductCompleteness> {
    const result = await session.query<Row>(`
      WITH health AS (
        SELECT product.status,
          length(trim(COALESCE(product.brand,'')))>0 AS has_brand,
          product.attributes<>'{}'::jsonb AS has_attributes,
          variant.active_count,variant.priced_count,
          media.media_count,media.primary_count
        FROM products product
        LEFT JOIN LATERAL (
          SELECT count(*)::bigint AS active_count,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM product_prices price
              WHERE price.variant_id=variant.id AND price.valid_from<=$1
                AND (price.valid_to IS NULL OR $1<price.valid_to)
            ))::bigint AS priced_count
          FROM product_variants variant
          WHERE variant.product_id=product.id AND variant.status='active'
        ) variant ON true
        LEFT JOIN LATERAL (
          SELECT count(*)::bigint AS media_count,
            count(*) FILTER (WHERE media.is_primary)::bigint AS primary_count
          FROM product_media media WHERE media.product_id=product.id
        ) media ON true
        WHERE product.status<>'archived'
      ), aggregate AS (
        SELECT count(*)::bigint AS total_products,
          count(*) FILTER (WHERE status='draft')::bigint AS draft_products,
          count(*) FILTER (WHERE status='published')::bigint AS published_products,
          count(*) FILTER (WHERE NOT has_brand)::bigint AS missing_brand,
          count(*) FILTER (WHERE NOT has_attributes)::bigint AS empty_attributes,
          count(*) FILTER (WHERE active_count=0)::bigint AS without_active_variant,
          count(*) FILTER (WHERE active_count>0 AND priced_count<active_count)::bigint
            AS without_current_price,
          count(*) FILTER (WHERE media_count=0)::bigint AS without_media,
          count(*) FILTER (WHERE primary_count<>1)::bigint AS without_primary_media,
          count(*) FILTER (WHERE has_brand AND has_attributes AND active_count>0
            AND priced_count=active_count AND media_count>0 AND primary_count=1)::bigint
            AS complete_products
        FROM health
      )
      SELECT *,CASE WHEN total_products=0 THEN 10000
        ELSE (complete_products*10000/total_products)::bigint END AS completeness_basis_points
      FROM aggregate`, [asOf]);
    const row = result.rows[0] ?? {};
    return {
      totalProducts: integer(row.total_products),
      draftProducts: integer(row.draft_products),
      publishedProducts: integer(row.published_products),
      missingBrand: integer(row.missing_brand),
      emptyAttributes: integer(row.empty_attributes),
      withoutActiveVariant: integer(row.without_active_variant),
      withoutCurrentPrice: integer(row.without_current_price),
      withoutMedia: integer(row.without_media),
      withoutPrimaryMedia: integer(row.without_primary_media),
      completenessBasisPoints: integer(row.completeness_basis_points),
    };
  }

  async readPublicationReadiness(
    session: DatabaseSession,
    query: CatalogPublicationReadinessQuery,
  ): Promise<{
    readonly summary: CatalogPublicationReadinessSummary;
    readonly evidence: readonly CatalogPublicationEvidence[];
  }> {
    const summaryResult = await session.query<Row>(`${productHealthCte}
      SELECT count(*)::bigint AS draft_reviewed,
        count(*) FILTER (WHERE cardinality(reason_codes)=0)::bigint AS ready_count,
        count(*) FILTER (WHERE cardinality(reason_codes)>0)::bigint AS blocked_count,
        count(*) FILTER (WHERE reason_codes@>ARRAY['MISSING_BRAND'])::bigint AS missing_brand,
        count(*) FILTER (WHERE reason_codes@>ARRAY['EMPTY_ATTRIBUTES'])::bigint AS empty_attributes,
        count(*) FILTER (WHERE reason_codes@>ARRAY['NO_ACTIVE_VARIANT'])::bigint AS no_active_variant,
        count(*) FILTER (WHERE reason_codes@>ARRAY['MISSING_CURRENT_PRICE'])::bigint AS missing_current_price,
        count(*) FILTER (WHERE reason_codes@>ARRAY['NO_MEDIA'])::bigint AS no_media,
        count(*) FILTER (WHERE reason_codes@>ARRAY['PRIMARY_MEDIA_INVALID'])::bigint AS primary_media_invalid
      FROM readiness`, [query.start, query.end, query.asOf]);
    const summaryRow = summaryResult.rows[0] ?? {};
    const evidenceResult = await session.query<Row>(`${productHealthCte}
      SELECT id AS product_id,updated_at,reason_codes
      FROM readiness
      WHERE cardinality(reason_codes)>0
        AND ($4::timestamptz IS NULL OR (updated_at,id)>($4::timestamptz,$5::uuid))
      ORDER BY updated_at,id LIMIT $6`, [
      query.start,
      query.end,
      query.asOf,
      query.after?.updatedAt ?? null,
      query.after?.productId ?? null,
      query.limit,
    ]);
    return {
      summary: {
        draftReviewed: integer(summaryRow.draft_reviewed),
        readyCount: integer(summaryRow.ready_count),
        blockedCount: integer(summaryRow.blocked_count),
        reasonCounts: reasonCounts(summaryRow),
      },
      evidence: evidenceResult.rows.map((row) => ({
        productId: String(row.product_id),
        updatedAt: timestamp(row.updated_at),
        reasonCodes: stringArray(row.reason_codes) as readonly CatalogReadinessReason[],
      })),
    };
  }

  async readMerchandisingSummary(
    session: DatabaseSession,
    asOf: string,
  ): Promise<CatalogMerchandisingSummary> {
    const aggregateResult = await session.query<Row>(`
      WITH published AS (
        SELECT product.id,product.category_id,
          EXISTS(SELECT 1 FROM product_media media WHERE media.product_id=product.id)
            AS has_media
        FROM products product JOIN categories category ON category.id=product.category_id
        WHERE product.status='published' AND category.status='active'
      ), variants AS (
        SELECT variant.id,current_price.amount_minor
        FROM published JOIN product_variants variant ON variant.product_id=published.id
          AND variant.status='active'
        LEFT JOIN LATERAL (
          SELECT price.amount_minor FROM product_prices price
          WHERE price.variant_id=variant.id AND price.valid_from<=$1
            AND (price.valid_to IS NULL OR $1<price.valid_to)
          ORDER BY price.valid_from DESC,price.id LIMIT 1
        ) current_price ON true
      )
      SELECT (SELECT count(*)::bigint FROM categories WHERE status='active') AS active_categories,
        (SELECT count(*)::bigint FROM published) AS published_products,
        count(*)::bigint AS active_variants,
        count(amount_minor)::bigint AS currently_priced_variants,
        min(amount_minor)::bigint AS minimum_price_vnd,
        max(amount_minor)::bigint AS maximum_price_vnd,
        CASE WHEN (SELECT count(*) FROM published)=0 THEN 10000
          ELSE ((SELECT count(*) FROM published WHERE has_media)*10000
            /(SELECT count(*) FROM published))::bigint END AS media_coverage_basis_points
      FROM variants`, [asOf]);
    const distributionResult = await session.query<Row>(`
      WITH counts AS (
        SELECT product.category_id,count(*)::bigint AS product_count
        FROM products product JOIN categories category ON category.id=product.category_id
        WHERE product.status='published' AND category.status='active'
        GROUP BY product.category_id
      ), ranked AS (
        SELECT *,row_number() OVER (ORDER BY product_count DESC,category_id) AS position
        FROM counts
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'categoryId',category_id,'productCount',product_count
        ) ORDER BY product_count DESC,category_id) FILTER (WHERE position<=25),'[]'::jsonb)
          AS category_distribution,
        COALESCE(sum(product_count) FILTER (WHERE position>25),0)::bigint
          AS other_category_product_count
      FROM ranked`);
    const row = aggregateResult.rows[0] ?? {};
    const distribution = distributionResult.rows[0] ?? {};
    return {
      activeCategories: integer(row.active_categories),
      publishedProducts: integer(row.published_products),
      activeVariants: integer(row.active_variants),
      currentlyPricedVariants: integer(row.currently_priced_variants),
      mediaCoverageBasisPoints: integer(row.media_coverage_basis_points),
      minimumPriceVnd: nullableInteger(row.minimum_price_vnd),
      maximumPriceVnd: nullableInteger(row.maximum_price_vnd),
      categoryDistribution: categoryDistribution(distribution.category_distribution),
      otherCategoryProductCount: integer(distribution.other_category_product_count),
    };
  }
}

function reasonCounts(row: Row) {
  const values: readonly [CatalogReadinessReason, string][] = [
    ["MISSING_BRAND", "missing_brand"],
    ["EMPTY_ATTRIBUTES", "empty_attributes"],
    ["NO_ACTIVE_VARIANT", "no_active_variant"],
    ["MISSING_CURRENT_PRICE", "missing_current_price"],
    ["NO_MEDIA", "no_media"],
    ["PRIMARY_MEDIA_INVALID", "primary_media_invalid"],
  ];
  return values.flatMap(([reasonCode, field]) => {
    const count = integer(row[field]);
    return count === 0 ? [] : [{ reasonCode, count }];
  });
}

function categoryDistribution(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = entry as Row;
    return { categoryId: String(row.categoryId), productCount: integer(row.productCount) };
  });
}

function integer(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new RangeError("Unsafe Catalog aggregate");
  return parsed;
}

function nullableInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : integer(value);
}

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid Catalog timestamp");
  return date.toISOString();
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(String) : [];
}
