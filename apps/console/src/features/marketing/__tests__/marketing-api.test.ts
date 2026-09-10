// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarketingApi } from "../api/marketing-api";

describe("Marketing visual API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches the selected asset as an authenticated blob with cancellation", async () => {
    const blob = new Blob(["rendered-image"], { type: "image/png" });
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const api = createMarketingApi("https://api.example.test", "test-token");
    expect(await api.fetchVisualAssetBlob("asset-2", controller.signal)).toBe(blob);
    expect(fetch).toHaveBeenCalledWith("https://api.example.test/v1/admin/marketing/visual-assets/asset-2/preview", expect.objectContaining({
      signal: controller.signal, headers: expect.objectContaining({ authorization: "Bearer test-token" }),
    }));
    fetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(api.fetchVisualAssetBlob("asset-2")).rejects.toThrow("503");
  });

  describe("Social Tokens API", () => {
    it("fetches social token summary status", async () => {
      const summaryPayload = {
        accounts: [
          {
            platform: "facebook",
            accountId: "page-1",
            accountName: "OpenDX Shop",
            status: "valid",
            expiresAt: null,
            daysRemaining: null,
            tokenPreview: "EAAB...cd12",
            lastCheckedAt: "2026-09-10T00:00:00.000Z",
            lastError: null,
            requiresAction: false,
            actionType: "none",
            message: "Permanent token active",
          },
        ],
        hasExpiringOrInvalid: false,
        urgentActionRequired: false,
        checkedAt: "2026-09-10T00:00:00.000Z",
      };

      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => summaryPayload,
      });
      vi.stubGlobal("fetch", fetch);

      const api = createMarketingApi("https://api.example.test", "test-token");
      const result = await api.getSocialTokensStatus();

      expect(result).toEqual(summaryPayload);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.test/v1/admin/marketing/social-tokens/status",
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: "Bearer test-token",
            "content-type": "application/json",
          }),
        }),
      );
    });

    it("posts auto-refresh request", async () => {
      const refreshPayload = {
        platform: "facebook",
        accountId: "page-1",
        accountName: "OpenDX Shop",
        status: "valid",
        expiresAt: null,
        daysRemaining: null,
        tokenPreview: "EAAB...refresh",
        lastCheckedAt: "2026-09-10T00:00:00.000Z",
        lastError: null,
        requiresAction: false,
        actionType: "none",
        message: "Refreshed successfully",
      };

      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => refreshPayload,
      });
      vi.stubGlobal("fetch", fetch);

      const api = createMarketingApi("https://api.example.test", "test-token");
      const result = await api.refreshSocialToken({
        platform: "facebook",
        accountId: "page-1",
      });

      expect(result).toEqual(refreshPayload);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.test/v1/admin/marketing/social-tokens/refresh",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ platform: "facebook", accountId: "page-1" }),
        }),
      );
    });

    it("posts oauth code exchange request", async () => {
      const exchangeResult = {
        accounts: [],
        hasExpiringOrInvalid: false,
        urgentActionRequired: false,
        checkedAt: "2026-09-10T00:00:00.000Z",
      };

      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => exchangeResult,
      });
      vi.stubGlobal("fetch", fetch);

      const api = createMarketingApi("https://api.example.test", "test-token");
      const result = await api.exchangeSocialOAuthCode({
        code: "auth-code-123",
        redirectUri: "https://console.example.com/oauth/callback",
      });

      expect(result).toEqual(exchangeResult);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.test/v1/admin/marketing/social-tokens/oauth-exchange",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            code: "auth-code-123",
            redirectUri: "https://console.example.com/oauth/callback",
          }),
        }),
      );
    });

    it("triggers on-demand token check", async () => {
      const checkResult = {
        accounts: [],
        hasExpiringOrInvalid: false,
        urgentActionRequired: false,
        checkedAt: "2026-09-10T00:00:00.000Z",
      };

      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => checkResult,
      });
      vi.stubGlobal("fetch", fetch);

      const api = createMarketingApi("https://api.example.test", "test-token");
      const result = await api.checkSocialTokens();

      expect(result).toEqual(checkResult);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.test/v1/admin/marketing/social-tokens/check",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("configures meta app credentials", async () => {
      const configResult = {
        accounts: [],
        hasExpiringOrInvalid: false,
        urgentActionRequired: false,
        checkedAt: "2026-09-10T00:00:00.000Z",
        metaAppId: "app-id-999",
        oauthConfigured: true,
      };

      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => configResult,
      });
      vi.stubGlobal("fetch", fetch);

      const api = createMarketingApi("https://api.example.test", "test-token");
      const result = await api.configureMetaApp({ appId: "app-id-999", appSecret: "secret-123" });

      expect(result).toEqual(configResult);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.test/v1/admin/marketing/social-tokens/meta-app-config",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ appId: "app-id-999", appSecret: "secret-123" }),
        }),
      );
    });
  });
});
