// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  SocialTokenInspectionResult,
  SocialTokenInspectorPort,
} from "../../application/ports/social-token-inspector.port";
import type {
  ExtendedTokenResult,
  OAuthCodeExchangeResult,
  SocialTokenRefresherPort,
} from "../../application/ports/social-token-refresher.port";

export interface MetaGraphSocialTokenAdapterOptions {
  readonly graphApiBaseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

interface DebugTokenPayload {
  readonly data?: {
    readonly app_id?: string;
    readonly type?: string;
    readonly application?: string;
    readonly data_access_expires_at?: number;
    readonly expires_at?: number;
    readonly is_valid?: boolean;
    readonly issued_at?: number;
    readonly scopes?: readonly string[];
    readonly user_id?: string;
    readonly error?: {
      readonly code?: number;
      readonly message?: string;
      readonly subcode?: number;
    };
  };
  readonly error?: {
    readonly message?: string;
    readonly type?: string;
    readonly code?: number;
    readonly error_subcode?: number;
  };
}

export class MetaGraphSocialTokenAdapter implements SocialTokenInspectorPort, SocialTokenRefresherPort {
  private readonly graphApiBaseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options?: MetaGraphSocialTokenAdapterOptions) {
    this.graphApiBaseUrl = (options?.graphApiBaseUrl ?? "https://graph.facebook.com/v20.0").replace(/\/+$/, "");
    this.requestTimeoutMs = options?.requestTimeoutMs ?? 15_000;
    this.fetcher = options?.fetcher ?? fetch;
  }

  async inspectToken(
    platform: "facebook" | "instagram",
    token: string,
    accountId: string,
  ): Promise<SocialTokenInspectionResult> {
    if (!token || token.trim().length === 0) {
      return {
        isValid: false,
        accountId,
        accountName: "",
        scopes: [],
        isLongLived: false,
        error: "Missing or empty access token",
      };
    }

    let debugData: DebugTokenPayload["data"];
    let debugError: string | undefined;

    // 1. Check token via /debug_token
    try {
      const debugEndpoint = `${this.graphApiBaseUrl}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
      const response = await this.fetchWithTimeout(debugEndpoint);
      const parsed = (await response.json()) as DebugTokenPayload;

      if (!response.ok || parsed.error || parsed.data?.error) {
        const rawErr = parsed.error?.message ?? parsed.data?.error?.message ?? `HTTP ${response.status} from Meta debug_token`;
        debugError = this.sanitize(rawErr, token);
      } else if (parsed.data) {
        debugData = parsed.data;
      }
    } catch (err: any) {
      debugError = this.sanitize(err?.message ?? "Network error during debug_token call", token);
    }

    // 2. Fetch page / account name
    let accountName = "";
    let pageCanPost = false;
    try {
      const pageEndpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(accountId)}?fields=id,name,can_post&access_token=${encodeURIComponent(token)}`;
      const response = await this.fetchWithTimeout(pageEndpoint);
      if (response.ok) {
        const parsed = (await response.json()) as { id?: string; name?: string; can_post?: boolean };
        accountName = parsed.name ?? "";
        pageCanPost = parsed.can_post ?? true;
      } else if (!debugError) {
        const parsed = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        const rawErr = parsed.error?.message ?? `HTTP ${response.status} verifying page access`;
        debugError = this.sanitize(rawErr, token);
      }
    } catch (err: any) {
      if (!debugError) {
        debugError = this.sanitize(err?.message ?? "Network error during account verification", token);
      }
    }

    const isValid = Boolean(debugData?.is_valid ?? (accountName.length > 0 && !debugError));

    let expiresAt: string | null = null;
    if (debugData?.expires_at && debugData.expires_at > 0) {
      expiresAt = new Date(debugData.expires_at * 1000).toISOString();
    }

    let dataAccessExpiresAt: string | null = null;
    if (debugData?.data_access_expires_at && debugData.data_access_expires_at > 0) {
      dataAccessExpiresAt = new Date(debugData.data_access_expires_at * 1000).toISOString();
    }

    const isLongLived =
      debugData?.expires_at === 0 ||
      expiresAt === null ||
      (debugData?.expires_at !== undefined &&
        debugData.issued_at !== undefined &&
        debugData.expires_at - debugData.issued_at > 86400 * 30);

    return {
      isValid,
      accountId,
      accountName: accountName || (debugData?.application ?? accountId),
      expiresAt,
      dataAccessExpiresAt,
      scopes: debugData?.scopes ?? [],
      isLongLived,
      error: isValid ? null : debugError ?? "Token is invalid or expired",
    };
  }

  async extendToken(
    platform: "facebook" | "instagram",
    currentToken: string,
    appId: string,
    appSecret: string,
    targetPageId?: string,
  ): Promise<ExtendedTokenResult> {
    const endpoint = `${this.graphApiBaseUrl}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(currentToken)}`;

    const response = await this.fetchWithTimeout(endpoint);
    const rawText = typeof response.text === "function" ? await response.text() : JSON.stringify(await response.json());

    if (!response.ok) {
      let msg = `HTTP ${response.status} from Meta token extension`;
      try {
        const parsed = JSON.parse(rawText);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {
        // Ignored
      }
      throw new Error(this.sanitize(msg, currentToken));
    }

    const parsed = JSON.parse(rawText) as { access_token: string; expires_in?: number };
    const extendedUserToken = parsed.access_token;

    // If a target page ID is specified, query for the permanent Page Access Token
    if (targetPageId) {
      try {
        const pageEndpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(targetPageId)}?fields=access_token,name&access_token=${encodeURIComponent(extendedUserToken)}`;
        const pageRes = await this.fetchWithTimeout(pageEndpoint);
        if (pageRes.ok) {
          const pageData = (await pageRes.json()) as { access_token?: string };
          if (pageData.access_token) {
            return {
              accessToken: pageData.access_token,
              expiresInSeconds: null,
              isLongLived: true,
            };
          }
        }
      } catch {
        // Fall back to returning the extended user token
      }
    }

    return {
      accessToken: extendedUserToken,
      expiresInSeconds: parsed.expires_in ?? null,
      isLongLived: true,
    };
  }

  async exchangeOAuthCode(
    platform: "facebook" | "instagram",
    code: string,
    redirectUri: string,
    appId: string,
    appSecret: string,
    targetPageId?: string,
  ): Promise<OAuthCodeExchangeResult> {
    // 1. Exchange code for short-lived user token
    const codeEndpoint = `${this.graphApiBaseUrl}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`;

    const codeRes = await this.fetchWithTimeout(codeEndpoint);
    const codeRaw = typeof codeRes.text === "function" ? await codeRes.text() : JSON.stringify(await codeRes.json());

    if (!codeRes.ok) {
      let msg = `HTTP ${codeRes.status} exchanging OAuth code`;
      try {
        const parsed = JSON.parse(codeRaw);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {
        // Ignored
      }
      throw new Error(this.sanitize(msg, code));
    }

    const codeParsed = JSON.parse(codeRaw) as { access_token: string; expires_in?: number };
    const shortUserToken = codeParsed.access_token;

    // 2. Exchange short-lived user token for long-lived user token
    let longUserToken = shortUserToken;
    let expiresInSeconds = codeParsed.expires_in ?? null;
    try {
      const extendRes = await this.extendToken(platform, shortUserToken, appId, appSecret);
      longUserToken = extendRes.accessToken;
      expiresInSeconds = extendRes.expiresInSeconds ?? null;
    } catch {
      // Proceed with short token if extension fails
    }

    // 3. Obtain Page Access Token
    let pageAccessToken = longUserToken;
    let pageId = targetPageId ?? "";
    let pageName = "";

    if (targetPageId) {
      try {
        const pageEndpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(targetPageId)}?fields=access_token,name&access_token=${encodeURIComponent(longUserToken)}`;
        const pageRes = await this.fetchWithTimeout(pageEndpoint);
        if (pageRes.ok) {
          const pageData = (await pageRes.json()) as { access_token?: string; id?: string; name?: string };
          if (pageData.access_token) {
            pageAccessToken = pageData.access_token;
            pageId = pageData.id ?? targetPageId;
            pageName = pageData.name ?? "";
          }
        }
      } catch {
        // Try fallback to /me/accounts
      }
    }

    if (!pageName) {
      try {
        const accountsEndpoint = `${this.graphApiBaseUrl}/me/accounts?access_token=${encodeURIComponent(longUserToken)}`;
        const accRes = await this.fetchWithTimeout(accountsEndpoint);
        if (accRes.ok) {
          const accData = (await accRes.json()) as {
            data?: Array<{ id: string; name: string; access_token: string }>;
          };
          if (Array.isArray(accData.data) && accData.data.length > 0) {
            const matched = targetPageId
              ? accData.data.find((p) => p.id === targetPageId) ?? accData.data[0]
              : accData.data[0];
            pageAccessToken = matched.access_token;
            pageId = matched.id;
            pageName = matched.name;
          }
        }
      } catch {
        // Fall back to user token
      }
    }

    return {
      userAccessToken: longUserToken,
      pageAccessToken,
      pageId: pageId || "facebook-page",
      pageName: pageName || "Facebook Page",
      expiresInSeconds,
    };
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await this.fetcher(url, {
        method: "GET",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private sanitize(text: string, token: string): string {
    if (!token || token.trim().length === 0) return text;
    return text.split(token).join("[REDACTED]");
  }
}
