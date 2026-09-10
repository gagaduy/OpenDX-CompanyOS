// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { SocialTokenStatus } from "../../domain/entities/social-account";

export function maskToken(token: string): string {
  if (!token || token.length <= 8) {
    return "********";
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export interface SocialTokenHealthView {
  readonly platform: "facebook" | "instagram";
  readonly accountId: string;
  readonly accountName: string;
  readonly maskedToken: string;
  readonly tokenStatus: SocialTokenStatus;
  readonly daysRemaining?: number | null;
  readonly tokenExpiresAt?: string | null;
  readonly dataAccessExpiresAt?: string | null;
  readonly isLongLived: boolean;
  readonly scopes: readonly string[];
  readonly lastCheckedAt?: string | null;
  readonly lastError?: string | null;
  readonly requiresAction: boolean;
  readonly actionType?: "auto_refresh" | "oauth_reconnect";
}

export interface SocialTokensSummaryView {
  readonly accounts: readonly SocialTokenHealthView[];
  readonly overallStatus: "healthy" | "warning" | "critical";
  readonly activeAlertCount: number;
  readonly alertMessage?: string | null;
}
