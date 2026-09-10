// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type {
  PublicationFormat,
  PublicationPackage,
  PublicationTarget,
  SocialPlatform,
} from "../entities/marketing-campaign";
import {
  assertFormatEnabled,
  calculatePublicationPackageDigest,
  calculatePublicationTargetDigest,
  deriveAggregatePublicationStatus,
  getPlatformCapabilities,
  isApprovalInvalidatedByPackageChange,
} from "./marketing-publication-policy";

function buildTarget(overrides?: Partial<PublicationTarget>): PublicationTarget {
  const base = {
    id: "00000000-0000-4000-8000-000000000011",
    packageId: "00000000-0000-4000-8000-000000000010",
    platform: "instagram" as SocialPlatform,
    format: "image_carousel" as PublicationFormat,
    accountConfigurationId: "ig-cfg-1",
    contentVersionId: "00000000-0000-4000-8000-000000000020",
    mediaAssetIds: ["asset-a", "asset-b"],
    caption: "Caption test",
    scheduledFor: "2026-09-02T10:00:00.000Z",
    required: true,
    executionMode: "simulation" as const,
    contentDigest: "a".repeat(64),
    mediaDigest: "b".repeat(64),
    targetDigest: "",
    status: "approved" as const,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
  return {
    ...base,
    targetDigest: base.targetDigest || calculatePublicationTargetDigest(base),
  };
}

function buildPackage(targets: readonly PublicationTarget[], overrides?: Partial<PublicationPackage>): PublicationPackage {
  const packageDigest = calculatePublicationPackageDigest(targets);
  return {
    id: "00000000-0000-4000-8000-000000000010",
    campaignId: "00000000-0000-4000-8000-000000000001",
    packageVersion: 1,
    contentVersionId: "00000000-0000-4000-8000-000000000020",
    visualAssetId: "00000000-0000-4000-8000-000000000030",
    facebookPageConfigurationId: "fb-cfg-1",
    scheduledFor: "2026-09-02T10:00:00.000Z",
    contentDigest: "a".repeat(64),
    imageDigest: "b".repeat(64),
    packageDigest,
    status: "approved",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("Marketing Publication Policy & Target Digests", () => {
  it("binds account, format, schedule, execution mode, caption, and media order in target digest", () => {
    const first = buildTarget({ mediaAssetIds: ["asset-a", "asset-b"] });
    const reordered = buildTarget({ mediaAssetIds: ["asset-b", "asset-a"] });
    expect(calculatePublicationTargetDigest(first)).not.toBe(
      calculatePublicationTargetDigest(reordered),
    );

    const differentCaption = buildTarget({ caption: "Different caption" });
    expect(calculatePublicationTargetDigest(first)).not.toBe(
      calculatePublicationTargetDigest(differentCaption),
    );

    const differentMode = buildTarget({ executionMode: "live" });
    expect(calculatePublicationTargetDigest(first)).not.toBe(
      calculatePublicationTargetDigest(differentMode),
    );
  });

  it.each(["feed_video", "story_video", "reel_video"] as const)(
    "rejects disabled format %s",
    (format) => {
      expect(() => assertFormatEnabled("instagram", format)).toThrowError(
        expect.objectContaining({ code: "FORMAT_NOT_ENABLED" }),
      );
    },
  );

  it.each(["feed_image", "story_image", "image_carousel"] as const)(
    "allows enabled format %s for instagram",
    (format) => {
      expect(() => assertFormatEnabled("instagram", format)).not.toThrow();
    },
  );

  it("exposes platform capabilities correctly", () => {
    const capabilities = getPlatformCapabilities();
    expect(capabilities.some((c) => c.platform === "instagram" && c.format === "feed_image" && c.enabled)).toBe(true);
    expect(capabilities.some((c) => c.platform === "instagram" && c.format === "story_image" && c.enabled)).toBe(true);
    expect(capabilities.some((c) => c.platform === "instagram" && c.format === "image_carousel" && c.enabled)).toBe(true);
    expect(capabilities.some((c) => c.format === "feed_video" && !c.enabled)).toBe(true);
  });

  it("invalidates approval when any target changes", () => {
    const targetA = buildTarget({ caption: "A" });
    const targetB = buildTarget({ caption: "B" });
    const approved = buildPackage([targetA]);
    const revised = buildPackage([targetB]);
    expect(isApprovalInvalidatedByPackageChange(approved, revised)).toBe(true);
  });

  it("does not invalidate approval when package digests match", () => {
    const targetA = buildTarget({ caption: "A" });
    const approved = buildPackage([targetA]);
    const unchanged = buildPackage([targetA]);
    expect(isApprovalInvalidatedByPackageChange(approved, unchanged)).toBe(false);
  });

  describe("Aggregate Status Derivation", () => {
    it("derives completed/reporting when all required targets are verified", () => {
      const fbTarget = buildTarget({ platform: "facebook", format: "feed_image", status: "verified", required: true });
      const igTarget = buildTarget({ platform: "instagram", format: "story_image", status: "verified", required: true });
      expect(deriveAggregatePublicationStatus([fbTarget, igTarget])).toBe("verified");
    });

    it("derives partial_failure when one target succeeds and another fails", () => {
      const fbTarget = buildTarget({ platform: "facebook", format: "feed_image", status: "verified", required: true });
      const igTarget = buildTarget({ platform: "instagram", format: "story_image", status: "failed", required: true });
      expect(deriveAggregatePublicationStatus([fbTarget, igTarget])).toBe("partial_failure");
    });

    it("derives failed when all required targets fail", () => {
      const fbTarget = buildTarget({ platform: "facebook", format: "feed_image", status: "failed", required: true });
      const igTarget = buildTarget({ platform: "instagram", format: "story_image", status: "failed", required: true });
      expect(deriveAggregatePublicationStatus([fbTarget, igTarget])).toBe("failed");
    });

    it("derives publishing when at least one target is publishing or claimed", () => {
      const fbTarget = buildTarget({ platform: "facebook", format: "feed_image", status: "verified", required: true });
      const igTarget = buildTarget({ platform: "instagram", format: "story_image", status: "publishing", required: true });
      expect(deriveAggregatePublicationStatus([fbTarget, igTarget])).toBe("publishing");
    });

    it("derives publication_unknown when a target is unknown", () => {
      const fbTarget = buildTarget({ platform: "facebook", format: "feed_image", status: "verified", required: true });
      const igTarget = buildTarget({ platform: "instagram", format: "story_image", status: "publication_unknown", required: true });
      expect(deriveAggregatePublicationStatus([fbTarget, igTarget])).toBe("publication_unknown");
    });
  });
});
