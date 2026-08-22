// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";

const invocation = z.object({
  taskId: z.uuid(),
  toolName: z.enum([
    "catalog.product_completeness", "catalog.publication_readiness", "catalog.merchandising_summary",
    "inventory.stock_risk", "inventory.slow_stock", "inventory.reservation_anomalies",
    "order.stalled_summary", "order.invalid_state_evidence", "order.expiry_risk",
    "finance.pending_payments", "finance.reconciliation_discrepancies", "finance.provider_evidence_status",
    "crm.segment_summary", "crm.followup_opportunities", "support.sla_risk",
    "support.classification_summary", "support.related_order_context",
  ]),
  toolVersion: z.literal(1),
  purpose: z.literal("store_health_review"),
  dataScope: z.enum([
    "catalog:health:read", "inventory:health:read", "order:health:read",
    "finance:health:read", "crm:health:read", "support:health:read",
  ]),
  dataClassification: z.enum(["internal", "confidential", "restricted"]),
  modelId: z.string().trim().min(1).max(255),
  parameters: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().trim().min(1).max(255),
  correlationId: z.string().trim().min(1).max(255),
  causationId: z.string().trim().min(1).max(255),
  approvalId: z.uuid().optional(),
}).strict();

export function parseAgenticToolInvocation(value: unknown) {
  try {
    return invocation.parse(value);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new ApplicationError(400, "VALIDATION_ERROR", "Validation failed",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
}
