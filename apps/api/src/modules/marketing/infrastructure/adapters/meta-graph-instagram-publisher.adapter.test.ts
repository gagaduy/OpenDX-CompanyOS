// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { SocialPublishMediaItem } from "../../application/ports/social-publisher.port";
import type { PublicationTarget } from "../../domain/entities/marketing-campaign";
import { MetaGraphInstagramPublisherAdapter } from "./meta-graph-instagram-publisher.adapter";

const ACCESS_TOKEN = "EAAB_SECRET_ACCESS_TOKEN";
const SIGNED_URLS = {
  "asset-1": "https://stable-tunnel.trycloudflare.com/v1/public/marketing/media/asset-1?v=1&digest=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&policy=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&outputDigest=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc&expires=1788318900&signature=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "asset-2": "https://stable-tunnel.trycloudflare.com/v1/public/marketing/media/asset-2?v=1&digest=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&policy=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff&outputDigest=1111111111111111111111111111111111111111111111111111111111111111&expires=1788318900&signature=2222222222222222222222222222222222222222222222222222222222222222",
  "asset-story-1": "https://stable-tunnel.trycloudflare.com/v1/public/marketing/media/asset-story-1?v=1&digest=3333333333333333333333333333333333333333333333333333333333333333&policy=4444444444444444444444444444444444444444444444444444444444444444&outputDigest=5555555555555555555555555555555555555555555555555555555555555555&expires=1788318900&signature=6666666666666666666666666666666666666666666666666666666666666666",
} as const;

function media(id: keyof typeof SIGNED_URLS = "asset-1"): SocialPublishMediaItem {
  return {
    id,
    bytes: Buffer.from(`image:${id}`),
    mimeType: "image/png",
    fileName: `${id}.png`,
  };
}

function formBody(init?: RequestInit): URLSearchParams {
  expect(init?.body).toBeInstanceOf(URLSearchParams);
  return init!.body as URLSearchParams;
}

function buildTarget(format: any = "feed_image"): PublicationTarget {
  return {
    id: "00000000-0000-4000-8000-000000000011",
    packageId: "00000000-0000-4000-8000-000000000010",
    platform: "instagram",
    format,
    accountConfigurationId: "17841400000000000",
    contentVersionId: "00000000-0000-4000-8000-000000000020",
    mediaAssetIds: ["asset-1"],
    caption: "NovaPhone 15 Launch Promo",
    scheduledFor: "2026-09-02T10:00:00.000Z",
    required: true,
    executionMode: "live",
    contentDigest: "a".repeat(64),
    mediaDigest: "b".repeat(64),
    targetDigest: "c".repeat(64),
    status: "approved",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  };
}

describe("MetaGraphInstagramPublisherAdapter", () => {
  const defaultOptions = {
    businessAccountId: "17841400000000000",
    accessToken: ACCESS_TOKEN,
    preparePublicMediaUrl: async (item: SocialPublishMediaItem) => SIGNED_URLS[item.id as keyof typeof SIGNED_URLS],
    pollIntervalMs: 10,
    maxPollAttempts: 5,
    now: () => "2026-09-02T10:05:00.000Z",
  };

  it("successfully publishes feed image via container creation, polling, and media_publish", async () => {
    const submittedMediaBodies: URLSearchParams[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("/17841400000000000/media") && !urlStr.includes("media_publish")) {
        submittedMediaBodies.push(formBody(init));
        return new Response(JSON.stringify({ id: "container-123" }), { status: 200 });
      }
      if (urlStr.includes("/container-123")) {
        return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
      }
      if (urlStr.includes("/17841400000000000/media_publish")) {
        return new Response(JSON.stringify({ id: "ig-post-999" }), { status: 200 });
      }
      if (urlStr.includes("/ig-post-999")) {
        return new Response(JSON.stringify({ id: "ig-post-999", permalink: "https://www.instagram.com/p/ig-post-999" }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });

    const adapter = new MetaGraphInstagramPublisherAdapter({
      ...defaultOptions,
      fetcher: fetchMock as any,
    });

    const receipt = await adapter.publish({
      target: buildTarget("feed_image"),
      caption: "NovaPhone 15 Launch Promo",
      media: [media()],
    });

    expect(receipt).toMatchObject({
      platform: "instagram",
      executionMode: "live",
      simulated: false,
      externalPublicationId: "ig-post-999",
      pageId: "17841400000000000",
      publicationUrl: "https://www.instagram.com/p/ig-post-999",
      verifiedAt: "2026-09-02T10:05:00.000Z",
      displayMessage: "Published to Instagram",
    });
    expect(submittedMediaBodies).toHaveLength(1);
    expect(submittedMediaBodies[0]!.get("image_url")).toBe(SIGNED_URLS["asset-1"]);
    expect(submittedMediaBodies[0]!.get("image_url")).not.toContain(".png");
    expect(submittedMediaBodies[0]!.get("image_url")).not.toContain(ACCESS_TOKEN);
  });

  it("successfully publishes story image", async () => {
    const submittedMediaBodies: URLSearchParams[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("/17841400000000000/media") && !urlStr.includes("media_publish")) {
        submittedMediaBodies.push(formBody(init));
        return new Response(JSON.stringify({ id: "story-container-123" }), { status: 200 });
      }
      if (urlStr.includes("/story-container-123")) {
        return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
      }
      if (urlStr.includes("/17841400000000000/media_publish")) {
        return new Response(JSON.stringify({ id: "ig-story-post-888" }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });

    const adapter = new MetaGraphInstagramPublisherAdapter({
      ...defaultOptions,
      fetcher: fetchMock as any,
    });

    const receipt = await adapter.publish({
      target: buildTarget("story_image"),
      caption: "Story promo",
      media: [media("asset-story-1")],
    });

    expect(receipt.externalPublicationId).toBe("ig-story-post-888");
    expect(receipt.publicationUrl).toBeNull();
    expect(submittedMediaBodies).toHaveLength(1);
    expect(submittedMediaBodies[0]!.get("image_url")).toBe(SIGNED_URLS["asset-story-1"]);
    expect(submittedMediaBodies[0]!.get("image_url")).not.toContain(".png");
    expect(submittedMediaBodies[0]!.get("image_url")).not.toContain(ACCESS_TOKEN);
  });

  it("successfully publishes image carousel with multiple children", async () => {
    const childContainers: string[] = [];
    const childBodies: URLSearchParams[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const body = init?.body ? String(init.body) : "";
      if (urlStr.includes("/17841400000000000/media") && !urlStr.includes("media_publish")) {
        if (body.includes("is_carousel_item=true")) {
          childBodies.push(formBody(init));
          const childId = `child-container-${childContainers.length + 1}`;
          childContainers.push(childId);
          return new Response(JSON.stringify({ id: childId }), { status: 200 });
        }
        if (body.includes("media_type=CAROUSEL")) {
          return new Response(JSON.stringify({ id: "carousel-parent-123" }), { status: 200 });
        }
      }
      if (urlStr.includes("/carousel-parent-123")) {
        return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
      }
      if (urlStr.includes("/17841400000000000/media_publish")) {
        return new Response(JSON.stringify({ id: "ig-carousel-post-777" }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });

    const adapter = new MetaGraphInstagramPublisherAdapter({
      ...defaultOptions,
      fetcher: fetchMock as any,
    });

    const receipt = await adapter.publish({
      target: buildTarget("image_carousel"),
      caption: "Carousel promo",
      media: [
        media("asset-1"),
        media("asset-2"),
      ],
    });

    expect(receipt.externalPublicationId).toBe("ig-carousel-post-777");
    expect(childContainers).toHaveLength(2);
    expect(childBodies.map((body) => body.get("image_url"))).toEqual([
      SIGNED_URLS["asset-1"],
      SIGNED_URLS["asset-2"],
    ]);
    for (const body of childBodies) {
      expect(body.get("image_url")).not.toContain(".png");
      expect(body.get("image_url")).not.toContain(ACCESS_TOKEN);
    }
  });

  it("does not call Meta when preparing the public media URL fails", async () => {
    const preparationError = new Error("Marketing media is unavailable");
    const fetchMock = vi.fn();
    const adapter = new MetaGraphInstagramPublisherAdapter({
      ...defaultOptions,
      preparePublicMediaUrl: async () => {
        throw preparationError;
      },
      fetcher: fetchMock as any,
    });

    await expect(adapter.publish({
      target: buildTarget("feed_image"),
      caption: "Unavailable media",
      media: [media()],
    })).rejects.toBe(preparationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles status polling when container is IN_PROGRESS initially", async () => {
    let pollCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/17841400000000000/media") && !urlStr.includes("media_publish")) {
        return new Response(JSON.stringify({ id: "container-poll" }), { status: 200 });
      }
      if (urlStr.includes("/container-poll")) {
        pollCount++;
        if (pollCount < 3) {
          return new Response(JSON.stringify({ status_code: "IN_PROGRESS" }), { status: 200 });
        }
        return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
      }
      if (urlStr.includes("/17841400000000000/media_publish")) {
        return new Response(JSON.stringify({ id: "ig-post-polled" }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });

    const adapter = new MetaGraphInstagramPublisherAdapter({
      ...defaultOptions,
      fetcher: fetchMock as any,
    });

    const receipt = await adapter.publish({
      target: buildTarget("feed_image"),
      caption: "Polled promo",
      media: [media()],
    });

    expect(receipt.externalPublicationId).toBe("ig-post-polled");
    expect(pollCount).toBe(3);
  });

  it("redacts access token on error", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: `Invalid token EAAB_SECRET_ACCESS_TOKEN provided`,
            code: 190,
          },
        }),
        { status: 400 },
      );
    });

    const adapter = new MetaGraphInstagramPublisherAdapter({
      ...defaultOptions,
      fetcher: fetchMock as any,
    });

    await expect(
      adapter.publish({
        target: buildTarget("feed_image"),
        caption: "Fail promo",
        media: [media()],
      }),
    ).rejects.toThrow("Invalid token [REDACTED] provided");
  });

  it.each(["unavailable", "failed"] as const)(
    "keeps publication URL null when permalink lookup is %s",
    async (permalinkOutcome) => {
      const fetchMock = vi.fn(async (url: string) => {
        const urlStr = String(url);
        if (urlStr.includes("/17841400000000000/media") && !urlStr.includes("media_publish")) {
          return new Response(JSON.stringify({ id: "container-no-permalink" }), { status: 200 });
        }
        if (urlStr.includes("/container-no-permalink")) {
          return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
        }
        if (urlStr.includes("/17841400000000000/media_publish")) {
          return new Response(JSON.stringify({ id: "ig-post-no-permalink" }), { status: 200 });
        }
        if (urlStr.includes("/ig-post-no-permalink")) {
          if (permalinkOutcome === "failed") {
            throw new Error("permalink network failure");
          }
          return new Response("Not Found", { status: 404 });
        }
        return new Response("Not Found", { status: 404 });
      });
      const adapter = new MetaGraphInstagramPublisherAdapter({
        ...defaultOptions,
        fetcher: fetchMock as any,
      });

      const receipt = await adapter.publish({
        target: buildTarget("feed_image"),
        caption: "No permalink",
        media: [media()],
      });

      expect(receipt.publicationUrl).toBeNull();
    },
  );

  it("reconciles published Instagram post", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/ig-post-999")) {
        return new Response(
          JSON.stringify({
            id: "ig-post-999",
            permalink: "https://www.instagram.com/p/ig-post-999",
            media_type: "IMAGE",
          }),
          { status: 200 },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const adapter = new MetaGraphInstagramPublisherAdapter({
      ...defaultOptions,
      fetcher: fetchMock as any,
    });

    const result = await adapter.reconcile({
      target: buildTarget("feed_image"),
      externalPublicationId: "ig-post-999",
    });

    expect(result.exists).toBe(true);
    expect(result.receipt?.externalPublicationId).toBe("ig-post-999");
  });

  it("keeps reconciled publication URL null when Meta omits the permalink", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ id: "ig-post-without-permalink", media_type: "IMAGE" }),
      { status: 200 },
    ));
    const adapter = new MetaGraphInstagramPublisherAdapter({
      ...defaultOptions,
      fetcher: fetchMock as any,
    });

    const result = await adapter.reconcile({
      target: buildTarget("feed_image"),
      externalPublicationId: "ig-post-without-permalink",
    });

    expect(result.receipt?.publicationUrl).toBeNull();
  });
});
