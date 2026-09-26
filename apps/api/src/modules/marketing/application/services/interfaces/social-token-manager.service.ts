// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  SocialTokenHealthView,
  SocialTokensSummaryView,
} from "../../dtos/social-token.dto";

export interface SocialTokenManagerService {
  getTokensSummary(): Promise<SocialTokensSummaryView>;
  performHealthCheck(): Promise<SocialTokensSummaryView>;
  autoRefreshAccount(
    platform: "facebook" | "instagram",
    accountId: string,
  ): Promise<SocialTokenHealthView>;
  handleOAuthCallback(
    platform: "facebook" | "instagram",
    code: string,
    redirectUri: string,
    targetPageId?: string,
    appId?: string,
    appSecret?: string,
  ): Promise<SocialTokenHealthView>;
  configureMetaApp(appId: string, appSecret: string): Promise<void>;
  updateAccountToken(
    platform: "facebook" | "instagram",
    accessToken: string,
    accountId?: string,
  ): Promise<SocialTokenHealthView>;
  syncFromEnvironment(): Promise<SocialTokensSummaryView>;
  seedFromEnvironmentIfEmpty(): Promise<void>;
}
