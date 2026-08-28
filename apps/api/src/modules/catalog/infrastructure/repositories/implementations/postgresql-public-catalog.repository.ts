// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  PublicationReadinessSnapshot,
  PublicCatalogRepository,
  PublicHeroSlideProjection,
  PublicHeroMediaAuthorization,
  PublicHeroPresentationProjection,
  PublicMediaAuthorization,
  PublicProductListResult,
  PublicProductProjection,
  StorefrontVariantProjection,
} from "../../../application/repositories/interfaces/public-catalog.repository";
import type { PublicProductListQuery } from "../../../application/dtos/requests/public-catalog-request.dto";
import type {
  PublicCategoryDto,
  PublicStorefrontContentDto,
  StorefrontAssuranceIconKey,
} from "../../../application/dtos/responses/public-catalog-response.dto";
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

interface HeroProductRow extends ProductRow {
  category_slug: string;
}

interface HeroPresentationRow {
  id: string;
  object_key: string;
  content_type: "video/mp4";
  byte_size: string;
  duration_ms: number;
  configured_chapter_count: number;
}

interface HeroChapterProductRow extends HeroProductRow {
  start_ms: number;
  end_ms: number;
  label: string;
}

interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  title: string;
  option_values: unknown;
  amount_minor: string;
  currency: string;
  previous_amount_minor: string | null;
}

interface MediaRow {
  product_id: string;
  media_id: string;
  object_key: string;
  content_type: string;
}

interface HeroMediaRow {
  media_id: string;
  object_key: string;
  content_type: "video/mp4";
  byte_size: string;
}

interface StorefrontVariantRow extends VariantRow {
  product_name: string;
  product_slug: string;
  primary_media_id: string;
  primary_media_alt_text: string;
}

interface StorefrontAssuranceRow {
  code: string;
  icon_key: StorefrontAssuranceIconKey;
  title: string;
  description: string;
}

interface StorefrontMetricRow {
  code: string;
  display_value: string;
  label: string;
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

const qualifyingSalesStatuses =
  "('paid', 'processing', 'ready_for_fulfillment', 'completed')";

const currentPricePredicate = `current_price.valid_from <= NOW()
  AND (current_price.valid_to IS NULL OR current_price.valid_to > NOW())`;

const onSaleProductPredicate = `EXISTS (
  SELECT 1
  FROM product_variants sale_variant
  JOIN LATERAL (
    SELECT current_price.amount_minor, current_price.valid_from
    FROM product_prices current_price
    WHERE current_price.variant_id = sale_variant.id
      AND ${currentPricePredicate}
    ORDER BY current_price.valid_from DESC, current_price.id DESC
    LIMIT 1
  ) current_sale_price ON true
  JOIN LATERAL (
    SELECT previous_price.amount_minor
    FROM product_prices previous_price
    WHERE previous_price.variant_id = sale_variant.id
      AND previous_price.valid_from < current_sale_price.valid_from
    ORDER BY previous_price.valid_from DESC, previous_price.id DESC
    LIMIT 1
  ) previous_sale_price ON true
  WHERE sale_variant.product_id = p.id
    AND sale_variant.status = 'active'
    AND current_sale_price.amount_minor < previous_sale_price.amount_minor
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
  async listStorefrontContent(
    session: DatabaseSession,
  ): Promise<PublicStorefrontContentDto> {
    const assurances = await session.query<StorefrontAssuranceRow>(
      `SELECT code, icon_key, title, description
       FROM storefront_service_assurances
       WHERE enabled = true
       ORDER BY sort_order, code`,
    );
    const metrics = await session.query<StorefrontMetricRow>(
      `SELECT code, display_value, label
       FROM storefront_trust_metrics
       WHERE enabled = true
       ORDER BY sort_order, code`,
    );
    return {
      assurances: assurances.rows.map((row) => ({
        code: row.code,
        iconKey: row.icon_key,
        title: row.title,
        description: row.description,
      })),
      metrics: metrics.rows.map((row) => ({
        code: row.code,
        displayValue: row.display_value,
        label: row.label,
      })),
    };
  }

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

  async listHeroSlides(
    session: DatabaseSession,
  ): Promise<readonly PublicHeroSlideProjection[]> {
    const result = await session.query<HeroProductRow>(
      `WITH eligible_products AS (
         SELECT p.id,
                row_number() OVER (
                  PARTITION BY p.category_id
                  ORDER BY p.created_at DESC, p.id ASC
                ) AS category_rank
         FROM products p
         JOIN categories category ON category.id = p.category_id
         WHERE ${completePublishedProduct}
       )
       SELECT ${productProjectionColumns}, category.slug AS category_slug
       FROM eligible_products eligible
       JOIN products p ON p.id = eligible.id
       ${productProjectionJoins}
       WHERE eligible.category_rank = 1
       ORDER BY category.sort_order ASC, category.id ASC`,
    );
    const products = await this.mapProducts(session, result.rows);
    return result.rows.map((row, index) => ({
      category: {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
      },
      product: products[index]!,
    }));
  }

  async findActiveHeroPresentation(
    session: DatabaseSession,
  ): Promise<PublicHeroPresentationProjection | undefined> {
    const presentationResult = await session.query<HeroPresentationRow>(
      `SELECT presentation.id, presentation.object_key,
              presentation.content_type, presentation.byte_size::text,
              presentation.duration_ms,
              (SELECT count(*)::int
               FROM storefront_hero_chapters chapter
               WHERE chapter.presentation_id = presentation.id)
                AS configured_chapter_count
       FROM storefront_hero_presentations presentation
       WHERE presentation.enabled = true`,
    );
    const presentation = presentationResult.rows[0];
    if (presentation === undefined) return undefined;

    const chapterResult = await session.query<HeroChapterProductRow>(
      `WITH eligible_chapters AS (
         SELECT chapter.category_id, chapter.sort_order, chapter.start_ms,
                chapter.end_ms, chapter.label, newest.id AS product_id
         FROM storefront_hero_chapters chapter
         JOIN LATERAL (
           SELECT p.id
           FROM products p
           JOIN categories category ON category.id = p.category_id
           WHERE p.category_id = chapter.category_id
             AND ${completePublishedProduct}
           ORDER BY p.created_at DESC, p.id ASC
           LIMIT 1
         ) newest ON true
         WHERE chapter.presentation_id = $1
       )
       SELECT ${productProjectionColumns}, category.slug AS category_slug,
              eligible.start_ms, eligible.end_ms, eligible.label
       FROM eligible_chapters eligible
       JOIN products p ON p.id = eligible.product_id
       ${productProjectionJoins}
       ORDER BY eligible.sort_order, eligible.category_id`,
      [presentation.id],
    );
    const products = await this.mapProducts(session, chapterResult.rows);
    return {
      media: {
        id: presentation.id,
        objectKey: presentation.object_key,
        contentType: presentation.content_type,
        byteSize: toSafeInteger(presentation.byte_size, "Hero media byte size"),
        durationMs: presentation.duration_ms,
      },
      configuredChapterCount: presentation.configured_chapter_count,
      slides: chapterResult.rows.map((row, index) => ({
        category: {
          id: row.category_id,
          name: row.category_name,
          slug: row.category_slug,
        },
        product: products[index]!,
        chapter: {
          startMs: row.start_ms,
          endMs: row.end_ms,
          label: row.label,
        },
      })),
    };
  }

  async findHeroMediaAuthorization(
    session: DatabaseSession,
    mediaId: string,
  ): Promise<PublicHeroMediaAuthorization | undefined> {
    const result = await session.query<HeroMediaRow>(
      `SELECT presentation.id AS media_id, presentation.object_key,
              presentation.content_type, presentation.byte_size::text
       FROM storefront_hero_presentations presentation
       WHERE presentation.id = $1 AND presentation.enabled = true`,
      [mediaId],
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : {
          mediaId: row.media_id,
          objectKey: row.object_key,
          contentType: row.content_type,
          byteSize: toSafeInteger(row.byte_size, "Hero media byte size"),
        };
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
    if (query.minPriceVnd !== undefined || query.maxPriceVnd !== undefined) {
      const priceConditions = [
        "price_variant.product_id = p.id",
        "price_variant.status = 'active'",
        "price_filter.valid_from <= NOW()",
        "(price_filter.valid_to IS NULL OR price_filter.valid_to > NOW())",
      ];
      if (query.minPriceVnd !== undefined) priceConditions.push(`price_filter.amount_minor >= ${bind(query.minPriceVnd)}`);
      if (query.maxPriceVnd !== undefined) priceConditions.push(`price_filter.amount_minor <= ${bind(query.maxPriceVnd)}`);
      filters.push(`EXISTS (
        SELECT 1 FROM product_variants price_variant
        JOIN product_prices price_filter ON price_filter.variant_id = price_variant.id
        WHERE ${priceConditions.join(" AND ")}
      )`);
    }
    if (query.discountStatus === "on_sale") {
      filters.push(onSaleProductPredicate);
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
    const bestSellingQuantity = `COALESCE((
      SELECT sum(best_line.quantity)::bigint
      FROM order_lines best_line
      JOIN orders best_order ON best_order.id = best_line.order_id
      JOIN product_variants best_variant ON best_variant.id = best_line.variant_id
      WHERE best_variant.product_id = p.id
        AND best_order.status IN ${qualifyingSalesStatuses}
    ), 0)`;
    const orderBy = query.sort === "price_asc"
      ? "minimum_price ASC, p.id"
      : query.sort === "price_desc"
        ? "minimum_price DESC, p.id"
        : query.sort === "name_asc"
          ? "lower(p.name) ASC, p.id"
          : query.sort === "best_selling"
            ? `${bestSellingQuantity} DESC, p.created_at DESC, p.id`
            : "p.created_at DESC, p.id";
    const products = await session.query<ProductRow>(
      `SELECT ${productProjectionColumns}
              ,(SELECT min(sort_price.amount_minor)
                FROM product_variants sort_variant
                JOIN product_prices sort_price ON sort_price.variant_id = sort_variant.id
                WHERE sort_variant.product_id = p.id AND sort_variant.status = 'active'
                  AND sort_price.valid_from <= NOW()
                  AND (sort_price.valid_to IS NULL OR sort_price.valid_to > NOW())) AS minimum_price
       FROM products p
       ${productProjectionJoins}
       WHERE ${where}
       ORDER BY ${orderBy}
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

  async findProductsByIds(
    session: DatabaseSession,
    productIds: readonly string[],
  ): Promise<readonly PublicProductProjection[]> {
    if (productIds.length === 0) return [];
    const result = await session.query<ProductRow>(
      `SELECT ${productProjectionColumns}
       FROM products p
       ${productProjectionJoins}
       WHERE p.id = ANY($1::uuid[]) AND ${completePublishedProduct}
       ORDER BY array_position($1::uuid[], p.id)`,
      [productIds],
    );
    return this.mapProducts(session, result.rows);
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

  async findStorefrontVariants(
    session: DatabaseSession,
    variantIds: readonly string[],
  ): Promise<readonly StorefrontVariantProjection[]> {
    if (variantIds.length === 0) return [];
    const result = await session.query<StorefrontVariantRow>(
      `SELECT variant.id, variant.product_id, variant.sku, variant.title,
              variant.option_values, price.amount_minor::text, price.currency,
              price.previous_amount_minor::text,
              p.name AS product_name, p.slug AS product_slug,
              primary_media.id AS primary_media_id,
              primary_media.alt_text AS primary_media_alt_text
       FROM product_variants variant
       JOIN products p ON p.id = variant.product_id
       JOIN categories category ON category.id = p.category_id
       JOIN LATERAL (
         SELECT candidate.amount_minor, candidate.currency,
                (SELECT previous.amount_minor
                 FROM product_prices previous
                 WHERE previous.variant_id = variant.id
                   AND previous.valid_from < candidate.valid_from
                 ORDER BY previous.valid_from DESC, previous.id DESC
                 LIMIT 1) AS previous_amount_minor
         FROM product_prices candidate
         WHERE candidate.variant_id = variant.id
           AND candidate.valid_from <= NOW()
           AND (candidate.valid_to IS NULL OR candidate.valid_to > NOW())
         ORDER BY candidate.valid_from DESC, candidate.id DESC
         LIMIT 1
       ) price ON true
       JOIN LATERAL (
         SELECT media.id, media.alt_text
         FROM product_media media
         WHERE media.product_id = p.id AND media.is_primary = true
         LIMIT 1
       ) primary_media ON true
       WHERE variant.id = ANY($1::uuid[])
         AND variant.status = 'active'
         AND ${completePublishedProduct}
       ORDER BY variant.id`,
      [variantIds],
    );
    return result.rows.map((row) => {
      const variant = mapVariant(row);
      return {
        variantId: variant.id,
        productId: row.product_id,
        productName: row.product_name,
        productSlug: row.product_slug,
        variantTitle: variant.title,
        sku: variant.sku,
        optionValues: variant.optionValues,
        unitPriceVnd: variant.price.amountMinor,
        primaryMediaId: row.primary_media_id,
        primaryMediaAltText: row.primary_media_alt_text,
      };
    });
  }

  private async mapProducts(
    session: DatabaseSession,
    rows: readonly ProductRow[],
  ): Promise<readonly PublicProductProjection[]> {
    if (rows.length === 0) return [];
    const variants = await session.query<VariantRow>(
      `SELECT variant.id, variant.product_id, variant.sku, variant.title,
              variant.option_values, price.amount_minor::text, price.currency,
              price.previous_amount_minor::text
       FROM product_variants variant
       JOIN LATERAL (
         SELECT candidate.amount_minor, candidate.currency,
                (SELECT previous.amount_minor
                 FROM product_prices previous
                 WHERE previous.variant_id = variant.id
                   AND previous.valid_from < candidate.valid_from
                 ORDER BY previous.valid_from DESC, previous.id DESC
                 LIMIT 1) AS previous_amount_minor
         FROM product_prices candidate
         WHERE candidate.variant_id = variant.id
           AND candidate.valid_from <= NOW()
           AND (candidate.valid_to IS NULL OR candidate.valid_to > NOW())
         ORDER BY candidate.valid_from DESC, candidate.id DESC
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
  const previousAmountMinor =
    row.previous_amount_minor === null
      ? undefined
      : Number(row.previous_amount_minor);
  if (
    previousAmountMinor !== undefined &&
    !Number.isSafeInteger(previousAmountMinor)
  ) {
    throw new Error("Previous product price exceeds safe integer range");
  }
  const markdown =
    previousAmountMinor !== undefined && previousAmountMinor > amountMinor
      ? {
          previousAmountMinor,
          discountPercentage: Number(
            ((BigInt(previousAmountMinor) - BigInt(amountMinor)) * 100n) /
              BigInt(previousAmountMinor),
          ),
        }
      : {};
  return {
    id: row.id,
    sku: row.sku,
    title: row.title,
    optionValues: structuredClone(row.option_values),
    price: { amountMinor, currency: "VND", ...markdown },
  };
}

function toSafeInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} exceeds safe integer range`);
  }
  return parsed;
}
