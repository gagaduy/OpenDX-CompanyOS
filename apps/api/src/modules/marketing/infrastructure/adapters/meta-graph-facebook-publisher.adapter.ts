// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type {
  PublicationExecutionMode,
  SocialPlatform,
} from "../../../domain/entities/marketing-campaign";
import {
  type FacebookPageVerificationResult,
  type FacebookPublishInput,
  type FacebookPublishResult,
  FacebookPublisherError,
  type FacebookPublisherPort,
} from "../../application/ports/facebook-publisher.port";
import {
  type SocialPublicationReceipt,
  type SocialPublisherPort,
  type SocialPublishRequest,
  type SocialReconciliationRequest,
  type SocialReconciliationResult,
} from "../../application/ports/social-publisher.port";

export interface MetaGraphFacebookPublisherAdapterOptions {
  readonly pageId?: string;
  readonly pageAccessToken?: string;
  readonly graphApiBaseUrl?: string;
  readonly requestTimeoutMs?: number;
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

export class MetaGraphFacebookPublisherAdapter implements FacebookPublisherPort, SocialPublisherPort {
  readonly platform: SocialPlatform = "facebook";
  readonly executionMode: PublicationExecutionMode = "live";

  private readonly pageId?: string;
  private readonly pageAccessToken?: string;
  private readonly graphApiBaseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly now: () => string;
  private readonly fetcher: typeof fetch;

  constructor(options?: MetaGraphFacebookPublisherAdapterOptions) {
    this.pageId = options?.pageId;
    this.pageAccessToken = options?.pageAccessToken;
    this.graphApiBaseUrl = (options?.graphApiBaseUrl ?? "https://graph.facebook.com/v20.0").replace(/\/+$/, "");
    this.requestTimeoutMs = options?.requestTimeoutMs ?? 30_000;
    this.now = options?.now ?? (() => new Date().toISOString());
    this.fetcher = options?.fetcher ?? fetch;
  }

  async publish(request: SocialPublishRequest): Promise<SocialPublicationReceipt> {
    const pageId = this.pageId ?? request.target.accountConfigurationId;
    const pageAccessToken = this.pageAccessToken;

    if (!pageId || !pageAccessToken) {
      throw new FacebookPublisherError(
        "MISSING_CREDENTIALS",
        "Facebook pageId and pageAccessToken are required for live publication",
      );
    }

    const firstMedia = request.media[0];
    if (!firstMedia) {
      throw new FacebookPublisherError("INVALID_INPUT", "At least one visual asset is required for Facebook feed image post");
    }

    const result = await this.publishImagePost({
      pageId,
      pageAccessToken,
      message: request.caption,
      imageBuffer: firstMedia.bytes,
      imageFileName: firstMedia.fileName,
      mimeType: firstMedia.mimeType,
    });

    const verificationEvidenceDigest = createHash("sha256")
      .update(`evidence:${result.postId}:${result.publishedAt}`)
      .digest("hex");

    return {
      platform: "facebook",
      executionMode: "live",
      simulated: false,
      externalPublicationId: result.postId,
      pageId,
      publicationUrl: result.postUrl,
      providerReceiptDigest: result.rawResponseDigest,
      verificationEvidenceDigest,
      verifiedAt: result.publishedAt,
      displayMessage: "Published to Facebook",
    };
  }

  async reconcile(request: SocialReconciliationRequest): Promise<SocialReconciliationResult> {
    const pageId = this.pageId ?? request.target.accountConfigurationId;
    const pageAccessToken = this.pageAccessToken;

    if (!pageId || !pageAccessToken || !request.externalPublicationId) {
      return { exists: false };
    }

    try {
      const endpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(request.externalPublicationId)}?fields=id&access_token=${encodeURIComponent(pageAccessToken)}`;
      const response = await this.fetcher(endpoint, { method: "GET" });
      if (!response.ok) {
        return { exists: false };
      }
      const parsed = await response.json();
      if (parsed.id) {
        return { exists: true };
      }
      return { exists: false };
    } catch {
      return { exists: false };
    }
  }

  async publishImagePost(input: FacebookPublishInput): Promise<FacebookPublishResult> {
    if (!input.pageId || !input.pageAccessToken || !input.imageBuffer) {
      throw new FacebookPublisherError("INVALID_INPUT", "pageId, pageAccessToken, and imageBuffer are required");
    }

    const endpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(input.pageId)}/photos`;
    const formData = new FormData();
    formData.append("access_token", input.pageAccessToken);
    formData.append("message", input.message);
    formData.append("published", "true");

    const blob = new Blob([new Uint8Array(input.imageBuffer)], {
      type: input.mimeType ?? "image/png",
    });
    formData.append("source", blob, input.imageFileName ?? "marketing_creative.png");

    let response: Response;
    let rawText: string;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      response = await this.fetcher(endpoint, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      rawText = await response.text();
    } catch (error: any) {
      const isTimeout = error?.name === "AbortError";
      const sanitizedMessage = this.sanitize(
        isTimeout ? `Request timed out after ${this.requestTimeoutMs}ms` : error?.message ?? "Network error",
        input.pageAccessToken,
      );
      throw new FacebookPublisherError(
        isTimeout ? "FACEBOOK_TIMEOUT" : "FACEBOOK_NETWORK_ERROR",
        sanitizedMessage,
        { retryable: true, cause: error },
      );
    } finally {
      clearTimeout(timer);
    }

    const rawResponseDigest = createHash("sha256").update(rawText).digest("hex");

    if (!response.ok) {
      this.handleGraphApiError(response.status, rawText, input.pageAccessToken);
    }

    let parsed: { id?: string; post_id?: string };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new FacebookPublisherError(
        "INVALID_RESPONSE_FORMAT",
        "Meta Graph API returned non-JSON response",
        { httpStatus: response.status },
      );
    }

    const postId = parsed.post_id ?? parsed.id;
    if (!postId) {
      throw new FacebookPublisherError(
        "INVALID_RESPONSE_FORMAT",
        "Meta Graph API response missing post ID",
        { httpStatus: response.status },
      );
    }

    let postUrl: string;
    if (postId.includes("_")) {
      const parts = postId.split("_");
      postUrl = `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
    } else {
      postUrl = `https://www.facebook.com/${input.pageId}/posts/${postId}`;
    }

    return {
      postId,
      postUrl,
      publishedAt: this.now(),
      rawResponseDigest,
    };
  }

  async verifyPageAccess(pageId: string, pageAccessToken: string): Promise<FacebookPageVerificationResult> {
    if (!pageId || !pageAccessToken) {
      throw new FacebookPublisherError("INVALID_INPUT", "pageId and pageAccessToken are required");
    }

    const endpoint = `${this.graphApiBaseUrl}/${encodeURIComponent(pageId)}?fields=id,name,can_post&access_token=${encodeURIComponent(pageAccessToken)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    let response: Response;
    let rawText: string;

    try {
      response = await this.fetcher(endpoint, {
        method: "GET",
        signal: controller.signal,
      });
      rawText = await response.text();
    } catch (error: any) {
      const isTimeout = error?.name === "AbortError";
      const sanitizedMessage = this.sanitize(
        isTimeout ? `Request timed out after ${this.requestTimeoutMs}ms` : error?.message ?? "Network error",
        pageAccessToken,
      );
      throw new FacebookPublisherError(
        isTimeout ? "FACEBOOK_TIMEOUT" : "FACEBOOK_NETWORK_ERROR",
        sanitizedMessage,
        { retryable: true, cause: error },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      this.handleGraphApiError(response.status, rawText, pageAccessToken);
    }

    let parsed: { id?: string; name?: string; can_post?: boolean; tasks?: string[] };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new FacebookPublisherError(
        "INVALID_RESPONSE_FORMAT",
        "Meta Graph API returned non-JSON response",
        { httpStatus: response.status },
      );
    }

    const canPost =
      parsed.can_post === true ||
      (Array.isArray(parsed.tasks) &&
        (parsed.tasks.includes("CREATE_CONTENT") || parsed.tasks.includes("MANAGE")));

    return {
      pageId: parsed.id ?? pageId,
      name: parsed.name ?? "",
      canPost: Boolean(canPost),
    };
  }

  private handleGraphApiError(httpStatus: number, rawText: string, token: string): never {
    let payload: GraphApiErrorPayload | undefined;
    try {
      payload = JSON.parse(rawText);
    } catch {
      // Ignored
    }

    const graphError = payload?.error;
    const rawMessage = graphError?.message ?? `HTTP ${httpStatus} error from Meta Graph API`;
    const message = this.sanitize(rawMessage, token);
    const code = graphError?.code;

    if (code === 190) {
      throw new FacebookPublisherError("FACEBOOK_TOKEN_INVALID", message, { httpStatus, retryable: false });
    }
    if (code === 200 || code === 10) {
      throw new FacebookPublisherError("FACEBOOK_PERMISSION_DENIED", message, { httpStatus, retryable: false });
    }
    if (code === 4 || code === 17 || code === 32 || code === 613) {
      throw new FacebookPublisherError("FACEBOOK_RATE_LIMITED", message, { httpStatus, retryable: true });
    }
    if (code === 368 || code === 506) {
      throw new FacebookPublisherError("FACEBOOK_POLICY_VIOLATION", message, { httpStatus, retryable: false });
    }

    const retryable = httpStatus >= 500;
    throw new FacebookPublisherError("FACEBOOK_PUBLISH_FAILED", message, { httpStatus, retryable });
  }

  private sanitize(text: string, token: string): string {
    if (!token || token.trim().length === 0) return text;
    return text.split(token).join("[REDACTED]");
  }
}
