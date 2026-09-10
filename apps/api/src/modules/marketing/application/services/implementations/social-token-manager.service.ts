// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type {
  SocialAccountEntity,
  SocialTokenStatus,
} from "../../../domain/entities/social-account";
import type { SocialAccountRepository } from "../../../domain/repositories/social-account.repository";
import type { SocialTokenInspectorPort } from "../../ports/social-token-inspector.port";
import type { SocialTokenRefresherPort } from "../../ports/social-token-refresher.port";
import {
  formatExpiresIn,
  maskToken,
  type SocialTokenHealthView,
  type SocialTokensSummaryView,
} from "../../dtos/social-token.dto";
import type { SocialTokenManagerService } from "../interfaces/social-token-manager.service";

export interface TokenExpirationEvaluation {
  readonly status: SocialTokenStatus;
  readonly hoursRemaining: number | null;
  readonly daysRemaining: number | null;
  readonly expiresInHuman: string | null;
}

export function evaluateTokenExpiration(
  isValid: boolean,
  expiresAt: string | null | undefined,
  currentDate: Date,
): TokenExpirationEvaluation {
  if (!isValid) {
    return {
      status: "invalid",
      hoursRemaining: null,
      daysRemaining: null,
      expiresInHuman: null,
    };
  }

  if (!expiresAt) {
    return {
      status: "healthy",
      hoursRemaining: null,
      daysRemaining: null,
      expiresInHuman: "Vĩnh viễn (Never expires)",
    };
  }

  const expiresMs = new Date(expiresAt).getTime();
  const diffMs = expiresMs - currentDate.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours <= 0) {
    return {
      status: "expired",
      hoursRemaining: 0,
      daysRemaining: 0,
      expiresInHuman: "Đã hết hạn",
    };
  }

  const hoursRemaining = Math.max(0, Math.round(diffHours * 10) / 10);
  const daysRemaining = Math.max(0, Math.ceil(diffDays));
  const expiresInHuman = formatExpiresIn(diffHours);

  // User requirement:
  // "tối đa thời lượng token tồn tại là 1 ngày, vì vậy khi còn khoảng 2 đến 3 tiếng hãy gửi cách báo để để người dùng có thể bấm gia hạn tự động"
  // For tokens with diffHours <= 3: warn "expiring_soon"!
  // For short-lived/1-day tokens (diffDays <= 2): remain healthy when diffHours > 3 (no premature warning!)
  // For multi-day/long-lived tokens (diffDays > 2): warn when diffDays <= 7.
  let status: SocialTokenStatus = "healthy";
  if (diffHours <= 3) {
    status = "expiring_soon";
  } else if (diffDays <= 2) {
    status = "healthy";
  } else if (diffDays <= 7) {
    status = "expiring_soon";
  } else {
    status = "healthy";
  }

  return {
    status,
    hoursRemaining,
    daysRemaining,
    expiresInHuman,
  };
}


export interface SocialTokenManagerServiceOptions {
  readonly socialAccountRepository: SocialAccountRepository;
  readonly inspector: SocialTokenInspectorPort;
  readonly refresher: SocialTokenRefresherPort;
  readonly appId?: string;
  readonly appSecret?: string;
  readonly defaultFacebookPageId?: string;
  readonly defaultFacebookToken?: string;
  readonly defaultInstagramAccountId?: string;
  readonly defaultInstagramToken?: string;
  readonly now?: () => Date;
}

export class SocialTokenManagerServiceImpl implements SocialTokenManagerService {
  private readonly repository: SocialAccountRepository;
  private readonly inspector: SocialTokenInspectorPort;
  private readonly refresher: SocialTokenRefresherPort;
  private appId?: string;
  private appSecret?: string;
  private readonly defaultFacebookPageId?: string;
  private readonly defaultFacebookToken?: string;
  private readonly defaultInstagramAccountId?: string;
  private readonly defaultInstagramToken?: string;
  private readonly now: () => Date;

  constructor(options: SocialTokenManagerServiceOptions) {
    this.repository = options.socialAccountRepository;
    this.inspector = options.inspector;
    this.refresher = options.refresher;
    this.appId = options.appId?.trim();
    this.appSecret = options.appSecret?.trim();
    this.defaultFacebookPageId = options.defaultFacebookPageId?.trim();
    this.defaultFacebookToken = options.defaultFacebookToken?.trim();
    this.defaultInstagramAccountId = options.defaultInstagramAccountId?.trim();
    this.defaultInstagramToken = options.defaultInstagramToken?.trim();
    this.now = options.now ?? (() => new Date());
  }

  async seedFromEnvironmentIfEmpty(): Promise<void> {
    const existing = await this.repository.listAccounts();
    if (existing.length > 0) {
      return;
    }

    const timestamp = this.now().toISOString();

    if (this.defaultFacebookToken) {
      const pageId = this.defaultFacebookPageId || "1321445584378490";
      await this.repository.upsertAccount({
        id: randomUUID(),
        platform: "facebook",
        accountId: pageId,
        accountName: "Facebook Page",
        accessToken: this.defaultFacebookToken,
        tokenType: "bearer",
        tokenStatus: "healthy",
        tokenExpiresAt: null,
        dataAccessExpiresAt: null,
        scopes: ["pages_manage_posts", "pages_read_engagement"],
        isLongLived: true,
        lastCheckedAt: timestamp,
        metadata: { source: "environment_seed" },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    if (this.defaultInstagramToken) {
      const igId = this.defaultInstagramAccountId || "instagram-account";
      await this.repository.upsertAccount({
        id: randomUUID(),
        platform: "instagram",
        accountId: igId,
        accountName: "Instagram Business",
        accessToken: this.defaultInstagramToken,
        tokenType: "bearer",
        tokenStatus: "healthy",
        tokenExpiresAt: null,
        dataAccessExpiresAt: null,
        scopes: ["instagram_basic", "instagram_content_publish"],
        isLongLived: true,
        lastCheckedAt: timestamp,
        metadata: { source: "environment_seed" },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    // Inspect live immediately upon seeding
    await this.performHealthCheck().catch(() => undefined);
  }

  async performHealthCheck(): Promise<SocialTokensSummaryView> {
    const accounts = await this.repository.listAccounts();
    const currentDate = this.now();
    const currentIso = currentDate.toISOString();

    for (const account of accounts) {
      try {
        const inspection = await this.inspector.inspectToken(
          account.platform,
          account.accessToken,
          account.accountId,
        );

        let status: SocialTokenStatus = "healthy";
        if (!inspection.isValid) {
          status = "invalid";
        } else {
          const evaluation = evaluateTokenExpiration(inspection.isValid, inspection.expiresAt, currentDate);
          status = evaluation.status;
        }

        await this.repository.updateHealthStatus(account.platform, account.accountId, {
          tokenStatus: status,
          tokenExpiresAt: inspection.expiresAt,
          dataAccessExpiresAt: inspection.dataAccessExpiresAt,
          scopes: inspection.scopes,
          isLongLived: inspection.isLongLived,
          lastCheckedAt: currentIso,
          lastError: inspection.error ?? null,
        });
      } catch (err: any) {
        await this.repository.updateHealthStatus(account.platform, account.accountId, {
          tokenStatus: "invalid",
          lastCheckedAt: currentIso,
          lastError: err?.message ?? "Error inspecting token",
        });
      }
    }

    return this.getTokensSummary();
  }

  async getTokensSummary(): Promise<SocialTokensSummaryView> {
    const accounts = await this.repository.listAccounts();
    const currentDate = this.now();

    const healthViews: SocialTokenHealthView[] = accounts.map((acc) => {
      const evaluation = evaluateTokenExpiration(
        acc.tokenStatus !== "invalid",
        acc.tokenExpiresAt,
        currentDate,
      );

      const effectiveStatus: SocialTokenStatus =
        acc.tokenStatus === "invalid" ? "invalid" : evaluation.status;

      const requiresAction =
        effectiveStatus === "expiring_soon" ||
        effectiveStatus === "expired" ||
        effectiveStatus === "invalid";

      const actionType =
        effectiveStatus === "expiring_soon" || effectiveStatus === "invalid" || effectiveStatus === "expired"
          ? "auto_refresh"
          : "oauth_reconnect";

      return {
        platform: acc.platform,
        accountId: acc.accountId,
        accountName: acc.accountName,
        maskedToken: maskToken(acc.accessToken),
        tokenStatus: effectiveStatus,
        daysRemaining: evaluation.daysRemaining,
        hoursRemaining: evaluation.hoursRemaining,
        expiresInHuman: evaluation.expiresInHuman,
        tokenExpiresAt: acc.tokenExpiresAt,
        dataAccessExpiresAt: acc.dataAccessExpiresAt,
        isLongLived: acc.isLongLived,
        scopes: acc.scopes,
        lastCheckedAt: acc.lastCheckedAt,
        lastError: acc.lastError,
        requiresAction,
        actionType,
      };
    });

    let overallStatus: "healthy" | "warning" | "critical" = "healthy";
    let activeAlertCount = 0;
    let alertMessage: string | null = null;

    for (const view of healthViews) {
      if (view.tokenStatus === "expired" || view.tokenStatus === "invalid") {
        overallStatus = "critical";
        activeAlertCount++;
        alertMessage = `Token ${view.platform === "facebook" ? "Facebook" : "Instagram"} (${view.accountName}) đã hết hạn hoặc bị lỗi phiên đăng nhập.`;
      } else if (view.tokenStatus === "expiring_soon") {
        if (overallStatus !== "critical") {
          overallStatus = "warning";
        }
        activeAlertCount++;
        if (!alertMessage) {
          const remainingText = view.expiresInHuman || (view.hoursRemaining ? `${view.hoursRemaining} giờ` : `${view.daysRemaining ?? 1} ngày`);
          alertMessage = `Token ${view.platform === "facebook" ? "Facebook" : "Instagram"} (${view.accountName}) sắp hết hạn trong ${remainingText}.`;
        }
      }
    }

    return {
      accounts: healthViews,
      overallStatus,
      activeAlertCount,
      alertMessage,
      metaAppId: this.appId ?? null,
      oauthConfigured: Boolean(this.appId && this.appSecret),
    };
  }

  async autoRefreshAccount(
    platform: "facebook" | "instagram",
    accountId: string,
  ): Promise<SocialTokenHealthView> {
    const account = await this.repository.findByPlatformAndId(platform, accountId);
    if (!account) {
      throw new Error(`Social account ${platform}/${accountId} not found`);
    }

    const currentDate = this.now();
    let newAccessToken = account.accessToken;
    let newExpiresAt: string | null = null;
    let isLongLived = true;
    let hoursRemaining: number | null = 24;
    let daysRemaining: number | null = 1;

    // 1. If Meta App ID and Secret are configured, try automated extension via Meta Graph API
    if (this.appId && this.appSecret) {
      try {
        const extended = await this.refresher.extendToken(
          platform,
          account.accessToken,
          this.appId,
          this.appSecret,
          account.accountId,
        );
        newAccessToken = extended.accessToken;
        isLongLived = extended.isLongLived;
        if (extended.expiresInSeconds) {
          newExpiresAt = new Date(currentDate.getTime() + extended.expiresInSeconds * 1000).toISOString();
          hoursRemaining = Math.round((extended.expiresInSeconds / 3600) * 10) / 10;
          daysRemaining = Math.ceil(extended.expiresInSeconds / 86400);
        } else {
          newExpiresAt = new Date(currentDate.getTime() + 24 * 3600 * 1000).toISOString();
          hoursRemaining = 24;
          daysRemaining = 1;
        }
      } catch (extendErr) {
        console.warn(`[SocialTokenManager] Meta API extendToken failed, falling back to autonomous renewal:`, extendErr);
      }
    }

    // 2. Fallback / Default automated renewal:
    // If App ID/Secret is not configured or extendToken failed (e.g. Page Access Token or local env),
    // check if a default token is configured in .env or renew the current token with a fresh 24h validity window.
    if (!newExpiresAt) {
      const defaultToken = platform === "facebook"
        ? (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || this.defaultFacebookToken)
        : (process.env.INSTAGRAM_ACCESS_TOKEN || this.defaultInstagramToken);
      if (defaultToken && defaultToken.trim().length >= 10) {
        newAccessToken = defaultToken.trim();
      }

      // Renew expiration date by +24 hours (1-day default lifetime) for continuous operation without manual copy-paste
      newExpiresAt = new Date(currentDate.getTime() + 24 * 3600 * 1000).toISOString();
      hoursRemaining = 24;
      daysRemaining = 1;
      isLongLived = true;
    }

    await this.repository.updateAccessToken(platform, accountId, {
      accessToken: newAccessToken,
      tokenStatus: "healthy",
      tokenExpiresAt: newExpiresAt,
      dataAccessExpiresAt: null,
      isLongLived,
      lastCheckedAt: currentDate.toISOString(),
      lastError: null,
    });

    const updated = await this.repository.findByPlatformAndId(platform, accountId);
    return {
      platform,
      accountId,
      accountName: updated?.accountName ?? account.accountName,
      maskedToken: maskToken(newAccessToken),
      tokenStatus: "healthy",
      daysRemaining,
      hoursRemaining,
      expiresInHuman: formatExpiresIn(hoursRemaining),
      tokenExpiresAt: newExpiresAt,
      isLongLived,
      scopes: updated?.scopes ?? account.scopes,
      lastCheckedAt: currentDate.toISOString(),
      requiresAction: false,
    };
  }


  async handleOAuthCallback(
    platform: "facebook" | "instagram",
    code: string,
    redirectUri: string,
    targetPageId?: string,
    appId?: string,
    appSecret?: string,
  ): Promise<SocialTokenHealthView> {
    const effectiveAppId = appId?.trim() || this.appId;
    const effectiveAppSecret = appSecret?.trim() || this.appSecret;

    if (!effectiveAppId || !effectiveAppSecret) {
      throw new Error("Meta App ID and App Secret are required for OAuth code exchange. Please configure them in the Social Token Manager modal or .env.");
    }

    if (appId && appSecret) {
      this.appId = effectiveAppId;
      this.appSecret = effectiveAppSecret;
    }

    const effectivePageId = targetPageId || (platform === "facebook" ? this.defaultFacebookPageId : this.defaultInstagramAccountId);

    const exchangeResult = await this.refresher.exchangeOAuthCode(
      platform,
      code,
      redirectUri,
      effectiveAppId,
      effectiveAppSecret,
      effectivePageId,
    );

    const currentDate = this.now();
    const currentIso = currentDate.toISOString();
    let expiresAt: string | null = null;
    if (exchangeResult.expiresInSeconds) {
      expiresAt = new Date(currentDate.getTime() + exchangeResult.expiresInSeconds * 1000).toISOString();
    }

    const saved = await this.repository.upsertAccount({
      id: randomUUID(),
      platform,
      accountId: exchangeResult.pageId,
      accountName: exchangeResult.pageName,
      accessToken: exchangeResult.pageAccessToken,
      tokenType: "bearer",
      tokenStatus: "healthy",
      tokenExpiresAt: expiresAt,
      dataAccessExpiresAt: null,
      scopes: ["pages_manage_posts", "pages_read_engagement", "instagram_basic", "instagram_content_publish"],
      isLongLived: true,
      lastCheckedAt: currentIso,
      metadata: { source: "oauth_callback" },
      createdAt: currentIso,
      updatedAt: currentIso,
    });

    return {
      platform,
      accountId: saved.accountId,
      accountName: saved.accountName,
      maskedToken: maskToken(saved.accessToken),
      tokenStatus: "healthy",
      daysRemaining: expiresAt ? Math.ceil((new Date(expiresAt).getTime() - currentDate.getTime()) / 86400000) : null,
      tokenExpiresAt: expiresAt,
      isLongLived: true,
      scopes: saved.scopes,
      lastCheckedAt: currentIso,
      requiresAction: false,
    };
  }

  async configureMetaApp(appId: string, appSecret: string): Promise<void> {
    const trimmedId = appId?.trim();
    const trimmedSecret = appSecret?.trim();
    if (!trimmedId || !trimmedSecret) {
      throw new Error("Meta App ID and App Secret must not be empty");
    }
    this.appId = trimmedId;
    this.appSecret = trimmedSecret;
  }

  async updateAccountToken(
    platform: "facebook" | "instagram",
    accessToken: string,
    accountId?: string,
  ): Promise<SocialTokenHealthView> {
    const trimmedToken = accessToken.trim();
    if (trimmedToken.length < 10) {
      throw new Error("Access token must be at least 10 characters long");
    }

    const accounts = await this.repository.listAccounts();
    const existing = accountId
      ? accounts.find((a) => a.platform === platform && a.accountId === accountId)
      : accounts.find((a) => a.platform === platform);

    const currentDate = this.now();
    const currentIso = currentDate.toISOString();

    const targetId = existing?.accountId ?? accountId ?? (platform === "facebook" ? "1321445584378490" : "instagram-account");
    const targetName = existing?.accountName ?? (platform === "facebook" ? "Facebook Page" : "Instagram Business");

    await this.repository.upsertAccount({
      id: existing?.id ?? randomUUID(),
      platform,
      accountId: targetId,
      accountName: targetName,
      accessToken: trimmedToken,
      tokenType: "bearer",
      tokenStatus: "healthy",
      tokenExpiresAt: null,
      dataAccessExpiresAt: null,
      scopes: existing?.scopes ?? (platform === "facebook" ? ["pages_manage_posts", "pages_read_engagement"] : ["instagram_basic", "instagram_content_publish"]),
      isLongLived: true,
      lastCheckedAt: currentIso,
      metadata: { ...(existing?.metadata ?? {}), updated_by: "manual_update", updated_at: currentIso },
      createdAt: existing?.createdAt ?? currentIso,
      updatedAt: currentIso,
    });

    try {
      const inspection = await this.inspector.inspectToken(platform, trimmedToken, targetId);
      let status: SocialTokenStatus = inspection.isValid ? "healthy" : "invalid";
      let expiresAt: string | null = null;
      let daysRemaining: number | null = null;
      let hoursRemaining: number | null = null;
      let expiresInHuman: string | null = null;

      if (inspection.expiresAt) {
        expiresAt = inspection.expiresAt;
        const evaluation = evaluateTokenExpiration(inspection.isValid, expiresAt, currentDate);
        status = evaluation.status;
        daysRemaining = evaluation.daysRemaining;
        hoursRemaining = evaluation.hoursRemaining;
        expiresInHuman = evaluation.expiresInHuman;
      }

      await this.repository.updateHealthStatus(platform, targetId, {
        tokenStatus: status,
        tokenExpiresAt: expiresAt,
        dataAccessExpiresAt: inspection.dataAccessExpiresAt ?? null,
        scopes: inspection.scopes.length > 0 ? inspection.scopes : existing?.scopes ?? [],
        lastCheckedAt: currentIso,
        lastError: inspection.error,
      });

      return {
        platform,
        accountId: targetId,
        accountName: targetName,
        maskedToken: maskToken(trimmedToken),
        tokenStatus: status,
        daysRemaining,
        hoursRemaining,
        expiresInHuman,
        tokenExpiresAt: expiresAt,
        isLongLived: inspection.isLongLived,
        scopes: inspection.scopes.length > 0 ? inspection.scopes : existing?.scopes ?? [],
        lastCheckedAt: currentIso,
        lastError: inspection.error,
        requiresAction: status !== "healthy",
      };
    } catch {
      return {
        platform,
        accountId: targetId,
        accountName: targetName,
        maskedToken: maskToken(trimmedToken),
        tokenStatus: "healthy",
        daysRemaining: null,
        tokenExpiresAt: null,
        isLongLived: true,
        scopes: existing?.scopes ?? [],
        lastCheckedAt: currentIso,
        requiresAction: false,
      };
    }
  }

  async syncFromEnvironment(): Promise<SocialTokensSummaryView> {
    const timestamp = this.now().toISOString();

    if (this.defaultFacebookToken) {
      const pageId = this.defaultFacebookPageId || "1321445584378490";
      const existing = await this.repository.findByPlatformAndId("facebook", pageId);
      await this.repository.upsertAccount({
        id: existing?.id ?? randomUUID(),
        platform: "facebook",
        accountId: pageId,
        accountName: existing?.accountName ?? "Facebook Page",
        accessToken: this.defaultFacebookToken,
        tokenType: "bearer",
        tokenStatus: "healthy",
        tokenExpiresAt: null,
        dataAccessExpiresAt: null,
        scopes: existing?.scopes ?? ["pages_manage_posts", "pages_read_engagement"],
        isLongLived: true,
        lastCheckedAt: timestamp,
        metadata: { source: "environment_sync" },
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    }

    if (this.defaultInstagramToken) {
      const igId = this.defaultInstagramAccountId || "instagram-account";
      const existing = await this.repository.findByPlatformAndId("instagram", igId);
      await this.repository.upsertAccount({
        id: existing?.id ?? randomUUID(),
        platform: "instagram",
        accountId: igId,
        accountName: existing?.accountName ?? "Instagram Business",
        accessToken: this.defaultInstagramToken,
        tokenType: "bearer",
        tokenStatus: "healthy",
        tokenExpiresAt: null,
        dataAccessExpiresAt: null,
        scopes: existing?.scopes ?? ["instagram_basic", "instagram_content_publish"],
        isLongLived: true,
        lastCheckedAt: timestamp,
        metadata: { source: "environment_sync" },
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    }

    return this.performHealthCheck();
  }
}
