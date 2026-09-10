// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type SocialTokenStatus =
  | "healthy"
  | "expiring_soon"
  | "expired"
  | "invalid"
  | "unconfigured";

export interface SocialAccountEntity {
  readonly id: string;
  readonly platform: "facebook" | "instagram";
  readonly accountId: string;
  readonly accountName: string;
  readonly accessToken: string;
  readonly tokenType: string;
  readonly tokenStatus: SocialTokenStatus;
  readonly tokenExpiresAt?: string | null;
  readonly dataAccessExpiresAt?: string | null;
  readonly scopes: readonly string[];
  readonly isLongLived: boolean;
  readonly lastCheckedAt?: string | null;
  readonly lastError?: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
