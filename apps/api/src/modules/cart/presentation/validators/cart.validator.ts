// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";

export const addCartItemSchema = z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(999) }).strict();
export const updateCartItemSchema = z.object({ quantity: z.number().int().min(1).max(999) }).strict();
export const cartResolutionSchema = z.object({
  action: z.enum(["keep_guest", "keep_saved", "merge"]),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();
export const cartItemIdSchema = z.string().uuid();

export function parseCart<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApplicationError(400, "VALIDATION_ERROR", "Validation failed", result.error.issues.map((issue) => ({
      path: issue.path.join("."), message: issue.message,
    })));
  }
  return result.data;
}
