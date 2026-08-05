// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { PublicProductListQuery } from "../../application/dtos/requests/public-catalog-request.dto";

const page = z.coerce.number().int().positive();
const querySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(220).optional(),
  stockStatus: z.enum(["in_stock", "out_of_stock"]).optional(),
  page: page.default(1),
  pageSize: page.max(100).default(20),
});
const slugSchema = z.string().trim().min(1).max(220);
const idSchema = z.uuid();
const versionSchema = z.object({ version: z.number().int().positive() }).strict();

export const parsePublicProductList = (value: unknown): PublicProductListQuery => parse(querySchema, value);
export const parsePublicSlug = (value: unknown): string => parse(slugSchema, value);
export const parsePublicId = (value: unknown): string => parse(idSchema, value);
export const parsePublicationVersion = (value: unknown): { readonly version: number } => parse(versionSchema, value);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); }
  catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new ApplicationError(400, "VALIDATION_ERROR", "Validation failed", error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
}
