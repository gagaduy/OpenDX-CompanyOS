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
  readonly supportedModes: readonly PublicationExecutionMode[];
  readonly maxMediaCount: number;
  readonly minMediaCount: number;
  readonly allowedAspectRatios: readonly string[];
}

export const PLATFORM_CAPABILITIES: readonly PlatformCapability[] = [
  {
    platform: "facebook",
    format: "feed_image",
    enabled: true,
    supportedModes: ["live", "simulation"],
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedAspectRatios: ["1:1"],
  },
  {
    platform: "instagram",
    format: "feed_image",
    enabled: true,
    supportedModes: ["simulation", "live"],
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedAspectRatios: ["1:1"],
  },
  {
    platform: "instagram",
    format: "story_image",
    enabled: true,
    supportedModes: ["simulation", "live"],
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedAspectRatios: ["9:16"],
  },
  {
    platform: "instagram",
    format: "image_carousel",
    enabled: true,
    supportedModes: ["simulation", "live"],
    minMediaCount: 2,
    maxMediaCount: 10,
    allowedAspectRatios: ["1:1"],
  },
  {
    platform: "facebook",
    format: "feed_video",
    enabled: false,
    supportedModes: [],
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedAspectRatios: ["1:1", "16:9"],
  },
  {
    platform: "instagram",
    format: "feed_video",
    enabled: false,
    supportedModes: [],
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedAspectRatios: ["1:1", "4:5"],
  },
  {
    platform: "instagram",
    format: "story_video",
    enabled: false,
    supportedModes: [],
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedAspectRatios: ["9:16"],
  },
  {
    platform: "instagram",
    format: "reel_video",
    enabled: false,
    supportedModes: [],
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedAspectRatios: ["9:16"],
  },
] as const;

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
  targets: readonly (PublicationTarget | { readonly targetDigest: string })[],
): string {
  const targetDigests = targets.map((t) => t.targetDigest);
  return createHash("sha256")
    .update(canonicalJson(targetDigests))
    .digest("hex");
}

export function isApprovalInvalidatedByPackageChange(
  approved: PublicationPackage | { readonly packageDigest: string },
  revised: PublicationPackage | { readonly packageDigest: string },
): boolean {
  return approved.packageDigest !== revised.packageDigest;
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

  const requiredTargets = targets.filter((t) => t.required);
  const evaluatedTargets = requiredTargets.length > 0 ? requiredTargets : targets;

  const statuses = evaluatedTargets.map((t) => t.status);

  if (statuses.includes("publishing") || statuses.includes("claimed")) {
    return "publishing";
  }

  if (statuses.includes("publication_unknown")) {
    return "publication_unknown";
  }

  const verifiedCount = statuses.filter((s) => s === "verified").length;
  const failedCount = statuses.filter(
    (s) => s === "failed" || s === "platform_rejected",
  ).length;

  if (verifiedCount === evaluatedTargets.length) {
    return "verified";
  }

  if (failedCount === evaluatedTargets.length) {
    return "failed";
  }

  if (verifiedCount > 0 && failedCount > 0) {
    return "partial_failure";
  }

  if (statuses.every((s) => s === "scheduled")) {
    return "scheduled";
  }

  if (statuses.every((s) => s === "approved")) {
    return "approved";
  }

  if (statuses.some((s) => s === "failed" || s === "platform_rejected")) {
    return "partial_failure";
  }

  return "pending_approval";
}
