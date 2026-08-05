// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import type {
  CreateProductRequestDto,
  ProductListQuery,
  UpdateProductRequestDto,
} from "../../application/dtos/requests/product-request.dto";
import { ApplicationError } from "../../../../shared/http/application-error";

const id = z.uuid();
const text = z.string().trim().min(1);
const page = z.coerce.number().int().positive();
const attributeValue = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);
const attributes = z.record(z.string().trim().min(1), attributeValue);

const listSchema = z.object({
  query: z.string().trim().min(1).optional(),
  categoryId: id.optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  page: page.default(1),
  pageSize: page.max(100).default(20),
});
const createSchema = z.object({
  categoryId: id,
  name: text.max(200),
  slug: text.max(220).optional(),
  brand: text.max(160).optional(),
  description: text.max(10_000),
  attributes: attributes.default({}),
}).strict();
const updateSchema = z.object({
  categoryId: id.optional(),
  name: text.max(200).optional(),
  slug: text.max(220).optional(),
  brand: text.max(160).nullable().optional(),
  description: text.max(10_000).optional(),
  attributes: attributes.optional(),
  version: z.number().int().positive(),
}).strict();
const archiveSchema = z.object({ version: z.number().int().positive() }).strict();

export const parseProductListQuery = (value: unknown): ProductListQuery => parse(listSchema, value);
export const parseCreateProduct = (value: unknown): CreateProductRequestDto => parse(createSchema, value);
export const parseUpdateProduct = (value: unknown): UpdateProductRequestDto => parse(updateSchema, value);
export const parseArchiveProduct = (value: unknown): { readonly version: number } => parse(archiveSchema, value);

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
