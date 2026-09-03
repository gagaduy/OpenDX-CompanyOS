// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type {
  PublicationExecutionMode,
  SocialPlatform,
} from "../../domain/entities/marketing-campaign";
import { assertFormatEnabled } from "../../domain/services/marketing-publication-policy";
import {
  MarketingPublicMediaPreparationError,
} from "../../application/services/interfaces/marketing-public-media.service";
import {
  type SocialPublicationReceipt,
  type SocialPublisherPort,
  SocialPublisherError,
  type SocialPublishMediaItem,
  type SocialPublishRequest,
  type SocialReconciliationRequest,
  type SocialReconciliationResult,
} from "../../application/ports/social-publisher.port";

export interface MetaGraphInstagramPublisherAdapterOptions {
  readonly businessAccountId: string;
  readonly accessToken: string;
  readonly preparePublicMediaUrl: (media: SocialPublishMediaItem) => Promise<string>;
  readonly graphApiBaseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly maxPollAttempts?: number;
  readonly now?: () => string;
  readonly fetcher?: typeof fetch;
}

interface GraphApiErrorPayload {
  readonly error?: {
    readonly message?: string;
    readonly type?: string;
    readonly code?: number;
    readonly error_subcode?: number;
    readonly fbtrace_id?: string;
  };
}

export class MetaGraphInstagramPublisherAdapter implements SocialPublisherPort {
  readonly platform: SocialPlatform = "instagram";
  readonly executionMode: PublicationExecutionMode = "live";

  private readonly businessAccountId: string;
  private readonly accessToken: string;
  private readonly preparePublicMediaUrl: (media: SocialPublishMediaItem) => Promise<string>;
  private readonly graphApiBaseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly now: () => string;
  private readonly fetcher: typeof fetch;

  constructor(options: MetaGraphInstagramPublisherAdapterOptions) {
    if (
      !options.businessAccountId
      || !options.accessToken
      || typeof options.preparePublicMediaUrl !== "function"
    ) {
      throw new SocialPublisherError(
        "INVALID_CONFIGURATION",
        "businessAccountId, accessToken, and preparePublicMediaUrl are required for live Instagram publisher",
      );
    }
    this.businessAccountId = options.businessAccountId;
    this.accessToken = options.accessToken;
    this.preparePublicMediaUrl = options.preparePublicMediaUrl;
    this.graphApiBaseUrl = (options.graphApiBaseUrl ?? "https://graph.facebook.com/v20.0").replace(/\/+$/, "");
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.maxPollAttempts = options.maxPollAttempts ?? 10;
    this.now = options.now ?? (() => new Date().toISOString());
    this.fetcher = options.fetcher ?? fetch;
  }

  async publish(request: SocialPublishRequest): Promise<SocialPublicationReceipt> {
    assertFormatEnabled("instagram", request.target.format);

    if (request.media.length === 0) {
      throw new SocialPublisherError("INVALID_INPUT", "At least one media item is required for Instagram publication");
    }

    let containerId: string;
    const accountId = this.businessAccountId;

    if (request.target.format === "feed_image") {
      const mediaItem = request.media[0]!;
      const mediaUrl = await this.prepareMediaUrl(mediaItem);
      containerId = await this.createImageContainer(accountId, mediaUrl, request.caption);
    } else if (request.target.format === "story_image") {
      const mediaItem = request.media[0]!;
      const mediaUrl = await this.prepareMediaUrl(mediaItem);
      containerId = await this.createStoryContainer(accountId, mediaUrl);
    } else if (request.target.format === "image_carousel") {
      if (request.media.length < 2 || request.media.length > 10) {
        throw new SocialPublisherError("INVALID_MEDIA_COUNT", "Instagram carousel requires between 2 and 10 images");
      }
      const mediaUrls = await Promise.all(
        request.media.map((item) => this.prepareMediaUrl(item)),
      );
      const childContainerIds: string[] = [];
      for (const mediaUrl of mediaUrls) {
        const childId = await this.createCarouselItemContainer(accountId, mediaUrl);
        childContainerIds.push(childId);
      }
      containerId = await this.createCarouselParentContainer(accountId, childContainerIds, request.caption);
    } else {
      throw new SocialPublisherError("UNSUPPORTED_FORMAT", `Unsupported Instagram format '${request.target.format}'`);
    }

    // Wait for container readiness
    await this.waitForContainerReady(containerId);

    // Publish container
    const publishEndpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(accountId)}/media_publish`;
    const publishResponse = await this.postJson(publishEndpoint, {
      creation_id: containerId,
      access_token: this.accessToken,
    });

    const postId = publishResponse.data.id;
    if (!postId) {
      throw new SocialPublisherError("INVALID_RESPONSE_FORMAT", "Instagram publish response missing post ID");
    }

    const verifiedAt = this.now();
    const providerReceiptDigest = createHash("sha256").update(publishResponse.rawText).digest("hex");
    const verificationEvidenceDigest = createHash("sha256").update(`evidence:${postId}:${verifiedAt}`).digest("hex");

    let publicationUrl: string | null = null;
    try {
      const permalinkEndpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(postId)}?fields=id,permalink&access_token=${encodeURIComponent(this.accessToken)}`;
      const permalinkResp = await this.fetchWithTimeout(permalinkEndpoint, { method: "GET" });
      if (permalinkResp.ok) {
        const parsed = await permalinkResp.json();
        if (parsed.permalink) {
          publicationUrl = parsed.permalink;
        }
      }
    } catch {
      // Permalink lookup is best-effort; keep the verified receipt URL unknown.
    }

    return {
      platform: "instagram",
      executionMode: "live",
      simulated: false,
      externalPublicationId: postId,
      pageId: accountId,
      publicationUrl,
      providerReceiptDigest,
      verificationEvidenceDigest,
      verifiedAt,
      displayMessage: "Published to Instagram",
    };
  }

  async reconcile(request: SocialReconciliationRequest): Promise<SocialReconciliationResult> {
    if (!request.externalPublicationId) {
      return { exists: false };
    }

    try {
      const endpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(request.externalPublicationId)}?fields=id,permalink,media_type&access_token=${encodeURIComponent(this.accessToken)}`;
      const response = await this.fetchWithTimeout(endpoint, { method: "GET" });
      if (!response.ok) {
        return { exists: false };
      }
      const parsed = await response.json();
      if (parsed.id) {
        return {
          exists: true,
          receipt: {
            platform: "instagram",
            executionMode: "live",
            simulated: false,
            externalPublicationId: parsed.id,
            pageId: this.businessAccountId,
            publicationUrl: parsed.permalink ?? null,
            providerReceiptDigest: createHash("sha256").update(JSON.stringify(parsed)).digest("hex"),
            verifiedAt: this.now(),
            displayMessage: "Reconciled from Instagram",
          },
        };
      }
      return { exists: false };
    } catch {
      return { exists: false };
    }
  }

  private async prepareMediaUrl(media: SocialPublishMediaItem): Promise<string> {
    try {
      return await this.preparePublicMediaUrl(media);
    } catch (error) {
      if (error instanceof MarketingPublicMediaPreparationError) {
        const code = error.code === "MARKETING_MEDIA_INVALID"
          ? "INSTAGRAM_MEDIA_INVALID"
          : "INSTAGRAM_MEDIA_UNAVAILABLE";
        throw new SocialPublisherError(
          code,
          "Instagram media preparation failed",
          { retryable: error.retryable },
        );
      }
      throw new SocialPublisherError(
        "INSTAGRAM_MEDIA_PREPARATION_FAILED",
        "Instagram media preparation failed",
        { retryable: true },
      );
    }
  }

  private async createImageContainer(accountId: string, imageUrl: string, caption: string): Promise<string> {
    const endpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(accountId)}/media`;
    const res = await this.postJson(endpoint, {
      image_url: imageUrl,
      caption,
      access_token: this.accessToken,
    });
    if (!res.data.id) {
      throw new SocialPublisherError("CONTAINER_CREATION_FAILED", "Failed to create Instagram image container");
    }
    return res.data.id;
  }

  private async createStoryContainer(accountId: string, imageUrl: string): Promise<string> {
    const endpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(accountId)}/media`;
    const res = await this.postJson(endpoint, {
      image_url: imageUrl,
      media_type: "STORIES",
      access_token: this.accessToken,
    });
    if (!res.data.id) {
      throw new SocialPublisherError("CONTAINER_CREATION_FAILED", "Failed to create Instagram story container");
    }
    return res.data.id;
  }

  private async createCarouselItemContainer(accountId: string, imageUrl: string): Promise<string> {
    const endpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(accountId)}/media`;
    const res = await this.postJson(endpoint, {
      image_url: imageUrl,
      is_carousel_item: "true",
      access_token: this.accessToken,
    });
    if (!res.data.id) {
      throw new SocialPublisherError("CONTAINER_CREATION_FAILED", "Failed to create Instagram carousel item container");
    }
    return res.data.id;
  }

  private async createCarouselParentContainer(accountId: string, children: string[], caption: string): Promise<string> {
    const endpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(accountId)}/media`;
    const res = await this.postJson(endpoint, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
      access_token: this.accessToken,
    });
    if (!res.data.id) {
      throw new SocialPublisherError("CONTAINER_CREATION_FAILED", "Failed to create Instagram carousel parent container");
    }
    return res.data.id;
  }

  private async waitForContainerReady(containerId: string): Promise<void> {
    const endpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(this.accessToken)}`;

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      let response: Response;
      let rawText: string;
      try {
        response = await this.fetchWithTimeout(endpoint, { method: "GET" });
        rawText = await response.text();
      } catch (err: any) {
        throw new SocialPublisherError("NETWORK_ERROR", this.sanitize(err?.message ?? "Network error"), {
          retryable: true,
          cause: err,
        });
      }

      if (!response.ok) {
        this.handleGraphApiError(response.status, rawText);
      }

      let parsed: { status_code?: string; status?: string };
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new SocialPublisherError("INVALID_RESPONSE_FORMAT", "Non-JSON response while checking container status");
      }

      const statusCode = (parsed.status_code ?? parsed.status ?? "").toUpperCase();
      if (statusCode === "FINISHED" || statusCode === "READY" || statusCode === "PUBLISHED") {
        return;
      }
      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        throw new SocialPublisherError("CONTAINER_PROCESSING_FAILED", `Instagram container processing failed with status: ${statusCode}`);
      }

      // If IN_PROGRESS, wait and poll again
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }

    throw new SocialPublisherError(
      "CONTAINER_PROCESSING_TIMEOUT",
      "Instagram container did not finish within the configured polling window",
      { retryable: true },
    );
  }

  private async postJson(endpoint: string, params: Record<string, string>): Promise<{ data: any; rawText: string }> {
    const body = new URLSearchParams(params);
    let response: Response;
    let rawText: string;

    try {
      response = await this.fetchWithTimeout(endpoint, {
        method: "POST",
        body,
      });
      rawText = await response.text();
    } catch (err: any) {
      const isTimeout = err?.name === "AbortError";
      throw new SocialPublisherError(
        isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        this.sanitize(isTimeout ? `Request timed out after ${this.requestTimeoutMs}ms` : err?.message ?? "Network error"),
        { retryable: true, cause: err },
      );
    }

    if (!response.ok) {
      this.handleGraphApiError(response.status, rawText);
    }

    try {
      const data = JSON.parse(rawText);
      return { data, rawText };
    } catch {
      throw new SocialPublisherError("INVALID_RESPONSE_FORMAT", "Meta Graph API returned non-JSON response");
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await this.fetcher(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private handleGraphApiError(httpStatus: number, rawText: string): never {
    let payload: GraphApiErrorPayload | undefined;
    try {
      payload = JSON.parse(rawText);
    } catch {
      // Ignored
    }

    const graphError = payload?.error;
    const rawMessage = graphError?.message ?? `HTTP ${httpStatus} error from Meta Graph API`;
    const message = this.sanitize(rawMessage);
    const code = graphError?.code;

    if (code === 190) {
      throw new SocialPublisherError("INSTAGRAM_TOKEN_INVALID", message, { httpStatus, retryable: false });
    }
    if (code === 200 || code === 10) {
      throw new SocialPublisherError("INSTAGRAM_PERMISSION_DENIED", message, { httpStatus, retryable: false });
    }
    if (code === 4 || code === 17 || code === 32 || code === 613) {
      throw new SocialPublisherError("INSTAGRAM_RATE_LIMITED", message, { httpStatus, retryable: true });
    }
    if (code === 368 || code === 506) {
      throw new SocialPublisherError("INSTAGRAM_POLICY_VIOLATION", message, { httpStatus, retryable: false });
    }

    const retryable = httpStatus >= 500;
    throw new SocialPublisherError("INSTAGRAM_PUBLISH_FAILED", message, { httpStatus, retryable });
  }

  private sanitize(text: string): string {
    if (!this.accessToken || this.accessToken.trim().length === 0) return text;
    return text.split(this.accessToken).join("[REDACTED]");
  }
}
