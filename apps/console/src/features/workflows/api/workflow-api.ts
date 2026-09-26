// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { BusinessWorkflowDefinition } from "../types";

export interface SaveWorkflowDraftInput {
  readonly nodes?: readonly unknown[];
  readonly edges?: readonly unknown[];
  readonly policyRules?: Record<string, unknown>;
  readonly description?: string;
  readonly targetOutcome?: string;
}

export interface PublishWorkflowInput {
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
  readonly policyRules?: Record<string, unknown>;
  readonly version?: string;
}

export interface WorkflowApi {
  listWorkflows(signal?: AbortSignal): Promise<readonly BusinessWorkflowDefinition[]>;
  getWorkflow(id: string, signal?: AbortSignal): Promise<BusinessWorkflowDefinition>;
  saveDraft(id: string, input: SaveWorkflowDraftInput, signal?: AbortSignal): Promise<BusinessWorkflowDefinition>;
  publishWorkflow(id: string, input: PublishWorkflowInput, signal?: AbortSignal): Promise<BusinessWorkflowDefinition>;
}

export function createWorkflowApi(apiBaseUrl: string, accessToken: string): WorkflowApi {
  const getHeaders = () => ({
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  });

  return {
    async listWorkflows(signal?: AbortSignal): Promise<readonly BusinessWorkflowDefinition[]> {
      const response = await fetch(`${apiBaseUrl}/v1/admin/agentic/workflows`, {
        headers: getHeaders(),
        signal,
      });
      if (!response.ok) {
        throw new Error(`Failed to list workflows: ${response.statusText}`);
      }
      const json = await response.json();
      return json.data;
    },

    async getWorkflow(id: string, signal?: AbortSignal): Promise<BusinessWorkflowDefinition> {
      const response = await fetch(`${apiBaseUrl}/v1/admin/agentic/workflows/${id}`, {
        headers: getHeaders(),
        signal,
      });
      if (!response.ok) {
        throw new Error(`Failed to get workflow: ${response.statusText}`);
      }
      const json = await response.json();
      return json.data;
    },

    async saveDraft(id: string, input: SaveWorkflowDraftInput, signal?: AbortSignal): Promise<BusinessWorkflowDefinition> {
      const response = await fetch(`${apiBaseUrl}/v1/admin/agentic/workflows/${id}/draft`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(input),
        signal,
      });
      if (!response.ok) {
        throw new Error(`Failed to save workflow draft: ${response.statusText}`);
      }
      const json = await response.json();
      return json.data;
    },

    async publishWorkflow(id: string, input: PublishWorkflowInput, signal?: AbortSignal): Promise<BusinessWorkflowDefinition> {
      const response = await fetch(`${apiBaseUrl}/v1/admin/agentic/workflows/${id}/publish`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(input),
        signal,
      });
      if (!response.ok) {
        throw new Error(`Failed to publish workflow: ${response.statusText}`);
      }
      const json = await response.json();
      return json.data;
    },
  };
}
