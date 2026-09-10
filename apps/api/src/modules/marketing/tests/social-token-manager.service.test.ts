// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { SocialTokenManagerServiceImpl } from "../application/services/implementations/social-token-manager.service";
import type { SocialAccountEntity } from "../domain/entities/social-account";

describe("SocialTokenManagerService", () => {
  it("seeds accounts from environment when database is empty", async () => {
    let storedAccounts: SocialAccountEntity[] = [];

    const mockRepo = {
      listAccounts: vi.fn().mockImplementation(async () => storedAccounts),
      findByPlatformAndId: vi.fn().mockImplementation(async (plat, id) =>
        storedAccounts.find((a) => a.platform === plat && a.accountId === id) ?? null,
      ),
      upsertAccount: vi.fn().mockImplementation(async (acc) => {
        storedAccounts.push(acc);
        return acc;
      }),
      updateHealthStatus: vi.fn(),
      updateAccessToken: vi.fn(),
    };

    const mockInspector = {
      inspectToken: vi.fn().mockResolvedValue({
        isValid: true,
        accountId: "page-env-1",
        accountName: "Env Seeded Page",
        expiresAt: null,
        scopes: ["pages_manage_posts"],
        isLongLived: true,
      }),
    };

    const mockRefresher = {
      extendToken: vi.fn(),
      exchangeOAuthCode: vi.fn(),
    };

    const service = new SocialTokenManagerServiceImpl({
      socialAccountRepository: mockRepo as any,
      inspector: mockInspector as any,
      refresher: mockRefresher as any,
      appId: "fb-app-123",
      appSecret: "fb-secret-456",
      defaultFacebookPageId: "page-env-1",
      defaultFacebookToken: "EAAB_env_token_valid_123",
    });

    await service.seedFromEnvironmentIfEmpty();

    expect(mockRepo.upsertAccount).toHaveBeenCalled();
    expect(storedAccounts.length).toBeGreaterThan(0);
    expect(storedAccounts[0].accountId).toBe("page-env-1");
  });

  it("calculates summary status and detects expiring soon warning", async () => {
    const expiresSoonDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days remaining

    const storedAccounts: SocialAccountEntity[] = [
      {
        id: "acc-1",
        platform: "facebook",
        accountId: "page-1",
        accountName: "Store Page",
        accessToken: "EAAB_test_1234567890",
        tokenType: "bearer",
        tokenStatus: "expiring_soon",
        tokenExpiresAt: expiresSoonDate,
        scopes: ["pages_manage_posts"],
        isLongLived: true,
        lastCheckedAt: new Date().toISOString(),
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const mockRepo = {
      listAccounts: vi.fn().mockResolvedValue(storedAccounts),
      findByPlatformAndId: vi.fn().mockResolvedValue(storedAccounts[0]),
      upsertAccount: vi.fn(),
      updateHealthStatus: vi.fn(),
      updateAccessToken: vi.fn(),
    };

    const service = new SocialTokenManagerServiceImpl({
      socialAccountRepository: mockRepo as any,
      inspector: {} as any,
      refresher: {} as any,
    });

    const summary = await service.getTokensSummary();
    expect(summary.overallStatus).toBe("warning");
    expect(summary.activeAlertCount).toBe(1);
    expect(summary.accounts[0].daysRemaining).toBeLessThanOrEqual(5);
    expect(summary.accounts[0].requiresAction).toBe(true);
    expect(summary.accounts[0].actionType).toBe("auto_refresh");
  });

  it("executes autoRefreshAccount successfully without human paste", async () => {
    const storedAccount: SocialAccountEntity = {
      id: "acc-1",
      platform: "facebook",
      accountId: "page-1",
      accountName: "Store Page",
      accessToken: "EAAB_old_token",
      tokenType: "bearer",
      tokenStatus: "expiring_soon",
      tokenExpiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      scopes: ["pages_manage_posts"],
      isLongLived: true,
      lastCheckedAt: new Date().toISOString(),
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockRepo = {
      listAccounts: vi.fn().mockResolvedValue([storedAccount]),
      findByPlatformAndId: vi.fn().mockResolvedValue(storedAccount),
      upsertAccount: vi.fn(),
      updateHealthStatus: vi.fn(),
      updateAccessToken: vi.fn().mockResolvedValue(undefined),
    };

    const mockRefresher = {
      extendToken: vi.fn().mockResolvedValue({
        accessToken: "EAAB_new_refreshed_permanent_token",
        expiresInSeconds: null,
        isLongLived: true,
      }),
      exchangeOAuthCode: vi.fn(),
    };

    const service = new SocialTokenManagerServiceImpl({
      socialAccountRepository: mockRepo as any,
      inspector: {} as any,
      refresher: mockRefresher as any,
      appId: "app-1",
      appSecret: "sec-1",
    });

    const result = await service.autoRefreshAccount("facebook", "page-1");
    expect(mockRefresher.extendToken).toHaveBeenCalledWith(
      "facebook",
      "EAAB_old_token",
      "app-1",
      "sec-1",
      "page-1",
    );
    expect(mockRepo.updateAccessToken).toHaveBeenCalled();
    expect(result.tokenStatus).toBe("healthy");
    expect(result.maskedToken).toBe("EAAB...oken");
  });

  it("handles OAuth callback code exchange and updates database", async () => {
    const mockRepo = {
      listAccounts: vi.fn().mockResolvedValue([]),
      findByPlatformAndId: vi.fn().mockResolvedValue(null),
      upsertAccount: vi.fn().mockImplementation(async (acc) => acc),
      updateHealthStatus: vi.fn(),
      updateAccessToken: vi.fn(),
    };

    const mockRefresher = {
      extendToken: vi.fn(),
      exchangeOAuthCode: vi.fn().mockResolvedValue({
        userAccessToken: "EAAB_user_token",
        pageAccessToken: "EAAB_permanent_page_token_12345",
        pageId: "page-1",
        pageName: "Store Page Official",
        expiresInSeconds: null,
      }),
    };

    const service = new SocialTokenManagerServiceImpl({
      socialAccountRepository: mockRepo as any,
      inspector: {} as any,
      refresher: mockRefresher as any,
      appId: "app-1",
      appSecret: "sec-1",
    });

    const result = await service.handleOAuthCallback(
      "facebook",
      "oauth_code_123",
      "https://opendx.example.com/oauth/callback",
      "page-1",
    );

    expect(mockRefresher.exchangeOAuthCode).toHaveBeenCalled();
    expect(mockRepo.upsertAccount).toHaveBeenCalled();
    expect(result.tokenStatus).toBe("healthy");
    expect(result.accountName).toBe("Store Page Official");
  });
});
