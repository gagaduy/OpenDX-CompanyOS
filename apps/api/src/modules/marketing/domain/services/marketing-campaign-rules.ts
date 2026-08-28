// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  type MarketingArtifact,
  type MarketingCampaign,
  type MarketingCampaignState,
  type PublicationPackage,
  type PublicationRecord,
  REQUIRED_MARKETING_ARTIFACT_KINDS,
} from "../entities/marketing-campaign";

const TERMINAL_STATES: ReadonlySet<MarketingCampaignState> = new Set<MarketingCampaignState>([
  "completed",
  "canceled",
  "out_of_scope",
  "cross_department_coordination_required",
  "quality_escalated",
]);

const VALID_TRANSITIONS: ReadonlyMap<MarketingCampaignState, ReadonlySet<MarketingCampaignState>> =
  new Map<MarketingCampaignState, ReadonlySet<MarketingCampaignState>>([
    [
      "draft",
      new Set<MarketingCampaignState>([
        "validating",
        "waiting_for_input",
        "out_of_scope",
        "cross_department_coordination_required",
        "canceled",
      ]),
    ],
    [
      "validating",
      new Set<MarketingCampaignState>([
        "content_drafting",
        "waiting_for_input",
        "out_of_scope",
        "cross_department_coordination_required",
        "failed",
        "canceled",
      ]),
    ],
    [
      "waiting_for_input",
      new Set<MarketingCampaignState>([
        "validating",
        "content_drafting",
        "failed",
        "canceled",
      ]),
    ],
    [
      "content_drafting",
      new Set<MarketingCampaignState>([
        "visual_creation",
        "quality_escalated",
        "failed",
        "canceled",
      ]),
    ],
    [
      "visual_creation",
      new Set<MarketingCampaignState>([
        "campaign_review",
        "quality_escalated",
        "failed",
        "canceled",
      ]),
    ],
    [
      "campaign_review",
      new Set<MarketingCampaignState>([
        "awaiting_human_approval",
        "revision_requested",
        "quality_escalated",
        "failed",
        "canceled",
      ]),
    ],
    [
      "awaiting_human_approval",
      new Set<MarketingCampaignState>([
        "scheduled",
        "publishing",
        "revision_requested",
        "failed",
        "canceled",
      ]),
    ],
    [
      "revision_requested",
      new Set<MarketingCampaignState>([
        "content_drafting",
        "visual_creation",
        "quality_escalated",
        "failed",
        "canceled",
      ]),
    ],
    [
      "scheduled",
      new Set<MarketingCampaignState>([
        "publishing",
        "schedule_missed",
        "blocked_credentials",
        "failed",
        "canceled",
      ]),
    ],
    [
      "publishing",
      new Set<MarketingCampaignState>([
        "verifying_publication",
        "publication_unknown",
        "platform_rejected",
        "blocked_credentials",
        "failed",
      ]),
    ],
    [
      "publication_unknown",
      new Set<MarketingCampaignState>([
        "verifying_publication",
        "failed",
      ]),
    ],
    [
      "verifying_publication",
      new Set<MarketingCampaignState>([
        "reporting",
        "platform_rejected",
        "failed",
      ]),
    ],
    [
      "reporting",
      new Set<MarketingCampaignState>([
        "completed",
        "failed",
      ]),
    ],
    ["schedule_missed", new Set<MarketingCampaignState>(["scheduled", "failed", "canceled"])],
    ["blocked_credentials", new Set<MarketingCampaignState>(["scheduled", "publishing", "failed", "canceled"])],
    ["platform_rejected", new Set<MarketingCampaignState>(["failed", "canceled"])],
    ["quality_escalated", new Set<MarketingCampaignState>()],
    ["out_of_scope", new Set<MarketingCampaignState>()],
    ["cross_department_coordination_required", new Set<MarketingCampaignState>()],
    ["completed", new Set<MarketingCampaignState>()],
    ["failed", new Set<MarketingCampaignState>(["publishing"])],
    ["canceled", new Set<MarketingCampaignState>()],
  ]);

export function isTerminalState(state: MarketingCampaignState): boolean {
  return TERMINAL_STATES.has(state);
}

export function canTransitionState(
  from: MarketingCampaignState,
  to: MarketingCampaignState,
): boolean {
  if (isTerminalState(from)) {
    return false;
  }
  const allowed = VALID_TRANSITIONS.get(from);
  return allowed?.has(to) ?? false;
}

export function assertValidStateTransition(
  from: MarketingCampaignState,
  to: MarketingCampaignState,
): void {
  if (!canTransitionState(from, to)) {
    throw new Error(
      `Invalid marketing campaign transition from '${from}' to '${to}'.`,
    );
  }
}

export function resolveQualityCorrectionOutcome(
  revisionCount: number,
): "allow_revision" | "quality_escalated" {
  if (revisionCount >= 2) {
    return "quality_escalated";
  }
  return "allow_revision";
}

export function isApprovalInvalidatedByChange(
  pkg: PublicationPackage,
  changes: {
    contentDigest?: string;
    imageDigest?: string;
    facebookPageConfigurationId?: string;
    scheduledFor?: string;
  },
): boolean {
  if (changes.contentDigest && changes.contentDigest !== pkg.contentDigest) {
    return true;
  }
  if (changes.imageDigest && changes.imageDigest !== pkg.imageDigest) {
    return true;
  }
  if (
    changes.facebookPageConfigurationId &&
    changes.facebookPageConfigurationId !== pkg.facebookPageConfigurationId
  ) {
    return true;
  }
  if (changes.scheduledFor && changes.scheduledFor !== pkg.scheduledFor) {
    return true;
  }
  return false;
}

export function assertCanCompleteCampaign(params: {
  campaign: MarketingCampaign;
  publicationRecord: PublicationRecord | null;
  artifacts: readonly MarketingArtifact[];
}): void {
  const { campaign, publicationRecord, artifacts } = params;

  if (campaign.state !== "reporting") {
    throw new Error(
      `Campaign must be in reporting state before completion, current state is '${campaign.state}'.`,
    );
  }

  if (!publicationRecord) {
    throw new Error("Verified publication record is required for completion.");
  }

  const existingKinds = new Set(artifacts.map((a) => a.kind));
  const missingKinds = REQUIRED_MARKETING_ARTIFACT_KINDS.filter(
    (kind) => !existingKinds.has(kind),
  );

  if (missingKinds.length > 0) {
    throw new Error(
      `Missing required marketing artifacts for completion: ${missingKinds.join(", ")}.`,
    );
  }
}

export function validatePng1x1Square(buffer: Buffer): { valid: boolean; error?: string } {
  if (buffer.length < 8) {
    return { valid: false, error: "Buffer is too small to be a valid PNG" };
  }
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  if (!isPng) {
    return { valid: false, error: "Buffer header does not match PNG signature" };
  }
  return { valid: true };
}
