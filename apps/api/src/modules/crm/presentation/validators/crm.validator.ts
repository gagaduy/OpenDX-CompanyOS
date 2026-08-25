// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { CustomerSegment } from "../../domain/services/crm-rules";

const uuid = z.uuid();
const page = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
}).strict();
const customerSearch = page.extend({ search: z.string().trim().min(1).max(200).optional() }).strict();
const segment = z.enum(["new_customer", "first_time_buyer", "repeat_customer", "high_value", "inactive_90d"]);
const note = z.object({
  body: z.string().trim().min(1).max(4_000),
  correctsNoteId: uuid.optional(),
}).strict();
const followup = z.object({
  dueAt: z.iso.datetime({ offset: true }),
  description: z.string().trim().min(1).max(500),
}).strict();
const update = z.object({
  action: z.enum(["claim", "complete"]),
  version: z.number().int().positive(),
}).strict();

export const parseCustomerId = (value: unknown): string => parse(uuid, value);
export const parseFollowupId = (value: unknown): string => parse(uuid, value);
export const parseCustomerSearch = (value: unknown) => parse(customerSearch, value);
export const parsePage = (value: unknown) => parse(page, value);
export const parseSegmentId = (value: unknown): CustomerSegment => parse(segment, value);
export const parseNote = (value: unknown) => parse(note, value);
export const parseFollowup = (value: unknown) => parse(followup, value);
export const parseFollowupUpdate = (value: unknown) => parse(update, value);

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
