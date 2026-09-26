// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { PostgresqlSocialAccountRepository } from "../infrastructure/repositories/implementations/postgresql-social-account.repository";
import type { SocialAccountEntity } from "../domain/entities/social-account";

describe("PostgresqlSocialAccountRepository", () => {
  it("upserts and retrieves social account entities", async () => {
    const mockRows = [
      {
        id: "acc-fb-1",
        platform: "facebook",
        account_id: "page-123",
        account_name: "OpenDX Store Official",
        access_token: "EAABtesttoken1234567890",
        token_type: "bearer",
        token_status: "healthy",
        token_expires_at: new Date("2026-10-10T00:00:00Z"),
        data_access_expires_at: null,
        scopes: ["pages_manage_posts", "pages_read_engagement"],
        is_long_lived: true,
        last_checked_at: new Date("2026-09-10T12:00:00Z"),
        last_error: null,
        metadata: {},
        created_at: new Date("2026-09-10T10:00:00Z"),
        updated_at: new Date("2026-09-10T12:00:00Z"),
      },
    ];

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes("WHERE platform = $1 AND account_id = $2")) {
          return Promise.resolve({ rows: mockRows });
        }
        if (sql.includes("FROM marketing_social_accounts") && sql.includes("ORDER BY")) {
          return Promise.resolve({ rows: mockRows });
        }
        if (sql.includes("INSERT INTO marketing_social_accounts")) {
          return Promise.resolve({ rows: mockRows });
        }
        if (sql.includes("UPDATE marketing_social_accounts SET token_status = $3")) {
          return Promise.resolve({ rows: mockRows });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const repo = new PostgresqlSocialAccountRepository(mockPool as any);

    const account: SocialAccountEntity = {
      id: "acc-fb-1",
      platform: "facebook",
      accountId: "page-123",
      accountName: "OpenDX Store Official",
      accessToken: "EAABtesttoken1234567890",
      tokenType: "bearer",
      tokenStatus: "healthy",
      tokenExpiresAt: "2026-10-10T00:00:00.000Z",
      scopes: ["pages_manage_posts", "pages_read_engagement"],
      isLongLived: true,
      lastCheckedAt: "2026-09-10T12:00:00.000Z",
      metadata: {},
      createdAt: "2026-09-10T10:00:00.000Z",
      updatedAt: "2026-09-10T12:00:00.000Z",
    };

    const saved = await repo.upsertAccount(account);
    expect(saved.accountId).toBe("page-123");
    expect(saved.platform).toBe("facebook");

    const fetched = await repo.findByPlatformAndId("facebook", "page-123");
    expect(fetched).not.toBeNull();
    expect(fetched?.accountName).toBe("OpenDX Store Official");

    const all = await repo.listAccounts();
    expect(all).toHaveLength(1);
    expect(all[0].tokenStatus).toBe("healthy");
  });

  it("masks sensitive tokens correctly", async () => {
    const { maskToken } = await import("../application/dtos/social-token.dto");
    expect(maskToken("short")).toBe("********");
    expect(maskToken("EAAB1234567890XYZ")).toBe("EAAB...0XYZ");
  });
});
