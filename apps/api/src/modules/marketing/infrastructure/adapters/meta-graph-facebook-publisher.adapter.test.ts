// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { MetaGraphFacebookPublisherAdapter } from "./meta-graph-facebook-publisher.adapter";
import { FacebookPublisherError } from "../../application/ports/facebook-publisher.port";

describe("MetaGraphFacebookPublisherAdapter", () => {
  const fixedNow = "2026-08-29T10:00:00.000Z";
  const fakeToken = "EAAGm0PX4ZCpsBASecretAccessToken123456789";
  const fakePageId = "100200300400500";
  const fakeImageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it("successfully publishes an image post and constructs canonical URL", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "9988776655_1122334455", post_id: "9988776655_1122334455" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const adapter = new MetaGraphFacebookPublisherAdapter({
      fetcher: mockFetcher,
      now: () => fixedNow,
    });

    const result = await adapter.publishImagePost({
      pageId: fakePageId,
      pageAccessToken: fakeToken,
      message: "NovaPhone 15 Launch! #novaphone",
      imageBuffer: fakeImageBuffer,
    });

    expect(result).toMatchObject({
      postId: "9988776655_1122334455",
      postUrl: "https://www.facebook.com/9988776655/posts/1122334455",
      publishedAt: fixedNow,
    });
    expect(result.rawResponseDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(mockFetcher).toHaveBeenCalledWith(
      "https://graph.facebook.com/v20.0/100200300400500/photos",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("handles OAuthException expired token error (code 190) and redacts token", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: `Error validating access token: Session for ${fakeToken} has expired.`,
            type: "OAuthException",
            code: 190,
            error_subcode: 463,
          },
        }),
        { status: 400 },
      ),
    );

    const adapter = new MetaGraphFacebookPublisherAdapter({
      fetcher: mockFetcher,
    });

    let caught: FacebookPublisherError | null = null;
    try {
      await adapter.publishImagePost({
        pageId: fakePageId,
        pageAccessToken: fakeToken,
        message: "Test message",
        imageBuffer: fakeImageBuffer,
      });
    } catch (err: any) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(FacebookPublisherError);
    expect(caught?.code).toBe("FACEBOOK_TOKEN_INVALID");
    expect(caught?.retryable).toBe(false);
    expect(caught?.message).not.toContain(fakeToken);
    expect(caught?.message).toContain("[REDACTED]");
  });

  it("handles rate limit error (code 32 / 613) with retryable flag", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "User request limit reached",
            type: "OAuthException",
            code: 32,
          },
        }),
        { status: 400 },
      ),
    );

    const adapter = new MetaGraphFacebookPublisherAdapter({ fetcher: mockFetcher });

    let caught: FacebookPublisherError | null = null;
    try {
      await adapter.publishImagePost({
        pageId: fakePageId,
        pageAccessToken: fakeToken,
        message: "Test",
        imageBuffer: fakeImageBuffer,
      });
    } catch (err: any) {
      caught = err;
    }

    expect(caught?.code).toBe("FACEBOOK_RATE_LIMITED");
    expect(caught?.retryable).toBe(true);
  });

  it("handles policy violation (code 368)", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "It looks like you were misusing this feature by going too fast.",
            type: "OAuthException",
            code: 368,
          },
        }),
        { status: 400 },
      ),
    );

    const adapter = new MetaGraphFacebookPublisherAdapter({ fetcher: mockFetcher });

    await expect(
      adapter.publishImagePost({
        pageId: fakePageId,
        pageAccessToken: fakeToken,
        message: "Test",
        imageBuffer: fakeImageBuffer,
      }),
    ).rejects.toThrowError(FacebookPublisherError);
  });

  it("handles network error and timeout cleanly", async () => {
    const mockFetcher = vi.fn().mockRejectedValue(new Error(`Failed to connect with token ${fakeToken}`));

    const adapter = new MetaGraphFacebookPublisherAdapter({ fetcher: mockFetcher });

    let caught: FacebookPublisherError | null = null;
    try {
      await adapter.publishImagePost({
        pageId: fakePageId,
        pageAccessToken: fakeToken,
        message: "Test",
        imageBuffer: fakeImageBuffer,
      });
    } catch (err: any) {
      caught = err;
    }

    expect(caught?.code).toBe("FACEBOOK_NETWORK_ERROR");
    expect(caught?.retryable).toBe(true);
    expect(caught?.message).not.toContain(fakeToken);
  });

  it("verifyPageAccess verifies page publish permissions", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: fakePageId,
          name: "NovaCommerce Official",
          tasks: ["CREATE_CONTENT", "MODERATE", "MANAGE"],
          can_post: true,
        }),
        { status: 200 },
      ),
    );

    const adapter = new MetaGraphFacebookPublisherAdapter({ fetcher: mockFetcher });

    const result = await adapter.verifyPageAccess(fakePageId, fakeToken);
    expect(result).toEqual({
      pageId: fakePageId,
      name: "NovaCommerce Official",
      canPost: true,
    });
  });

  it("auto-resolves Page Access Token if initial publish receives permission denied code 200", async () => {
    const userToken = "UserTokenWithManagePages";
    const resolvedPageToken = "PageTokenForPosting";

    // 1st call: POST /photos fails with code 200 (permission denied)
    // 2nd call: GET /pageId?fields=access_token returns resolvedPageToken
    // 3rd call: POST /photos with resolvedPageToken succeeds
    const mockFetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Permission denied", code: 200 } }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: resolvedPageToken, id: fakePageId }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "998877_112233", post_id: "998877_112233" }),
          { status: 200 },
        ),
      );

    const adapter = new MetaGraphFacebookPublisherAdapter({
      fetcher: mockFetcher,
      now: () => fixedNow,
      pageId: fakePageId,
      pageAccessToken: userToken,
    });

    const receipt = await adapter.publish({
      target: {
        id: "target-1",
        platform: "facebook",
        accountConfigurationId: fakePageId,
      } as any,
      caption: "Launch post",
      media: [{ bytes: fakeImageBuffer, mimeType: "image/png", fileName: "post.png" }],
    });

    expect(receipt.externalPublicationId).toBe("998877_112233");
    expect(mockFetcher).toHaveBeenCalledTimes(3);
  });
});
