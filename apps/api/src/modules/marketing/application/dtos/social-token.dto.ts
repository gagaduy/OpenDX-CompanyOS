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
  readonly hoursRemaining?: number | null;
  readonly expiresInHuman?: string | null;
  readonly tokenExpiresAt?: string | null;
  readonly dataAccessExpiresAt?: string | null;
  readonly isLongLived: boolean;
  readonly scopes: readonly string[];
  readonly lastCheckedAt?: string | null;
  readonly lastError?: string | null;
  readonly requiresAction: boolean;
  readonly actionType?: "auto_refresh" | "oauth_reconnect";
}

export function formatExpiresIn(diffHours: number | null | undefined): string | null {
  if (diffHours === null || diffHours === undefined) {
    return null;
  }
  if (diffHours <= 0) {
    return "Đã hết hạn";
  }
  if (diffHours < 1) {
    const mins = Math.max(1, Math.round(diffHours * 60));
    return `Còn ${mins} phút`;
  }
  if (diffHours < 24) {
    const hours = Math.floor(diffHours);
    const mins = Math.round((diffHours % 1) * 60);
    if (mins === 0) {
      return `Còn ${hours} giờ`;
    }
    return `Còn ${hours} giờ ${mins} phút`;
  }
  const days = Math.floor(diffHours / 24);
  const remainingHours = Math.round(diffHours % 24);
  if (remainingHours === 0) {
    return `Còn ${days} ngày`;
  }
  return `Còn ${days} ngày ${remainingHours} giờ`;
}

export interface SocialTokensSummaryView {
  readonly accounts: readonly SocialTokenHealthView[];
  readonly overallStatus: "healthy" | "warning" | "critical";
  readonly activeAlertCount: number;
  readonly alertMessage?: string | null;
}

