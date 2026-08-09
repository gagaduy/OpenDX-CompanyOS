// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import { z, ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";
import type {
  PaymentListQuery,
  ReconcilePaymentRequest,
} from "../../application/dtos/payment-admin.dto";

const paymentIdSchema = z.uuid();
const paymentListSchema = z.object({
  status: z
    .enum(["created", "pending_provider", "paid", "failed", "canceled", "expired"])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
const reconcileSchema = z
  .object({ providerOrderId: z.string().trim().min(1).max(160).optional() })
  .strict();

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

export const parsePaymentId = (value: unknown) => parse(paymentIdSchema, value);
export const parsePaymentList = (value: unknown): PaymentListQuery =>
  parse(paymentListSchema, value);
export const parseReconcile = (value: unknown): ReconcilePaymentRequest =>
  parse(reconcileSchema, value);
