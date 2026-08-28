// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { z } from "zod";
import type { DepartmentToolName } from "./department-tool-contracts";

const timestamp = z.iso.datetime({ offset: true });
const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const basisPoints = z.number().int().min(0).max(10_000);
const cursor = z.string().min(1).max(2_048);
const windowShape = {
  start: timestamp,
  end: timestamp,
  timezone: z.literal("Asia/Ho_Chi_Minh"),
};
const aggregateWindow = z.strictObject(windowShape);
const evidenceWindow = z.strictObject({
  ...windowShape,
  limit: z.number().int().min(1).max(100).default(25),
  cursor: cursor.optional(),
});
const snapshotInput = z.strictObject({});
const countByStatus = z.array(z.strictObject({ status: z.string().min(1).max(64), count: safeInteger })).max(32);
const freshness = z.strictObject({
  asOf: timestamp,
  maxAgeSeconds: z.literal(60),
  status: z.literal("fresh"),
});
const resultWindow = z.strictObject(windowShape);

const catalogReason = z.enum([
  "MISSING_BRAND", "EMPTY_ATTRIBUTES", "NO_ACTIVE_VARIANT",
  "MISSING_CURRENT_PRICE", "NO_MEDIA", "PRIMARY_MEDIA_INVALID",
]);
const inventoryRisk = z.enum(["SOLD_OUT", "LOW_STOCK", "NO_SALES_VELOCITY", "BELOW_14_DAY_COVER"]);
const reservationReason = z.enum(["EXPIRED_ACTIVE", "FINALIZED_TIMESTAMP_MISSING", "STALE_PENDING"]);
const orderInvalidReason = z.enum([
  "PAID_TIMESTAMP_MISSING", "COMPLETED_TIMESTAMP_MISSING",
  "TERMINAL_TIMESTAMP_CONFLICT", "ILLEGAL_STATUS_TRANSITION",
]);
const orderStalledReason = z.enum(["PAID_NOT_PROCESSING", "PROCESSING_NOT_READY", "READY_NOT_COMPLETED"]);
const opportunityReason = z.enum([
  "OVERDUE_FOLLOWUP", "UNASSIGNED_FOLLOWUP", "SEGMENT_WITHOUT_OPEN_FOLLOWUP",
]);

const inputSchemas = {
  "catalog.product_completeness": snapshotInput,
  "catalog.publication_readiness": evidenceWindow,
  "catalog.merchandising_summary": snapshotInput,
  "inventory.stock_risk": evidenceWindow.extend({
    lowStockThreshold: z.number().int().min(0).max(100).default(5),
  }),
  "inventory.slow_stock": evidenceWindow.extend({
    minimumOnHand: z.number().int().min(1).max(10_000).default(1),
  }),
  "inventory.reservation_anomalies": evidenceWindow,
  "order.stalled_summary": evidenceWindow.extend({
    minimumAgeMinutes: z.number().int().min(15).max(10_080).default(120),
  }),
  "order.invalid_state_evidence": evidenceWindow,
  "order.expiry_risk": evidenceWindow.extend({
    horizonMinutes: z.number().int().min(15).max(1_440).default(120),
  }),
  "finance.pending_payments": aggregateWindow,
  "finance.reconciliation_discrepancies": evidenceWindow,
  "finance.provider_evidence_status": aggregateWindow,
  "crm.segment_summary": aggregateWindow,
  "crm.followup_opportunities": aggregateWindow,
  "support.sla_risk": evidenceWindow.extend({
    horizonMinutes: z.number().int().min(15).max(1_440).default(240),
  }),
  "support.classification_summary": aggregateWindow,
  "support.related_order_context": z.strictObject({ ticketId: z.uuid() }),
  "marketing.fetch_campaign_brief": z.strictObject({ campaign_id: z.uuid() }),
  "marketing.fetch_catalog_product_summary": z.strictObject({ product_id: z.string().min(1).max(255) }),
  "marketing.save_content_draft": z.strictObject({
    campaign_id: z.uuid(),
    primary_text: z.string().min(1).max(5000),
    headline: z.string().max(500).optional(),
    hashtags: z.array(z.string().min(1).max(100)).max(30),
    call_to_action: z.string().min(1).max(500),
    model_provenance: z.record(z.string(), z.unknown()).optional(),
  }),
  "marketing.save_visual_asset": z.strictObject({
    campaign_id: z.uuid(),
    asset_name: z.string().min(1).max(255),
    format: z.literal("png"),
    dimensions: z.strictObject({
      width: z.number().int().positive().max(4096),
      height: z.number().int().positive().max(4096),
    }),
    asset_bytes_base64: z.string().min(1).max(10_000_000),
    prompt_summary: z.string().max(2000).optional(),
  }),
  "marketing.assemble_publication_package": z.strictObject({
    campaign_id: z.uuid(),
    content_version_id: z.uuid(),
    visual_asset_id: z.uuid(),
  }),
  "marketing.fetch_publication_status": z.strictObject({
    campaign_id: z.uuid(),
    package_id: z.uuid().optional(),
  }),
} satisfies Record<DepartmentToolName, z.ZodType>;

const outputSchemas = {
  "marketing.fetch_campaign_brief": envelope(z.strictObject({
    campaign_id: z.uuid(),
    campaign_name: z.string(),
    objective: z.string(),
    subject: z.strictObject({
      kind: z.enum(["catalog_product", "free_topic"]),
      reference: z.string(),
    }),
    audience: z.string().nullable(),
    language: z.enum(["vi", "en"]),
    tone: z.string().nullable(),
    mandatory_message: z.string(),
    prohibited_claims: z.array(z.string()),
    call_to_action: z.string(),
    facebook_page_configuration_id: z.string(),
    scheduled_for: timestamp,
    deadline: timestamp,
    approver_id: z.string(),
    maximum_cost_micros: safeInteger,
    provenance: z.array(z.strictObject({
      sourceType: z.string(),
      sourceId: z.string(),
      sourceDigest: z.string(),
      classification: z.enum(["internal", "confidential"]),
    })),
  }), "internal", "department_only", false),
  "marketing.fetch_catalog_product_summary": envelope(z.strictObject({
    product_id: z.string(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    default_price_vnd: safeInteger.nullable(),
    primary_image_url: z.string().nullable(),
    is_published: z.boolean(),
    variant_count: safeInteger,
  }), "internal", "department_only", false),
  "marketing.save_content_draft": envelope(z.strictObject({
    content_version_id: z.uuid(),
    campaign_id: z.uuid(),
    version_number: z.number().int().positive(),
    created_at: timestamp,
  }), "internal", "department_only", false),
  "marketing.save_visual_asset": envelope(z.strictObject({
    visual_asset_id: z.uuid(),
    campaign_id: z.uuid(),
    version_number: z.number().int().positive(),
    storage_uri: z.string(),
    sha256_digest: z.string().regex(/^[a-f0-9]{64}$/),
    width: safeInteger,
    height: safeInteger,
    file_size_bytes: safeInteger,
    created_at: timestamp,
  }), "internal", "department_only", false),
  "marketing.assemble_publication_package": envelope(z.strictObject({
    package_id: z.uuid(),
    campaign_id: z.uuid(),
    package_version: z.number().int().positive(),
    content_version_id: z.uuid(),
    visual_asset_id: z.uuid(),
    payload_digest: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["draft", "submitted", "approved", "rejected", "published", "failed"]),
    created_at: timestamp,
  }), "confidential", "department_only", false),
  "marketing.fetch_publication_status": envelope(z.strictObject({
    campaign_id: z.uuid(),
    campaign_state: z.string(),
    package_id: z.uuid().nullable(),
    package_status: z.string().nullable(),
    approval_request_id: z.uuid().nullable(),
    published_at: timestamp.nullable(),
    external_post_id: z.string().nullable(),
    external_post_url: z.string().nullable(),
  }), "internal", "department_only", false),
  "catalog.product_completeness": envelope(z.strictObject({
    totalProducts: safeInteger,
    draftProducts: safeInteger,
    publishedProducts: safeInteger,
    missingBrand: safeInteger,
    emptyAttributes: safeInteger,
    withoutActiveVariant: safeInteger,
    withoutCurrentPrice: safeInteger,
    withoutMedia: safeInteger,
    withoutPrimaryMedia: safeInteger,
    completenessBasisPoints: basisPoints,
  }), "internal", "executive_summary", false),
  "catalog.publication_readiness": envelope(z.strictObject({
    draftReviewed: safeInteger,
    readyCount: safeInteger,
    blockedCount: safeInteger,
    reasonCounts: reasonCounts(catalogReason),
  }), "internal", "executive_summary", true, z.strictObject({
    productId: z.uuid(), updatedAt: timestamp, reasonCodes: z.array(catalogReason).min(1).max(6),
  })),
  "catalog.merchandising_summary": envelope(z.strictObject({
    activeCategories: safeInteger,
    publishedProducts: safeInteger,
    activeVariants: safeInteger,
    currentlyPricedVariants: safeInteger,
    mediaCoverageBasisPoints: basisPoints,
    minimumPriceVnd: safeInteger.nullable(),
    maximumPriceVnd: safeInteger.nullable(),
    categoryDistribution: z.array(z.strictObject({ categoryId: z.uuid(), productCount: safeInteger })).max(25),
    otherCategoryProductCount: safeInteger,
  }), "internal", "executive_summary", false),
  "inventory.stock_risk": envelope(z.strictObject({
    trackedVariants: safeInteger, lowStockCount: safeInteger, soldOutCount: safeInteger,
    unitsOnHand: safeInteger, unitsReserved: safeInteger, unitsAvailable: safeInteger,
  }), "internal", "executive_summary", true, z.strictObject({
    variantId: z.uuid(), onHand: safeInteger, reserved: safeInteger, available: safeInteger,
    quantitySold: safeInteger, dailyVelocityMilliunits: safeInteger,
    daysCover: safeInteger.nullable(), riskCode: inventoryRisk,
  })),
  "inventory.slow_stock": envelope(z.strictObject({
    candidateCount: safeInteger, candidateUnits: safeInteger, candidateValueVnd: safeInteger,
  }), "internal", "executive_summary", true, z.strictObject({
    variantId: z.uuid(), available: safeInteger, quantitySold: safeInteger,
    currentUnitPriceVnd: safeInteger, stockValueVnd: safeInteger,
    reasonCode: z.literal("NO_SALES_VELOCITY"),
  })),
  "inventory.reservation_anomalies": envelope(z.strictObject({
    expiredActiveCount: safeInteger, finalizedWithoutTimestampCount: safeInteger,
    stalePendingCount: safeInteger, affectedUnits: safeInteger,
  }), "confidential", "department_only", true, z.strictObject({
    reservationId: z.uuid(), variantId: z.uuid(), quantity: safeInteger,
    status: z.string().min(1).max(64), expiresAt: timestamp, detectedAt: timestamp,
    reasonCode: reservationReason,
  })),
  "order.stalled_summary": envelope(z.strictObject({
    stalledCount: safeInteger, stalledTotalVnd: safeInteger, countsByStatus: countByStatus,
  }), "confidential", "executive_summary", true, z.strictObject({
    orderId: z.uuid(), status: z.string().min(1).max(64), createdAt: timestamp,
    updatedAt: timestamp, ageMinutes: safeInteger, totalVnd: safeInteger,
    reasonCode: orderStalledReason,
  })),
  "order.invalid_state_evidence": envelope(z.strictObject({
    invalidCount: safeInteger, reasonCounts: reasonCounts(orderInvalidReason),
  }), "confidential", "department_only", true, z.strictObject({
    orderId: z.uuid(), status: z.string().min(1).max(64), version: z.number().int().positive(),
    detectedAt: timestamp, reasonCodes: z.array(orderInvalidReason).min(1).max(4),
  })),
  "order.expiry_risk": envelope(z.strictObject({
    atRiskCount: safeInteger, atRiskTotalVnd: safeInteger, earliestExpiryAt: timestamp.nullable(),
  }), "confidential", "executive_summary", true, z.strictObject({
    orderId: z.uuid(), status: z.literal("pending_payment"), totalVnd: safeInteger,
    reservationExpiresAt: timestamp, minutesRemaining: safeInteger,
  })),
  "finance.pending_payments": envelope(z.strictObject({
    pendingCount: safeInteger, pendingExpectedAmountVnd: safeInteger,
    oldestCreatedAt: timestamp.nullable(), countsByStatus: countByStatus,
    ageBuckets: z.array(z.strictObject({
      bucket: z.enum(["under_15_minutes", "15_to_60_minutes", "1_to_24_hours", "over_24_hours"]),
      count: safeInteger, amountVnd: safeInteger,
    })).max(4),
  }), "confidential", "executive_summary", true),
  "finance.reconciliation_discrepancies": envelope(z.strictObject({
    reconciliationCount: safeInteger, mismatchCount: safeInteger,
    providerErrorCount: safeInteger, unsupportedCount: safeInteger, amountDifferenceVnd: safeInteger,
  }), "restricted", "department_only", true, z.strictObject({
    reconciliationId: z.uuid(), paymentId: z.uuid(),
    comparisonResult: z.enum(["mismatch", "provider_error", "unsupported"]),
    internalStatus: z.string().min(1).max(64),
    providerStatusClass: z.enum(["paid", "pending", "failed", "unsupported", "provider_error", "unknown"]),
    internalAmountVnd: safeInteger, providerAmountVnd: safeInteger.nullable(),
    differenceVnd: safeInteger, createdAt: timestamp,
  })),
  "finance.provider_evidence_status": envelope(z.strictObject({
    authenticatedEvents: safeInteger, rejectedEvents: safeInteger, appliedEvents: safeInteger,
    reviewRequiredEvents: safeInteger, unmatchedPayments: safeInteger,
    coverageBasisPoints: basisPoints, countsByNormalizedState: countByStatus,
  }), "restricted", "department_only", true),
  "crm.segment_summary": envelope(z.strictObject({
    registeredCustomers: safeInteger, newCustomers: safeInteger, repeatCustomers: safeInteger,
    customersByLifetimeValueBucket: z.array(z.strictObject({
      bucket: z.enum(["zero", "low", "mid", "high"]), count: safeInteger,
    })).max(4),
    customersByRecencyBucket: z.array(z.strictObject({
      bucket: z.enum(["0_30_days", "31_90_days", "over_90_days", "never"]), count: safeInteger,
    })).max(4),
    paidRevenueVnd: safeInteger,
  }), "confidential", "executive_summary", true),
  "crm.followup_opportunities": envelope(z.strictObject({
    openFollowups: safeInteger, overdueFollowups: safeInteger, unassignedFollowups: safeInteger,
    customersWithoutOpenFollowupBySegment: z.array(z.strictObject({
      segment: z.enum(["new", "repeat", "high_value", "inactive"]), count: safeInteger,
    })).max(4),
    reasonCounts: reasonCounts(opportunityReason),
  }), "restricted", "department_only", true),
  "support.sla_risk": envelope(z.strictObject({
    openTickets: safeInteger, atRiskCount: safeInteger, breachedCount: safeInteger,
    countsByPriority: z.array(z.strictObject({
      priority: z.enum(["urgent", "high", "normal", "low"]), count: safeInteger,
    })).max(4),
  }), "restricted", "executive_summary", true, z.strictObject({
    ticketId: z.uuid(), priority: z.enum(["urgent", "high", "normal", "low"]),
    status: z.string().min(1).max(64), slaDueAt: timestamp, minutesRemaining: z.number().int(),
    riskCode: z.enum(["BREACHED", "DUE_WITHIN_HORIZON"]),
  })),
  "support.classification_summary": envelope(z.strictObject({
    countsByPriority: z.array(z.strictObject({
      priority: z.enum(["urgent", "high", "normal", "low"]), count: safeInteger,
    })).max(4),
    countsByStatus: countByStatus,
    operationalClasses: z.array(z.strictObject({
      class: z.enum(["unassigned", "active_work", "waiting_customer", "waiting_internal", "escalated", "terminal"]),
      count: safeInteger,
    })).max(6),
    unassignedCount: safeInteger, escalatedCount: safeInteger,
  }), "confidential", "executive_summary", true),
  "support.related_order_context": envelope(z.discriminatedUnion("hasRelatedOrder", [
    z.strictObject({ ticketId: z.uuid(), hasRelatedOrder: z.literal(false) }),
    z.strictObject({
      ticketId: z.uuid(), hasRelatedOrder: z.literal(true), orderId: z.uuid(),
      orderStatus: z.string().min(1).max(64), orderCreatedAt: timestamp,
      reservationExpiresAt: timestamp, totalVnd: safeInteger, paymentConfirmed: z.boolean(),
    }),
  ]), "restricted", "department_only", false),
} satisfies Record<DepartmentToolName, z.ZodType>;

export function getDepartmentToolInputSchema(name: DepartmentToolName): z.ZodType {
  return inputSchemas[name];
}

export function getDepartmentToolOutputSchema(name: DepartmentToolName): z.ZodType {
  return outputSchemas[name];
}

export function departmentToolSchemaDigest(schema: z.ZodType): string {
  return createHash("sha256")
    .update(stableJson(z.toJSONSchema(schema)))
    .digest("hex");
}

function reasonCounts<T extends z.ZodEnum>(reason: T) {
  return z.array(z.strictObject({ reasonCode: reason, count: safeInteger })).max(16);
}

function envelope(
  summary: z.ZodType,
  classification: "internal" | "confidential" | "restricted",
  shareability: "executive_summary" | "department_only",
  hasWindow: boolean,
  evidence?: z.ZodType,
): z.ZodType {
  const shape = {
    source: z.string().min(1).max(255),
    sourceVersion: z.literal(1),
    retrievedAt: timestamp,
    window: hasWindow ? resultWindow : z.null(),
    freshness,
    classification: z.literal(classification),
    shareability: z.literal(shareability),
    provenanceId: z.uuid(),
    summary,
    ...(evidence === undefined ? {} : {
      evidence: z.array(evidence).max(100).optional(),
      nextCursor: cursor.optional(),
    }),
  };
  return z.strictObject(shape);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      (key) => `${JSON.stringify(key)}:${stableJson(record[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
