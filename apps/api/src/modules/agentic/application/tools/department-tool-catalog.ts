// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  DepartmentAgentKind,
  DepartmentToolDescriptor,
  DepartmentToolName,
  DepartmentToolScope,
  ToolClassification,
  ToolShareability,
} from "./department-tool-contracts";
import {
  departmentToolSchemaDigest,
  getDepartmentToolInputSchema,
  getDepartmentToolOutputSchema,
} from "./department-tool-schemas";

interface DescriptorSource {
  readonly name: DepartmentToolName;
  readonly agentKind: DepartmentAgentKind;
  readonly classification: ToolClassification;
  readonly shareability: ToolShareability;
  readonly inputFields: readonly string[];
  readonly outputFields: readonly string[];
  readonly evidence: boolean;
}

const sources: readonly DescriptorSource[] = [
  source("catalog.product_completeness", "catalog", "internal", "executive_summary", [], ["totalProducts", "draftProducts", "publishedProducts", "missingBrand", "emptyAttributes", "withoutActiveVariant", "withoutCurrentPrice", "withoutMedia", "withoutPrimaryMedia", "completenessBasisPoints"], false),
  source("catalog.publication_readiness", "catalog", "internal", "executive_summary", windowFields(), ["draftReviewed", "readyCount", "blockedCount", "reasonCounts", "evidence", "nextCursor"], true),
  source("catalog.merchandising_summary", "catalog", "internal", "executive_summary", [], ["activeCategories", "publishedProducts", "activeVariants", "currentlyPricedVariants", "mediaCoverageBasisPoints", "minimumPriceVnd", "maximumPriceVnd", "categoryDistribution", "otherCategoryProductCount"], false),
  source("inventory.stock_risk", "inventory", "internal", "executive_summary", [...windowFields(), "lowStockThreshold"], ["trackedVariants", "lowStockCount", "soldOutCount", "unitsOnHand", "unitsReserved", "unitsAvailable", "evidence", "nextCursor"], true),
  source("inventory.slow_stock", "inventory", "internal", "executive_summary", [...windowFields(), "minimumOnHand"], ["candidateCount", "candidateUnits", "candidateValueVnd", "evidence", "nextCursor"], true),
  source("inventory.reservation_anomalies", "inventory", "confidential", "department_only", windowFields(), ["expiredActiveCount", "finalizedWithoutTimestampCount", "stalePendingCount", "affectedUnits", "evidence", "nextCursor"], true),
  source("order.stalled_summary", "order", "confidential", "executive_summary", [...windowFields(), "minimumAgeMinutes"], ["stalledCount", "stalledTotalVnd", "countsByStatus", "evidence", "nextCursor"], true),
  source("order.invalid_state_evidence", "order", "confidential", "department_only", windowFields(), ["invalidCount", "reasonCounts", "evidence", "nextCursor"], true),
  source("order.expiry_risk", "order", "confidential", "executive_summary", [...windowFields(), "horizonMinutes"], ["atRiskCount", "atRiskTotalVnd", "earliestExpiryAt", "evidence", "nextCursor"], true),
  source("finance.pending_payments", "finance", "confidential", "executive_summary", windowFields(), ["pendingCount", "pendingExpectedAmountVnd", "oldestCreatedAt", "countsByStatus", "ageBuckets"], false),
  source("finance.reconciliation_discrepancies", "finance", "restricted", "department_only", windowFields(), ["reconciliationCount", "mismatchCount", "providerErrorCount", "unsupportedCount", "amountDifferenceVnd", "evidence", "nextCursor"], true),
  source("finance.provider_evidence_status", "finance", "restricted", "department_only", windowFields(), ["authenticatedEvents", "rejectedEvents", "appliedEvents", "reviewRequiredEvents", "unmatchedPayments", "coverageBasisPoints", "countsByNormalizedState"], false),
  source("crm.segment_summary", "crm", "confidential", "executive_summary", windowFields(false), ["registeredCustomers", "newCustomers", "repeatCustomers", "customersByLifetimeValueBucket", "customersByRecencyBucket", "paidRevenueVnd"], false),
  source("crm.followup_opportunities", "crm", "restricted", "department_only", windowFields(false), ["openFollowups", "overdueFollowups", "unassignedFollowups", "customersWithoutOpenFollowupBySegment", "reasonCounts"], false),
  source("support.sla_risk", "support", "restricted", "executive_summary", [...windowFields(), "horizonMinutes"], ["openTickets", "atRiskCount", "breachedCount", "countsByPriority", "evidence", "nextCursor"], true),
  source("support.classification_summary", "support", "confidential", "executive_summary", windowFields(false), ["countsByPriority", "countsByStatus", "operationalClasses", "unassignedCount", "escalatedCount"], false),
  source("support.related_order_context", "support", "restricted", "department_only", ["ticketId"], ["ticketId", "hasRelatedOrder", "orderId", "orderStatus", "orderCreatedAt", "reservationExpiresAt", "totalVnd", "paymentConfirmed"], true),
] as const;

export const DEPARTMENT_TOOL_CATALOG: readonly DepartmentToolDescriptor[] =
  Object.freeze(sources.map((value) => Object.freeze({
    name: value.name,
    version: 1 as const,
    agentKind: value.agentKind,
    purpose: "store_health_review" as const,
    dataScope: `${value.agentKind}:health:read` as DepartmentToolScope,
    classification: value.classification,
    shareability: value.shareability,
    inputSchemaDigest: departmentToolSchemaDigest(getDepartmentToolInputSchema(value.name)),
    outputSchemaDigest: departmentToolSchemaDigest(getDepartmentToolOutputSchema(value.name)),
    executionCostMicros: 1 as const,
    maximumInvocations: value.evidence ? 5 as const : 10 as const,
    maximumAttempts: 2 as const,
  })));

export function findDepartmentToolDescriptor(
  name: string,
  version: number,
): DepartmentToolDescriptor | undefined {
  return DEPARTMENT_TOOL_CATALOG.find(
    (descriptor) => descriptor.name === name && descriptor.version === version,
  );
}

function source(
  name: DepartmentToolName,
  agentKind: DepartmentAgentKind,
  classification: ToolClassification,
  shareability: ToolShareability,
  inputFields: readonly string[],
  outputFields: readonly string[],
  evidence: boolean,
): DescriptorSource {
  return { name, agentKind, classification, shareability, inputFields, outputFields, evidence };
}

function windowFields(evidence = true): readonly string[] {
  return evidence
    ? ["start", "end", "timezone", "limit", "cursor"]
    : ["start", "end", "timezone"];
}
