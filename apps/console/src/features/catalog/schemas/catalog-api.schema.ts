// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const attributeValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
export const categorySchema = z.object({
  id: z.uuid(), parentId: z.uuid().optional(), name: z.string(), slug: z.string(),
  description: z.string().optional(), sortOrder: z.number().int(), status: z.enum(["active", "archived"]),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), version: z.number().int().positive(),
});
export const productSchema = z.object({
  id: z.uuid(), categoryId: z.uuid(), name: z.string(), slug: z.string(), brand: z.string().optional(),
  description: z.string(), attributes: z.record(z.string(), attributeValue), status: z.enum(["draft", "archived"]),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), version: z.number().int().positive(),
});
export const productListItemSchema = productSchema.pick({
  id: true, categoryId: true, name: true, slug: true, brand: true, status: true, updatedAt: true, version: true,
}).extend({
  categoryName: z.string(), primaryMediaId: z.uuid().optional(), variantCount: z.number().int().nonnegative(),
  minimumPrice: z.number().int().nonnegative().optional(), maximumPrice: z.number().int().nonnegative().optional(),
});
export const categoriesEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: z.array(categorySchema) });
export const categoryEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: categorySchema });
export const productEnvelopeSchema = z.object({ success: z.literal(true), message: z.string(), data: productSchema });
export const productListEnvelopeSchema = z.object({
  success: z.literal(true), message: z.string(), data: z.array(productListItemSchema),
  meta: z.object({ page: z.number().int(), pageSize: z.number().int(), totalItems: z.number().int(), totalPages: z.number().int() }),
});
export const errorEnvelopeSchema = z.object({
  success: z.literal(false), message: z.string(), errorCode: z.string(), errors: z.array(z.unknown()).optional(),
});
