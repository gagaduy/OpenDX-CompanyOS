// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
import { productSchema } from "../../catalog";

export const wishlistMutationEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    productId: z.string().uuid(),
    wished: z.boolean(),
  }),
});

export const wishlistEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.array(productSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
