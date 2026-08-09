// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const checkoutLineSchema = z.object({
  sku: z.string(),
  productTitle: z.string(),
  variantLabel: z.string(),
  quantity: z.number().int().positive(),
  unitPriceVnd: z.number().int().nonnegative(),
  lineSubtotalVnd: z.number().int().nonnegative(),
});

const paymentInitiationSchema = z.object({
  actionUrl: z.url(),
  method: z.literal("POST"),
  fields: z.array(z.object({ name: z.string(), value: z.string() })),
});

export const checkoutSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  status: z.enum(["order_created", "completed", "expired", "canceled"]),
  subtotalVnd: z.number().int().nonnegative(),
  discountVnd: z.number().int().nonnegative(),
  totalVnd: z.number().int().nonnegative(),
  currency: z.literal("VND"),
  expiresAt: z.string(),
  promotionCode: z.string().optional(),
  lines: z.array(checkoutLineSchema),
});

export const checkoutCreationSchema = checkoutSchema.extend({
  payment: paymentInitiationSchema,
});

export const checkoutEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: checkoutSchema,
});

export const checkoutCreationEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: checkoutCreationSchema,
});

export const paymentInitiationEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: paymentInitiationSchema,
});
