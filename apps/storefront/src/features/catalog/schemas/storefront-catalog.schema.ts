// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const nonEmptyTextSchema = z.string().trim().min(1);

export const storefrontAssuranceIconKeySchema = z.enum([
  "truck",
  "shield-check",
  "badge-percent",
  "headphones",
]);

export const storefrontContentSchema = z.object({
  assurances: z.array(z.object({
    code: nonEmptyTextSchema,
    iconKey: storefrontAssuranceIconKeySchema,
    title: nonEmptyTextSchema,
    description: nonEmptyTextSchema,
  })),
  metrics: z.array(z.object({
    code: nonEmptyTextSchema,
    displayValue: nonEmptyTextSchema,
    label: nonEmptyTextSchema,
  })),
});

export const storefrontContentEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: storefrontContentSchema,
});

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  sortOrder: z.number(),
});
export const variantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  title: z.string(),
  optionValues: z.record(z.string(), z.string()),
  price: z.object({
    amountMinor: z.number().int().nonnegative(),
    currency: z.literal("VND"),
    previousAmountMinor: z.number().int().positive().optional(),
    discountPercentage: z.number().int().min(1).max(99).optional(),
  }),
  availableQuantity: z.number().int().nonnegative(),
  purchasable: z.boolean(),
});
export const productSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  name: z.string(),
  slug: z.string(),
  brand: z.string().optional(),
  description: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  primaryMedia: z.object({
    id: z.string(),
    altText: z.string(),
    contentUrl: z.string(),
  }),
  variants: z.array(variantSchema),
});
export const heroCategorySchema = categorySchema.pick({
  id: true,
  name: true,
  slug: true,
});
export const heroSlideSchema = z.object({
  category: heroCategorySchema,
  product: productSchema,
});
export const heroSlidesEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.array(heroSlideSchema),
});
export const categoriesEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.array(categorySchema),
});
export const productsEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.array(productSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
});
export const productEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: productSchema,
});
