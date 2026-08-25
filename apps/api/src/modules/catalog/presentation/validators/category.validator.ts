// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import type {
  CreateCategoryRequestDto,
  UpdateCategoryRequestDto,
} from "../../application/dtos/requests/category-request.dto";
import { ApplicationError } from "../../../../shared/http/application-error";

const name = z.string().trim().min(1).max(160);
const slug = z.string().trim().min(1).max(180);
const id = z.uuid();
const sortOrder = z.number().int().min(0);
const version = z.number().int().positive();

const createSchema = z
  .object({
    parentId: id.optional(),
    name,
    slug: slug.optional(),
    description: z.string().trim().max(2_000).optional(),
    sortOrder: sortOrder.optional(),
  })
  .strict();

const updateSchema = z
  .object({
    parentId: id.nullable().optional(),
    name: name.optional(),
    slug: slug.optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    sortOrder: sortOrder.optional(),
    version,
  })
  .strict();

const archiveSchema = z.object({ version }).strict();

export function parseCreateCategory(value: unknown): CreateCategoryRequestDto {
  return parse(createSchema, value);
}

export function parseUpdateCategory(value: unknown): UpdateCategoryRequestDto {
  return parse(updateSchema, value);
}

export function parseArchiveCategory(value: unknown): { readonly version: number } {
  return parse(archiveSchema, value);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new ApplicationError(
      400,
      "VALIDATION_ERROR",
      "Validation failed",
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
}
