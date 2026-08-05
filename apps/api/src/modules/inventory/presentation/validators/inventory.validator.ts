// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";
import type {
  AdjustStockRequestDto,
  InventoryListQuery,
  ReceiveStockRequestDto,
} from "../../application/dtos/inventory.dto";

const uuid = z.uuid();
const page = z.coerce.number().int().positive();
const boundedText = z.string().trim().min(1).max(200);
const listSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  categoryId: uuid.optional(),
  stockStatus: z.enum(["healthy", "low", "out_of_stock"]).optional(),
  page: page.default(1),
  pageSize: page.max(100).default(20),
});
const receiptSchema = z.object({
  variantId: uuid,
  quantity: z.number().int().positive().safe(),
  idempotencyKey: boundedText,
}).strict();
const adjustmentSchema = z.object({
  delta: z.number().int().safe().refine((value) => value !== 0, "Delta cannot be zero"),
  reasonCode: boundedText,
  reasonNote: z.string().trim().min(1).max(500).optional(),
  version: z.number().int().positive(),
}).strict();
const movementQuerySchema = z.object({
  page: page.default(1),
  pageSize: page.max(100).default(20),
});

export const parseInventoryId = (value: unknown): string => parse(uuid, value);
export const parseInventoryList = (value: unknown): InventoryListQuery => parse(listSchema, value);
export const parseReceipt = (value: unknown): ReceiveStockRequestDto => parse(receiptSchema, value);
export const parseAdjustment = (value: unknown): AdjustStockRequestDto => parse(adjustmentSchema, value);
export const parseMovementQuery = (value: unknown): { page: number; pageSize: number } => parse(movementQuerySchema, value);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new ApplicationError(
      400,
      "VALIDATION_ERROR",
      "Validation failed",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
}
