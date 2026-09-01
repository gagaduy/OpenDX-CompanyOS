// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type {
  PublicationExecutionMode,
  PublicationFormat,
  PublicationPackage,
  PublicationTarget,
  PublicationTargetStatus,
  SocialPlatform,
} from "../entities/marketing-campaign";

export interface PlatformCapability {
  readonly platform: SocialPlatform;
  readonly format: PublicationFormat;
  readonly enabled: boolean;
  readonly supportedAspectRatios: readonly string[];
  readonly minMediaCount: number;
  readonly maxMediaCount: number;
}

export const PLATFORM_CAPABILITIES: readonly PlatformCapability[] = [
  {
    platform: "facebook",
    format: "feed_image",
    enabled: true,
    supportedAspectRatios: ["1:1"],
    minMediaCount: 1,
    maxMediaCount: 1,
  },
  {
    platform: "facebook",
    format: "story_image",
    enabled: false,
    supportedAspectRatios: ["9:16"],
    minMediaCount: 1,
    maxMediaCount: 1,
  },
  {
    platform: "facebook",
    format: "image_carousel",
    enabled: false,
    supportedAspectRatios: ["1:1"],
    minMediaCount: 2,
    maxMediaCount: 10,
  },
  {
    platform: "facebook",
    format: "feed_video",
    enabled: false,
    supportedAspectRatios: ["1:1", "16:9"],
    minMediaCount: 1,
    maxMediaCount: 1,
  },
  {
    platform: "facebook",
    format: "story_video",
    enabled: false,
    supportedAspectRatios: ["9:16"],
    minMediaCount: 1,
    maxMediaCount: 1,
  },
  {
    platform: "facebook",
    format: "reel_video",
    enabled: false,
    supportedAspectRatios: ["9:16"],
    minMediaCount: 1,
    maxMediaCount: 1,
  },
  {
    platform: "instagram",
    format: "feed_image",
    enabled: true,
    supportedAspectRatios: ["1:1"],
    minMediaCount: 1,
    maxMediaCount: 1,
  },
  {
    platform: "instagram",
    format: "story_image",
    enabled: true,
    supportedAspectRatios: ["9:16"],
    minMediaCount: 1,
    maxMediaCount: 1,
  },
  {
    platform: "instagram",
    format: "image_carousel",
    enabled: true,
    supportedAspectRatios: ["1:1"],
    minMediaCount: 2,
    maxMediaCount: 10,
  },
  {
    platform: "instagram",
    format: "feed_video",
    enabled: false,
    supportedAspectRatios: ["1:1", "16:9"],
    minMediaCount: 1,
    maxMediaCount: 1,
  },
  {
    platform: "instagram",
    format: "story_video",
    enabled: false,
    supportedAspectRatios: ["9:16"],
    minMediaCount: 1,
    maxMediaCount: 1,
  },
  {
    platform: "instagram",
    format: "reel_video",
    enabled: false,
    supportedAspectRatios: ["9:16"],
    minMediaCount: 1,
    maxMediaCount: 1,
  },
];

export function getPlatformCapabilities(): readonly PlatformCapability[] {
  return PLATFORM_CAPABILITIES;
}

export function findPlatformCapability(
  platform: SocialPlatform,
  format: PublicationFormat,
): PlatformCapability | undefined {
  return PLATFORM_CAPABILITIES.find(
    (c) => c.platform === platform && c.format === format,
  );
}

export function assertFormatEnabled(
  platform: SocialPlatform,
  format: PublicationFormat,
): void {
  const capability = findPlatformCapability(platform, format);
  if (!capability || !capability.enabled) {
    const error = new Error(
      `Format '${format}' is not enabled for platform '${platform}'.`,
    );
    Object.assign(error, { code: "FORMAT_NOT_ENABLED" });
    throw error;
  }
}

function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${canonicalJson(val)}`;
  });
  return `{${pairs.join(",")}}`;
}

export function calculatePublicationTargetDigest(target: {
  readonly platform: SocialPlatform;
  readonly format: PublicationFormat;
  readonly accountConfigurationId: string;
  readonly caption: string;
  readonly mediaAssetIds: readonly string[];
  readonly scheduledFor: string;
  readonly executionMode: PublicationExecutionMode;
}): string {
  const normalized = {
    accountConfigurationId: target.accountConfigurationId,
    caption: target.caption,
    executionMode: target.executionMode,
    format: target.format,
    mediaAssetIds: [...target.mediaAssetIds],
    platform: target.platform,
    scheduledFor: target.scheduledFor,
  };
  return createHash("sha256").update(canonicalJson(normalized)).digest("hex");
}

export function calculatePublicationPackageDigest(
  targets: readonly PublicationTarget[],
): string {
  const sortedTargetDigests = targets
    .map((t) => t.targetDigest)
    .sort();
  return createHash("sha256")
    .update(canonicalJson(sortedTargetDigests))
    .digest("hex");
}

export function isApprovalInvalidatedByPackageChange(
  currentPackage: PublicationPackage,
  candidate: PublicationPackage | readonly PublicationTarget[],
): boolean {
  if (currentPackage.status !== "approved" && currentPackage.status !== "submitted_for_approval") {
    return false;
  }
  const candidateDigest = Array.isArray(candidate)
    ? calculatePublicationPackageDigest(candidate)
    : candidate.packageDigest ?? (candidate.targets ? calculatePublicationPackageDigest(candidate.targets) : "");
  return currentPackage.packageDigest !== candidateDigest;
}

export type AggregatePublicationStatus =
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "publishing"
  | "publication_unknown"
  | "verified"
  | "partial_failure"
  | "failed";

export function deriveAggregatePublicationStatus(
  targets: readonly PublicationTarget[],
): AggregatePublicationStatus {
  if (targets.length === 0) {
    return "pending_approval";
  }

  const allStatuses = targets.map((t) => t.status);

  // If any target is still executing, the aggregate is publishing
  if (allStatuses.includes("publishing") || allStatuses.includes("claimed")) {
    return "publishing";
  }

  if (allStatuses.includes("publication_unknown")) {
    return "publication_unknown";
  }

  const verifiedCount = allStatuses.filter((s) => s === "verified").length;
  const failedCount = allStatuses.filter(
    (s) => s === "failed" || s === "platform_rejected",
  ).length;

  if (verifiedCount === targets.length) {
    return "verified";
  }

  const requiredTargets = targets.filter((t) => t.required);
  const requiredFailedCount = requiredTargets.filter(
    (t) => t.status === "failed" || t.status === "platform_rejected",
  ).length;

  if (requiredTargets.length > 0 && requiredFailedCount === requiredTargets.length) {
    return "failed";
  }

  if (failedCount === targets.length) {
    return "failed";
  }

  if (failedCount > 0) {
    return "partial_failure";
  }

  if (allStatuses.every((s) => s === "scheduled")) {
    return "scheduled";
  }

  if (allStatuses.every((s) => s === "approved")) {
    return "approved";
  }

  // If some targets are verified and others are still scheduled/approved
  if (verifiedCount > 0 && allStatuses.some((s) => s === "scheduled" || s === "approved")) {
    return "publishing";
  }

  return "pending_approval";
}
