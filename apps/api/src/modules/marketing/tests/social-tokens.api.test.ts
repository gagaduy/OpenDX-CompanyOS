// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { MarketingController } from "../presentation/controllers/marketing.controller";
import { createMarketingAdminRouter } from "../presentation/routes/marketing.routes";

function createTestApp(socialTokenManagerMock: any, roles = ["agentic_operator"]) {
  const app = express();
  app.use(express.json());

  const tokenVerifier = {
    async verify() {
      return {
        sub: "staff-1",
        name: "Test Staff",
        realm_access: { roles },
      };
    },
  };

  const controller = new MarketingController(
    {} as any,
    undefined,
    undefined,
    socialTokenManagerMock,
  );

  const router = createMarketingAdminRouter({
    controller,
    staffTokenVerifier: tokenVerifier,
  });

  app.use("/v1/admin/marketing", router);
  app.use(createErrorHandler());

  return app;
}

describe("Social Tokens Admin API", () => {
  it("GET /v1/admin/marketing/social-tokens/status returns token summary", async () => {
    const mockManager = {
      getTokensSummary: vi.fn().mockResolvedValue({
        overallStatus: "healthy",
        activeAlertCount: 0,
        accounts: [
          {
            platform: "facebook",
            accountId: "page-1",
            accountName: "OpenDX Store Official",
            maskedToken: "EAAB...1234",
            tokenStatus: "healthy",
            daysRemaining: null,
            isLongLived: true,
            scopes: ["pages_manage_posts"],
            requiresAction: false,
          },
        ],
      }),
    };

    const app = createTestApp(mockManager);
    const res = await request(app)
      .get("/v1/admin/marketing/social-tokens/status")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.overallStatus).toBe("healthy");
    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.accounts[0].accountName).toBe("OpenDX Store Official");
  });

  it("POST /v1/admin/marketing/social-tokens/refresh executes auto-refresh", async () => {
    const mockManager = {
      autoRefreshAccount: vi.fn().mockResolvedValue({
        platform: "facebook",
        accountId: "page-1",
        accountName: "OpenDX Store Official",
        maskedToken: "EAAB...new1",
        tokenStatus: "healthy",
        requiresAction: false,
      }),
    };

    const app = createTestApp(mockManager);
    const res = await request(app)
      .post("/v1/admin/marketing/social-tokens/refresh")
      .set("Authorization", "Bearer valid-token")
      .send({ platform: "facebook", accountId: "page-1" });

    expect(res.status).toBe(200);
    expect(res.body.tokenStatus).toBe("healthy");
    expect(mockManager.autoRefreshAccount).toHaveBeenCalledWith("facebook", "page-1");
  });

  it("POST /v1/admin/marketing/social-tokens/oauth-exchange exchanges authorization code", async () => {
    const mockManager = {
      handleOAuthCallback: vi.fn().mockResolvedValue({
        platform: "facebook",
        accountId: "page-1",
        accountName: "OpenDX Store Official",
        maskedToken: "EAAB...oauth",
        tokenStatus: "healthy",
        requiresAction: false,
      }),
    };

    const app = createTestApp(mockManager);
    const res = await request(app)
      .post("/v1/admin/marketing/social-tokens/oauth-exchange")
      .set("Authorization", "Bearer valid-token")
      .send({
        platform: "facebook",
        code: "valid_code",
        redirectUri: "https://opendx.example.com/oauth/callback",
        targetPageId: "page-1",
      });

    expect(res.status).toBe(200);
    expect(res.body.accountName).toBe("OpenDX Store Official");
    expect(mockManager.handleOAuthCallback).toHaveBeenCalledWith(
      "facebook",
      "valid_code",
      "https://opendx.example.com/oauth/callback",
      "page-1",
    );
  });

  it("POST /v1/admin/marketing/social-tokens/check triggers on-demand health check", async () => {
    const mockManager = {
      performHealthCheck: vi.fn().mockResolvedValue({
        overallStatus: "healthy",
        activeAlertCount: 0,
        accounts: [],
      }),
    };

    const app = createTestApp(mockManager);
    const res = await request(app)
      .post("/v1/admin/marketing/social-tokens/check")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(mockManager.performHealthCheck).toHaveBeenCalledOnce();
  });

  it("POST /v1/admin/marketing/social-tokens/update updates token directly", async () => {
    const mockManager = {
      updateAccountToken: vi.fn().mockResolvedValue({
        platform: "facebook",
        accountId: "page-1",
        accountName: "Facebook Page",
        maskedToken: "EAAB...updated",
        tokenStatus: "healthy",
        requiresAction: false,
      }),
    };

    const app = createTestApp(mockManager);
    const res = await request(app)
      .post("/v1/admin/marketing/social-tokens/update")
      .set("Authorization", "Bearer valid-token")
      .send({ platform: "facebook", accessToken: "EAAB1234567890abcdef", accountId: "page-1" });

    expect(res.status).toBe(200);
    expect(res.body.tokenStatus).toBe("healthy");
    expect(mockManager.updateAccountToken).toHaveBeenCalledWith("facebook", "EAAB1234567890abcdef", "page-1");
  });

  it("POST /v1/admin/marketing/social-tokens/sync-env syncs tokens from environment", async () => {
    const mockManager = {
      syncFromEnvironment: vi.fn().mockResolvedValue({
        overallStatus: "healthy",
        activeAlertCount: 0,
        accounts: [],
      }),
    };

    const app = createTestApp(mockManager);
    const res = await request(app)
      .post("/v1/admin/marketing/social-tokens/sync-env")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(mockManager.syncFromEnvironment).toHaveBeenCalledOnce();
  });
});
