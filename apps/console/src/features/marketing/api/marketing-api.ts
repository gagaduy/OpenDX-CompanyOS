// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CreateMarketingCampaignInput,
  MarketingArtifact,
  MarketingCampaign,
  MarketingCampaignDetail,
  PublicationRecord,
} from "../types";

export interface SocialTokenHealthView {
  readonly platform: "facebook" | "instagram";
  readonly accountId: string;
  readonly accountName: string;
  readonly status: "valid" | "expiring_soon" | "expired" | "invalid" | "unconfigured";
  readonly expiresAt: string | null;
  readonly daysRemaining: number | null;
  readonly tokenPreview: string;
  readonly lastCheckedAt: string | null;
  readonly lastError: string | null;
  readonly requiresAction: boolean;
  readonly actionType: "none" | "auto_refresh" | "oauth_reconnect";
  readonly message: string;
}

export interface SocialTokensSummaryView {
  readonly accounts: readonly SocialTokenHealthView[];
  readonly hasExpiringOrInvalid: boolean;
  readonly urgentActionRequired: boolean;
  readonly checkedAt: string;
}

export interface MarketingApi {
  fetchVisualAssetBlob(assetId: string, signal?: AbortSignal): Promise<Blob>;
  listCampaigns(params?: { limit?: number; offset?: number }, signal?: AbortSignal): Promise<{ items: readonly MarketingCampaign[]; total: number }>;
  getCampaign(id: string, signal?: AbortSignal): Promise<MarketingCampaignDetail>;
  createCampaign(input: CreateMarketingCampaignInput, idempotencyKey: string): Promise<MarketingCampaign>;
  markReady(campaignId: string): Promise<MarketingCampaign>;
  cancelCampaign(campaignId: string, reason?: string): Promise<MarketingCampaign>;
  approveCampaign(campaignId: string, input: { decision: "approve" | "reject"; reason?: string; facebookPageAccessToken?: string }): Promise<MarketingCampaign>;
  retryPublication(campaignId: string): Promise<PublicationRecord>;
  retryTargetPublication(campaignId: string, targetId: string): Promise<PublicationRecord>;
  requestRevision(campaignId: string, input: { feedback: string; targetVersion?: "content" | "visual" | "both" }): Promise<MarketingCampaign>;
  qualityFeedback(campaignId: string, input: { status: "passed" | "escalated"; notes?: string }): Promise<MarketingCampaign>;
  generateDeliverables(campaignId: string): Promise<{ items: readonly MarketingArtifact[]; total: number }>;
  listArtifacts(campaignId: string, signal?: AbortSignal): Promise<{ items: readonly MarketingArtifact[]; total: number }>;
  getArtifactDownloadUrl(artifactId: string): string;
  fetchArtifactBlob?(artifactId: string): Promise<Blob>;
  getSocialTokensStatus(signal?: AbortSignal): Promise<SocialTokensSummaryView>;
  refreshSocialToken(params: { platform: string; accountId: string }): Promise<SocialTokenHealthView>;
  exchangeSocialOAuthCode(params: { code: string; redirectUri: string; platform?: string }): Promise<SocialTokensSummaryView>;
  checkSocialTokens(): Promise<SocialTokensSummaryView>;
  updateSocialToken(params: { platform: string; accessToken: string; accountId?: string }): Promise<SocialTokenHealthView>;
  syncSocialTokensFromEnv(): Promise<SocialTokensSummaryView>;
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
    async fetchVisualAssetBlob(assetId, signal) {
      const response = await fetch(`${baseUrl}/v1/admin/marketing/visual-assets/${encodeURIComponent(assetId)}/preview`, {
        signal,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-correlation-id": crypto.randomUUID(),
        },
      });
      if (!response.ok) throw new Error(`Failed to fetch visual asset: ${response.status}`);
      return response.blob();
    },
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

    async retryTargetPublication(campaignId, targetId) {
      return request(`/v1/admin/marketing/campaigns/${campaignId}/targets/${targetId}/retry`, {
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

    async getSocialTokensStatus(signal) {
      const res: any = await request("/v1/admin/marketing/social-tokens/status", { signal });
      return mapBackendSocialTokensSummary(res);
    },

    async refreshSocialToken(params) {
      const res: any = await request("/v1/admin/marketing/social-tokens/refresh", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return mapBackendSocialToken(res);
    },

    async exchangeSocialOAuthCode(params) {
      const res: any = await request("/v1/admin/marketing/social-tokens/oauth-exchange", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return mapBackendSocialTokensSummary(res);
    },

    async checkSocialTokens() {
      const res: any = await request("/v1/admin/marketing/social-tokens/check", {
        method: "POST",
      });
      return mapBackendSocialTokensSummary(res);
    },

    async updateSocialToken(params) {
      const res: any = await request("/v1/admin/marketing/social-tokens/update", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return mapBackendSocialToken(res);
    },

    async syncSocialTokensFromEnv() {
      const res: any = await request("/v1/admin/marketing/social-tokens/sync-env", {
        method: "POST",
      });
      return mapBackendSocialTokensSummary(res);
    },
  };
}

function mapBackendSocialToken(dto: any): SocialTokenHealthView {
  const status: "valid" | "expiring_soon" | "expired" | "invalid" | "unconfigured" =
    dto.tokenStatus === "healthy"
      ? "valid"
      : dto.tokenStatus === "expiring_soon"
      ? "expiring_soon"
      : dto.tokenStatus === "expired"
      ? "expired"
      : dto.tokenStatus === "invalid"
      ? "invalid"
      : dto.status ?? "unconfigured";

  const isWarningOrCritical = status === "expiring_soon" || status === "expired" || status === "invalid";
  const actionType = dto.actionType ?? (status === "expiring_soon" ? "auto_refresh" : isWarningOrCritical ? "oauth_reconnect" : "none");

  return {
    platform: dto.platform,
    accountId: dto.accountId,
    accountName: dto.accountName,
    status,
    expiresAt: dto.tokenExpiresAt ?? dto.expiresAt ?? null,
    daysRemaining: dto.daysRemaining ?? null,
    tokenPreview: dto.maskedToken ?? dto.tokenPreview ?? "••••••••",
    lastCheckedAt: dto.lastCheckedAt ?? null,
    lastError: dto.lastError ?? null,
    requiresAction: dto.requiresAction ?? isWarningOrCritical,
    actionType,
    message: dto.message ?? dto.lastError ?? (status === "invalid" ? "Phiên đăng nhập đã hết hạn hoặc không hợp lệ" : ""),
  };
}

function mapBackendSocialTokensSummary(raw: any): SocialTokensSummaryView {
  const accounts = (raw.accounts || []).map(mapBackendSocialToken);
  const hasExpiringOrInvalid =
    raw.hasExpiringOrInvalid ??
    (raw.overallStatus === "warning" ||
      raw.overallStatus === "critical" ||
      accounts.some((a: any) => a.requiresAction || a.status !== "valid"));
  const urgentActionRequired =
    raw.urgentActionRequired ??
    (raw.overallStatus === "critical" ||
      accounts.some((a: any) => a.status === "expired" || a.status === "invalid"));

  return {
    accounts,
    hasExpiringOrInvalid,
    urgentActionRequired,
    checkedAt: raw.checkedAt ?? new Date().toISOString(),
  };
}

