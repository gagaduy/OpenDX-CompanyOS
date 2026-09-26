// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface WorkflowBlueprintDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly targetOutcome: string;
  readonly version: string;
  readonly status: "draft" | "published";
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
  readonly policyRules: Record<string, unknown>;
  readonly publishedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedBy?: string;
}

export interface SaveWorkflowDraftDto {
  readonly nodes?: readonly unknown[];
  readonly edges?: readonly unknown[];
  readonly policyRules?: Record<string, unknown>;
  readonly description?: string;
  readonly targetOutcome?: string;
  readonly updatedBy?: string;
}

export interface PublishWorkflowDto {
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
  readonly policyRules?: Record<string, unknown>;
  readonly version?: string;
  readonly updatedBy?: string;
}
