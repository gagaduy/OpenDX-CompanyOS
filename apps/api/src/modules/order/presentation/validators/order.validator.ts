// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { OrderListQuery, TransitionOrderRequest } from "../../application/dtos/order.dto";

const uuid = z.uuid();
const listSchema = z.object({
  status: z.enum(["pending_payment", "paid", "processing", "ready_for_fulfillment", "completed", "canceled", "expired"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
const transitionSchema = z.object({
  targetStatus: z.enum(["canceled", "processing", "ready_for_fulfillment", "completed"]),
  reasonCode: z.string().trim().min(1).max(96),
  version: z.number().int().positive(),
}).strict();
const keySchema = z.string().trim().min(1).max(128);

export const parseOrderId = (value: unknown): string => parse(uuid, value);
export const parseOrderList = (value: unknown): OrderListQuery => parse(listSchema, value);
export function parseTransition(body: unknown, idempotencyKey: unknown): TransitionOrderRequest {
  return { ...parse(transitionSchema, body), idempotencyKey: parse(keySchema, idempotencyKey) };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); }
  catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new ApplicationError(400, "VALIDATION_ERROR", "Validation failed", error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
}
