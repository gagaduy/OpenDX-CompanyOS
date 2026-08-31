// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CreateMarketingCampaignInput,
  MarketingArtifact,
  MarketingCampaign,
  MarketingCampaignDetail,
  PublicationRecord,
} from "../types";

export interface MarketingApi {
  listCampaigns(params?: { limit?: number; offset?: number }, signal?: AbortSignal): Promise<{ items: readonly MarketingCampaign[]; total: number }>;
  getCampaign(id: string, signal?: AbortSignal): Promise<MarketingCampaignDetail>;
  createCampaign(input: CreateMarketingCampaignInput, idempotencyKey: string): Promise<MarketingCampaign>;
  markReady(campaignId: string): Promise<MarketingCampaign>;
  cancelCampaign(campaignId: string, reason?: string): Promise<MarketingCampaign>;
  approveCampaign(campaignId: string, input: { decision: "approve" | "reject"; reason?: string; facebookPageAccessToken?: string }): Promise<MarketingCampaign>;
  retryPublication(campaignId: string): Promise<PublicationRecord>;
  requestRevision(campaignId: string, input: { feedback: string; targetVersion?: "content" | "visual" | "both" }): Promise<MarketingCampaign>;
  qualityFeedback(campaignId: string, input: { status: "passed" | "escalated"; notes?: string }): Promise<MarketingCampaign>;
  generateDeliverables(campaignId: string): Promise<{ items: readonly MarketingArtifact[]; total: number }>;
  listArtifacts(campaignId: string, signal?: AbortSignal): Promise<{ items: readonly MarketingArtifact[]; total: number }>;
  getArtifactDownloadUrl(artifactId: string): string;
  fetchArtifactBlob?(artifactId: string): Promise<Blob>;
}

export function createMarketingApi(baseUrl: string, accessToken: string): MarketingApi {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "x-correlation-id": crypto.randomUUID(),
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || `Request failed with status ${response.status}`);
    }

    return response.json() as Promise<T>;
  };

  return {
    async listCampaigns(params, signal) {
      const query = new URLSearchParams();
      if (params?.limit) query.set("limit", String(params.limit));
      if (params?.offset) query.set("offset", String(params.offset));
      return request(`/v1/admin/marketing/campaigns?${query.toString()}`, { signal });
    },

    async getCampaign(id, signal) {
      return request(`/v1/admin/marketing/campaigns/${id}`, { signal });
    },

    async createCampaign(input, idempotencyKey) {
      const payload = {
        ...input,
        assignmentMode: input.assignmentMode ?? "direct_department",
        subject: input.subject ?? {
          kind: input.subjectKind ?? "free_topic",
          reference: input.subjectReference ?? "san-pham",
        },
      };
      return request("/v1/admin/marketing/campaigns", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      });
    },

    async markReady(campaignId) {
      return request(`/v1/admin/marketing/campaigns/${campaignId}/ready`, {
        method: "POST",
      });
    },

    async cancelCampaign(campaignId, reason) {
      return request(`/v1/admin/marketing/campaigns/${campaignId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },

    async approveCampaign(campaignId, input) {
      return request(`/v1/admin/marketing/campaigns/${campaignId}/approve`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    async retryPublication(campaignId) {
      return request(`/v1/admin/marketing/campaigns/${campaignId}/retry-publication`, {
        method: "POST",
      });
    },

    async requestRevision(campaignId, input) {
      return request(`/v1/admin/marketing/campaigns/${campaignId}/request-revision`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    async qualityFeedback(campaignId, input) {
      return request(`/v1/admin/marketing/campaigns/${campaignId}/quality-feedback`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    async generateDeliverables(campaignId) {
      return request(`/v1/admin/marketing/campaigns/${campaignId}/generate-deliverables`, {
        method: "POST",
      });
    },

    async listArtifacts(campaignId, signal) {
      return request(`/v1/admin/marketing/campaigns/${campaignId}/artifacts`, { signal });
    },

    getArtifactDownloadUrl(artifactId) {
      return `${baseUrl}/v1/admin/marketing/artifacts/${artifactId}/download`;
    },

    async fetchArtifactBlob(artifactId) {
      const response = await fetch(`${baseUrl}/v1/admin/marketing/artifacts/${artifactId}/download`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-correlation-id": crypto.randomUUID(),
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch artifact blob: ${response.status}`);
      }
      return response.blob();
    },
  };
}
