// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import type { UpdateProductMediaRequestDto } from "../../application/dtos/requests/media-request.dto";
import { ApplicationError } from "../../../../shared/http/application-error";

const booleanField = z.preprocess(
  (value) => value === "true" ? true : value === "false" ? false : value,
  z.boolean(),
);
const uploadSchema = z.object({
  altText: z.string().trim().min(1).max(500),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isPrimary: booleanField.default(false),
});
const updateSchema = z.object({
  altText: z.string().trim().min(1).max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional(),
}).strict();
const idSchema = z.uuid();

export const parseMediaUploadFields = (value: unknown) => parse(uploadSchema, value);
export const parseMediaUpdate = (value: unknown): UpdateProductMediaRequestDto => parse(updateSchema, value);
export const parseMediaId = (value: unknown): string => parse(idSchema, value);

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
