// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";
export const createCheckoutSchema = z.object({ addressId: z.uuid(), promotionCode: z.string().trim().min(1).max(64).optional(), paymentMethod: z.enum(["CARD", "BANK_TRANSFER", "NAPAS_BANK_TRANSFER"]).optional() }).strict();
export const checkoutIdSchema = z.uuid();
export function parseCheckout<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApplicationError(400, "VALIDATION_ERROR", "Validation failed", result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  return result.data;
}
export function parseIdempotencyKey(value: string | undefined): string {
  if (value === undefined || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) throw new ApplicationError(400, "VALIDATION_ERROR", "A valid Idempotency-Key header is required");
  return value;
}
