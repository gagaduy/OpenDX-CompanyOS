// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { PublicationTarget } from "../../domain/entities/marketing-campaign";
import { MetaGraphInstagramPublisherAdapter } from "./meta-graph-instagram-publisher.adapter";

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
    accessToken: "EAAB_SECRET_ACCESS_TOKEN",
    publicMediaBaseUrl: "https://cdn.novacommerce.vn/media",
    pollIntervalMs: 10,
    maxPollAttempts: 5,
    now: () => "2026-09-02T10:05:00.000Z",
  };

  it("successfully publishes feed image via container creation, polling, and media_publish", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("/17841400000000000/media") && !urlStr.includes("media_publish")) {
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
      media: [{ id: "asset-1", bytes: Buffer.from("image"), mimeType: "image/png", fileName: "asset_1.png" }],
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
  });

  it("successfully publishes story image", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("/17841400000000000/media") && !urlStr.includes("media_publish")) {
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
      media: [{ id: "asset-story-1", bytes: Buffer.from("image"), mimeType: "image/png", fileName: "asset_story.png" }],
    });

    expect(receipt.externalPublicationId).toBe("ig-story-post-888");
  });

  it("successfully publishes image carousel with multiple children", async () => {
    const childContainers: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const body = init?.body ? String(init.body) : "";
      if (urlStr.includes("/17841400000000000/media") && !urlStr.includes("media_publish")) {
        if (body.includes("is_carousel_item=true")) {
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
        { id: "asset-1", bytes: Buffer.from("image1"), mimeType: "image/png", fileName: "asset_1.png" },
        { id: "asset-2", bytes: Buffer.from("image2"), mimeType: "image/png", fileName: "asset_2.png" },
      ],
    });

    expect(receipt.externalPublicationId).toBe("ig-carousel-post-777");
    expect(childContainers).toHaveLength(2);
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
      media: [{ id: "asset-1", bytes: Buffer.from("image"), mimeType: "image/png", fileName: "asset_1.png" }],
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
        media: [{ id: "asset-1", bytes: Buffer.from("image"), mimeType: "image/png", fileName: "asset_1.png" }],
      }),
    ).rejects.toThrow("Invalid token [REDACTED] provided");
  });

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
});
