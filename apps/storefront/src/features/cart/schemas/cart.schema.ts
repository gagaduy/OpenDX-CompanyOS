// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const cartLineSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  productId: z.string().optional(),
  productName: z.string(),
  productSlug: z.string().optional(),
  variantTitle: z.string(),
  sku: z.string().optional(),
  optionValues: z.record(z.string(), z.string()),
  primaryMediaUrl: z.string().optional(),
  primaryMediaAltText: z.string(),
  quantity: z.number().int().positive(),
  unitPriceVnd: z.number().int().nonnegative(),
  subtotalVnd: z.number().int().nonnegative(),
  availableQuantity: z.number().int().nonnegative(),
  purchasable: z.boolean(),
  change: z.enum(["unchanged", "price_changed", "unavailable"]),
});
export const cartSchema = z.object({
  id: z.string().optional(),
  ownerKind: z.enum(["anonymous", "guest", "customer"]),
  version: z.number().int().nonnegative(),
  status: z.enum(["empty", "active", "checkout_ready"]),
  items: z.array(cartLineSchema),
  itemCount: z.number().int().nonnegative(),
  totalVnd: z.number().int().nonnegative(),
  requiresAction: z.boolean(),
});
export const cartEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: cartSchema,
});
export const guestEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({ kind: z.literal("guest"), expiresAt: z.string() }),
});
