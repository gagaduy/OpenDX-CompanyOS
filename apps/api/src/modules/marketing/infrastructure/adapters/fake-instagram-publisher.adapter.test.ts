// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { PublicationTarget } from "../../domain/entities/marketing-campaign";
import { FakeInstagramPublisherAdapter } from "./fake-instagram-publisher.adapter";

function buildTarget(format: any = "feed_image"): PublicationTarget {
  return {
    id: "00000000-0000-4000-8000-000000000011",
    packageId: "00000000-0000-4000-8000-000000000010",
    platform: "instagram",
    format,
    accountConfigurationId: "ig-cfg-1",
    contentVersionId: "00000000-0000-4000-8000-000000000020",
    mediaAssetIds: ["asset-1"],
    caption: "Caption",
    scheduledFor: "2026-09-02T10:00:00.000Z",
    required: true,
    executionMode: "simulation",
    contentDigest: "a".repeat(64),
    mediaDigest: "b".repeat(64),
    targetDigest: "c".repeat(64),
    status: "approved",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  };
}

describe("FakeInstagramPublisherAdapter", () => {
  it("publishes simulated target without network activity", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fake = new FakeInstagramPublisherAdapter(() => "2026-09-02T10:05:00.000Z");

    const receipt = await fake.publish({
      target: buildTarget("story_image"),
      caption: "Caption",
      media: [{ id: "asset-1", bytes: Buffer.from("image"), mimeType: "image/png", fileName: "image.png" }],
    });

    expect(receipt).toMatchObject({
      platform: "instagram",
      executionMode: "simulation",
      simulated: true,
      displayMessage: "Local simulation - not published to Instagram",
      verifiedAt: "2026-09-02T10:05:00.000Z",
    });
    expect(receipt.externalPublicationId.startsWith("sim-ig-")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects disabled video format with FORMAT_NOT_ENABLED", async () => {
    const fake = new FakeInstagramPublisherAdapter();
    await expect(
      fake.publish({
        target: buildTarget("reel_video"),
        caption: "Caption",
        media: [],
      }),
    ).rejects.toMatchObject({ code: "FORMAT_NOT_ENABLED" });
  });

  it("reconciles simulated target truthfully", async () => {
    const fake = new FakeInstagramPublisherAdapter(() => "2026-09-02T10:05:00.000Z");
    const result = await fake.reconcile({
      target: buildTarget("feed_image"),
    });

    expect(result.exists).toBe(true);
    expect(result.receipt?.simulated).toBe(true);
    expect(result.receipt?.displayMessage).toBe("Local simulation - not published to Instagram");
  });
});
