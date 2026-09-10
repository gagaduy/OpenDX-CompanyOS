// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { MetaGraphSocialTokenAdapter } from "./meta-graph-social-token.adapter";

describe("MetaGraphSocialTokenAdapter", () => {
  it("inspects valid token with debug_token and page verification", async () => {
    const mockFetcher = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/debug_token")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              app_id: "123456",
              type: "PAGE",
              application: "OpenDX Test",
              data_access_expires_at: 1730000000,
              expires_at: 1729000000,
              is_valid: true,
              issued_at: 1724000000,
              scopes: ["pages_manage_posts", "pages_read_engagement"],
            },
          }),
        });
      }
      if (url.includes("/page-123")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: "page-123",
            name: "OpenDX Store Official",
            can_post: true,
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    const adapter = new MetaGraphSocialTokenAdapter({
      fetcher: mockFetcher as any,
    });

    const result = await adapter.inspectToken("facebook", "EAAB_test_token_secret", "page-123");
    expect(result.isValid).toBe(true);
    expect(result.accountName).toBe("OpenDX Store Official");
    expect(result.scopes).toContain("pages_manage_posts");
    expect(result.expiresAt).not.toBeNull();
  });

  it("handles expired or invalid token (code 190) gracefully and sanitizes secret token", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: "Error validating access token EAAB_secret_token_123: Session has expired",
          type: "OAuthException",
          code: 190,
          error_subcode: 463,
        },
      }),
      text: async () =>
        JSON.stringify({
          error: {
            message: "Error validating access token EAAB_secret_token_123: Session has expired",
            code: 190,
          },
        }),
    });

    const adapter = new MetaGraphSocialTokenAdapter({
      fetcher: mockFetcher as any,
    });

    const result = await adapter.inspectToken("facebook", "EAAB_secret_token_123", "page-123");
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain("EAAB_secret_token_123");
    expect(result.error).toContain("[REDACTED]");
  });

  it("extends token using fb_exchange_token grant and fetches permanent page token", async () => {
    const mockFetcher = vi.fn().mockImplementation((url: string) => {
      if (url.includes("grant_type=fb_exchange_token")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "EAAB_long_lived_user_token",
            token_type: "bearer",
            expires_in: 5184000,
          }),
        });
      }
      if (url.includes("/page-123") && url.includes("access_token=EAAB_long_lived_user_token")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: "page-123",
            name: "OpenDX Store",
            access_token: "EAAB_permanent_page_token",
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 400, json: async () => ({}) });
    });

    const adapter = new MetaGraphSocialTokenAdapter({
      fetcher: mockFetcher as any,
    });

    const res = await adapter.extendToken(
      "facebook",
      "EAAB_short_token",
      "app-1",
      "secret-1",
      "page-123",
    );
    expect(res.accessToken).toBe("EAAB_permanent_page_token");
    expect(res.isLongLived).toBe(true);
  });

  it("exchanges OAuth authorization code for long-lived user token and permanent page token", async () => {
    const mockFetcher = vi.fn().mockImplementation((url: string) => {
      if (url.includes("code=valid_oauth_code")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "EAAB_short_code_token",
            token_type: "bearer",
            expires_in: 7200,
          }),
        });
      }
      if (url.includes("grant_type=fb_exchange_token")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "EAAB_long_lived_from_code",
            expires_in: 5184000,
          }),
        });
      }
      if (url.includes("/me/accounts") || (url.includes("/page-123") && url.includes("access_token=EAAB_long_lived_from_code"))) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: "page-123",
                name: "OpenDX Store Official",
                access_token: "EAAB_page_permanent_token_from_code",
              },
            ],
            id: "page-123",
            name: "OpenDX Store Official",
            access_token: "EAAB_page_permanent_token_from_code",
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 400, json: async () => ({}) });
    });

    const adapter = new MetaGraphSocialTokenAdapter({
      fetcher: mockFetcher as any,
    });

    const res = await adapter.exchangeOAuthCode(
      "facebook",
      "valid_oauth_code",
      "https://opendx.example.com/oauth/callback",
      "app-1",
      "secret-1",
      "page-123",
    );

    expect(res.pageAccessToken).toBe("EAAB_page_permanent_token_from_code");
    expect(res.pageId).toBe("page-123");
    expect(res.pageName).toBe("OpenDX Store Official");
  });
});
