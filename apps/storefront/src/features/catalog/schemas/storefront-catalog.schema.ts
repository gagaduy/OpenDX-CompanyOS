// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const categorySchema = z.object({ id: z.string(), name: z.string(), slug: z.string(), description: z.string().optional(), sortOrder: z.number() });
export const variantSchema = z.object({
  id: z.string(), sku: z.string(), title: z.string(), optionValues: z.record(z.string(), z.string()),
  price: z.object({ amountMinor: z.number().int().nonnegative(), currency: z.literal("VND") }),
  availableQuantity: z.number().int().nonnegative(), purchasable: z.boolean(),
});
export const productSchema = z.object({
  id: z.string(), categoryId: z.string(), categoryName: z.string(), name: z.string(), slug: z.string(),
  brand: z.string().optional(), description: z.string(), attributes: z.record(z.string(), z.unknown()),
  primaryMedia: z.object({ id: z.string(), altText: z.string(), contentUrl: z.string() }),
  variants: z.array(variantSchema),
});
export const categoriesEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: z.array(categorySchema) });
export const productsEnvelopeSchema = z.object({
  success: z.literal(true), message: z.string(), data: z.array(productSchema),
  meta: z.object({ page: z.number(), pageSize: z.number(), totalItems: z.number(), totalPages: z.number() }),
});
export const productEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: productSchema });
