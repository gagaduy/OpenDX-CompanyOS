// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import type {
  CreateVariantRequestDto,
  ReplacePriceRequestDto,
  UpdateVariantRequestDto,
} from "../../application/dtos/requests/variant-request.dto";
import { ApplicationError } from "../../../../shared/http/application-error";

const text = z.string().trim().min(1);
const options = z.record(text, text).refine((value) => Object.keys(value).length > 0, {
  message: "At least one variant option is required",
});
const createSchema = z.object({
  sku: text.max(120),
  title: text.max(200),
  optionValues: options,
}).strict();
const updateSchema = z.object({
  sku: text.max(120).optional(),
  title: text.max(200).optional(),
  optionValues: options.optional(),
  version: z.number().int().positive(),
}).strict();
const archiveSchema = z.object({ version: z.number().int().positive() }).strict();
const priceSchema = z.object({
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal("VND"),
}).strict();
const idSchema = z.uuid();

export const parseCreateVariant = (value: unknown): CreateVariantRequestDto => parse(createSchema, value);
export const parseUpdateVariant = (value: unknown): UpdateVariantRequestDto => parse(updateSchema, value);
export const parseArchiveVariant = (value: unknown): { readonly version: number } => parse(archiveSchema, value);
export const parseReplacePrice = (value: unknown): ReplacePriceRequestDto => parse(priceSchema, value);
export const parseCatalogId = (value: unknown): string => parse(idSchema, value);

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
