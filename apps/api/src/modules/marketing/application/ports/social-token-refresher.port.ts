// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface ExtendedTokenResult {
  readonly accessToken: string;
  readonly expiresInSeconds?: number | null;
  readonly isLongLived: boolean;
}

export interface OAuthCodeExchangeResult {
  readonly userAccessToken: string;
  readonly pageAccessToken: string;
  readonly pageId: string;
  readonly pageName: string;
  readonly expiresInSeconds?: number | null;
}

export interface SocialTokenRefresherPort {
  extendToken(
    platform: "facebook" | "instagram",
    currentToken: string,
    appId: string,
    appSecret: string,
    targetPageId?: string,
  ): Promise<ExtendedTokenResult>;

  exchangeOAuthCode(
    platform: "facebook" | "instagram",
    code: string,
    redirectUri: string,
    appId: string,
    appSecret: string,
    targetPageId?: string,
  ): Promise<OAuthCodeExchangeResult>;
}
