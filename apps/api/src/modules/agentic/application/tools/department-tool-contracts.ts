// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentKind } from "../../domain/entities/agent-profile";

export type DepartmentAgentKind = Exclude<AgentKind, "ai_ceo">;

export type DepartmentToolName =
  | "catalog.product_completeness"
  | "catalog.publication_readiness"
  | "catalog.merchandising_summary"
  | "inventory.stock_risk"
  | "inventory.slow_stock"
  | "inventory.reservation_anomalies"
  | "order.stalled_summary"
  | "order.invalid_state_evidence"
  | "order.expiry_risk"
  | "finance.pending_payments"
  | "finance.reconciliation_discrepancies"
  | "finance.provider_evidence_status"
  | "crm.segment_summary"
  | "crm.followup_opportunities"
  | "support.sla_risk"
  | "support.classification_summary"
  | "support.related_order_context"
  | "marketing.fetch_campaign_brief"
  | "marketing.fetch_catalog_product_summary"
  | "marketing.save_content_draft"
  | "marketing.save_visual_asset"
  | "marketing.assemble_publication_package"
  | "marketing.fetch_publication_status";

export type DepartmentToolScope =
  | "catalog:health:read"
  | "inventory:health:read"
  | "order:health:read"
  | "finance:health:read"
  | "crm:health:read"
  | "support:health:read"
  | "marketing:campaign:read"
  | "marketing:catalog:read"
  | "marketing:content:write"
  | "marketing:visual:write"
  | "marketing:package:write"
  | "marketing:publication:read";

export type ToolClassification = "internal" | "confidential" | "restricted";
export type ToolShareability = "executive_summary" | "department_only";

export interface DepartmentToolWindow {
  readonly start: string;
  readonly end: string;
  readonly timezone: "Asia/Ho_Chi_Minh";
}

export interface DepartmentToolFreshness {
  readonly asOf: string;
  readonly maxAgeSeconds: 60;
  readonly status: "fresh";
}

export interface DepartmentToolResult<TSummary, TEvidence = never> {
  readonly source: string;
  readonly sourceVersion: 1;
  readonly retrievedAt: string;
  readonly window: DepartmentToolWindow | null;
  readonly freshness: DepartmentToolFreshness;
  readonly classification: ToolClassification;
  readonly shareability: ToolShareability;
  readonly provenanceId: string;
  readonly summary: TSummary;
  readonly evidence?: readonly TEvidence[];
  readonly nextCursor?: string;
}

export interface DepartmentToolInvocationRequest {
  readonly taskId: string;
  readonly toolName: DepartmentToolName;
  readonly toolVersion: 1;
  readonly purpose: "store_health_review" | "marketing_publication";
  readonly dataScope: DepartmentToolScope;
  readonly dataClassification: ToolClassification;
  readonly modelId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly approvalId?: string;
}

export interface DepartmentToolDescriptor {
  readonly name: DepartmentToolName;
  readonly version: 1;
  readonly agentKind: DepartmentAgentKind;
  readonly purpose: "store_health_review" | "marketing_publication";
  readonly dataScope: DepartmentToolScope;
  readonly classification: ToolClassification;
  readonly shareability: ToolShareability;
  readonly inputSchemaDigest: string;
  readonly outputSchemaDigest: string;
  readonly executionCostMicros: 1;
  readonly maximumInvocations: 5 | 10;
  readonly maximumAttempts: 2;
}
