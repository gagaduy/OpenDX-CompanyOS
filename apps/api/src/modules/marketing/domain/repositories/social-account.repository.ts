// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SocialAccountEntity, SocialTokenStatus } from "../entities/social-account";

export interface UpdateSocialHealthInput {
  readonly tokenStatus: SocialTokenStatus;
  readonly tokenExpiresAt?: string | null;
  readonly dataAccessExpiresAt?: string | null;
  readonly scopes?: readonly string[];
  readonly isLongLived?: boolean;
  readonly lastCheckedAt: string;
  readonly lastError?: string | null;
}

export interface UpdateAccessTokenInput {
  readonly accessToken: string;
  readonly tokenStatus: SocialTokenStatus;
  readonly tokenExpiresAt?: string | null;
  readonly dataAccessExpiresAt?: string | null;
  readonly isLongLived: boolean;
  readonly lastCheckedAt: string;
  readonly lastError?: string | null;
}

export interface SocialAccountRepository {
  findByPlatformAndId(
    platform: "facebook" | "instagram",
    accountId: string,
  ): Promise<SocialAccountEntity | null>;

  listAccounts(): Promise<readonly SocialAccountEntity[]>;

  upsertAccount(entity: SocialAccountEntity): Promise<SocialAccountEntity>;

  updateHealthStatus(
    platform: "facebook" | "instagram",
    accountId: string,
    input: UpdateSocialHealthInput,
  ): Promise<void>;

  updateAccessToken(
    platform: "facebook" | "instagram",
    accountId: string,
    input: UpdateAccessTokenInput,
  ): Promise<void>;
}
