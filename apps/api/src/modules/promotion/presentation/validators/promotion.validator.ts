// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { CreatePromotionRequest, UpdatePromotionRequest } from "../../application/dtos/promotion.dto";

const uuid = z.uuid();
const common = {
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  maximumDiscountVnd: z.number().int().positive().safe().optional(),
  minimumSubtotalVnd: z.number().int().nonnegative().safe(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  totalUsageLimit: z.number().int().positive().safe().optional(),
  perCustomerLimit: z.number().int().positive().safe().optional(),
  status: z.enum(["draft", "active", "inactive"]),
};
const createSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("percentage"), percentageBps: z.number().int().min(1).max(10_000) }).strict(),
  z.object({ ...common, type: z.literal("fixed_amount"), fixedAmountVnd: z.number().int().positive().safe() }).strict(),
]);
const updateSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("percentage"), percentageBps: z.number().int().min(1).max(10_000), version: z.number().int().positive() }).strict(),
  z.object({ ...common, type: z.literal("fixed_amount"), fixedAmountVnd: z.number().int().positive().safe(), version: z.number().int().positive() }).strict(),
]);

export const parsePromotionId = (value: unknown): string => parse(uuid, value);
export const parseCreatePromotion = (value: unknown): CreatePromotionRequest => parse(createSchema, value);
export const parseUpdatePromotion = (value: unknown): UpdatePromotionRequest => parse(updateSchema, value);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new ApplicationError(400, "VALIDATION_ERROR", "Validation failed", error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
}
