// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type {
  MarketingArtifact,
  MarketingCampaign,
  MarketingCampaignState,
  PublicationPackage,
  PublicationRecord,
} from "../entities/marketing-campaign";
import {
  assertCanCompleteCampaign,
  assertValidStateTransition,
  canTransitionState,
  isApprovalInvalidatedByChange,
  isTerminalState,
  resolveQualityCorrectionOutcome,
} from "./marketing-campaign-rules";

function createCampaign(state: MarketingCampaignState, version = 1): MarketingCampaign {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    state,
    assignmentMode: "direct_department",
    createdBy: "user-admin",
    idempotencyKey: "test-key-1",
    version,
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
  };
}

function createPackage(overrides?: Partial<PublicationPackage>): PublicationPackage {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    campaignId: "00000000-0000-4000-8000-000000000001",
    packageVersion: 1,
    contentVersionId: "00000000-0000-4000-8000-000000000020",
    visualAssetId: "00000000-0000-4000-8000-000000000030",
    facebookPageConfigurationId: "page-cfg-1",
    scheduledFor: "2026-08-30T10:00:00.000Z",
    contentDigest: "a".repeat(64),
    imageDigest: "b".repeat(64),
    packageDigest: "c".repeat(64),
    status: "approved",
    approvalRequestId: "00000000-0000-4000-8000-000000000040",
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

function createPublicationRecord(): PublicationRecord {
  return {
    id: "00000000-0000-4000-8000-000000000050",
    packageId: "00000000-0000-4000-8000-000000000010",
    platform: "facebook",
    pageId: "1234567890",
    externalPostId: "1234567890_9876543210",
    postUrl: "https://www.facebook.com/1234567890/posts/9876543210",
    packageDigest: "c".repeat(64),
    contentDigest: "a".repeat(64),
    imageDigest: "b".repeat(64),
    verifiedAt: "2026-08-30T10:05:00.000Z",
    providerReceiptDigest: "d".repeat(64),
    createdAt: "2026-08-30T10:05:00.000Z",
  };
}

function createAllArtifacts(campaignId: string): MarketingArtifact[] {
  return [
    {
      id: "00000000-0000-4000-8000-000000000101",
      campaignId,
      kind: "campaign_brief_docx",
      filename: "campaign-brief.docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      byteSize: 1024,
      sha256Digest: "1".repeat(64),
      storageKey: `marketing/${campaignId}/campaign-brief.docx`,
      createdAt: "2026-08-30T10:06:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      campaignId,
      kind: "facebook_content_docx",
      filename: "facebook-content.docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      byteSize: 1024,
      sha256Digest: "2".repeat(64),
      storageKey: `marketing/${campaignId}/facebook-content.docx`,
      createdAt: "2026-08-30T10:06:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000103",
      campaignId,
      kind: "facebook_visual_png",
      filename: "facebook-visual.png",
      mediaType: "image/png",
      byteSize: 2048,
      sha256Digest: "3".repeat(64),
      storageKey: `marketing/${campaignId}/facebook-visual.png`,
      createdAt: "2026-08-30T10:06:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000104",
      campaignId,
      kind: "facebook_publication_log_xlsx",
      filename: "facebook-publication-log.xlsx",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      byteSize: 1024,
      sha256Digest: "4".repeat(64),
      storageKey: `marketing/${campaignId}/facebook-publication-log.xlsx`,
      createdAt: "2026-08-30T10:06:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000105",
      campaignId,
      kind: "marketing_final_report_pdf",
      filename: "marketing-final-report.pdf",
      mediaType: "application/pdf",
      byteSize: 4096,
      sha256Digest: "5".repeat(64),
      storageKey: `marketing/${campaignId}/marketing-final-report.pdf`,
      createdAt: "2026-08-30T10:06:00.000Z",
    },
  ];
}

describe("Marketing Campaign Rules", () => {
  describe("State Transitions", () => {
    it("allows valid happy-path lifecycle transitions", () => {
      const happyPath: MarketingCampaignState[] = [
        "draft",
        "validating",
        "content_drafting",
        "visual_creation",
        "campaign_review",
        "awaiting_human_approval",
        "scheduled",
        "publishing",
        "verifying_publication",
        "reporting",
        "completed",
      ];

      for (let i = 0; i < happyPath.length - 1; i++) {
        const from = happyPath[i];
        const to = happyPath[i + 1];
        expect(canTransitionState(from, to)).toBe(true);
        expect(() => assertValidStateTransition(from, to)).not.toThrow();
      }
    });

    it("allows revision loop back from awaiting_human_approval to revision_requested", () => {
      expect(canTransitionState("awaiting_human_approval", "revision_requested")).toBe(true);
      expect(canTransitionState("revision_requested", "content_drafting")).toBe(true);
      expect(canTransitionState("revision_requested", "visual_creation")).toBe(true);
    });

    it("allows publication_unknown reconciliation loop", () => {
      expect(canTransitionState("publishing", "publication_unknown")).toBe(true);
      expect(canTransitionState("publication_unknown", "verifying_publication")).toBe(true);
      expect(canTransitionState("publication_unknown", "failed")).toBe(true);
    });

    it("allows only publication retry recovery from failed", () => {
      expect(isTerminalState("failed")).toBe(false);
      expect(canTransitionState("failed", "publishing")).toBe(true);
      expect(canTransitionState("failed", "campaign_review")).toBe(false);
      expect(canTransitionState("failed", "awaiting_human_approval")).toBe(false);
    });

    it("prevents transitioning out of terminal states", () => {
      const terminalStates: MarketingCampaignState[] = [
        "completed",
        "canceled",
        "out_of_scope",
        "cross_department_coordination_required",
        "quality_escalated",
      ];

      for (const terminal of terminalStates) {
        expect(isTerminalState(terminal)).toBe(true);
        expect(canTransitionState(terminal, "validating")).toBe(false);
        expect(canTransitionState(terminal, "draft")).toBe(false);
        expect(() => assertValidStateTransition(terminal, "reporting")).toThrow();
      }
    });

    it("allows cancellation from non-terminal states before publication verification", () => {
      expect(canTransitionState("draft", "canceled")).toBe(true);
      expect(canTransitionState("validating", "canceled")).toBe(true);
      expect(canTransitionState("content_drafting", "canceled")).toBe(true);
      expect(canTransitionState("visual_creation", "canceled")).toBe(true);
      expect(canTransitionState("campaign_review", "canceled")).toBe(true);
      expect(canTransitionState("awaiting_human_approval", "canceled")).toBe(true);
      expect(canTransitionState("scheduled", "canceled")).toBe(true);
    });
  });

  describe("Quality Correction Limits", () => {
    it("allows up to 2 correction rounds", () => {
      expect(resolveQualityCorrectionOutcome(0)).toBe("allow_revision");
      expect(resolveQualityCorrectionOutcome(1)).toBe("allow_revision");
    });

    it("escalates to quality_escalated on the 3rd failed round", () => {
      expect(resolveQualityCorrectionOutcome(2)).toBe("quality_escalated");
      expect(resolveQualityCorrectionOutcome(3)).toBe("quality_escalated");
    });
  });

  describe("Approval Invalidation", () => {
    const original = createPackage();

    it("invalidates approval if content changes", () => {
      expect(
        isApprovalInvalidatedByChange(original, {
          contentDigest: "x".repeat(64),
        }),
      ).toBe(true);
    });

    it("invalidates approval if visual asset changes", () => {
      expect(
        isApprovalInvalidatedByChange(original, {
          imageDigest: "x".repeat(64),
        }),
      ).toBe(true);
    });

    it("invalidates approval if facebook page changes", () => {
      expect(
        isApprovalInvalidatedByChange(original, {
          facebookPageConfigurationId: "page-cfg-2",
        }),
      ).toBe(true);
    });

    it("invalidates approval if scheduled time changes", () => {
      expect(
        isApprovalInvalidatedByChange(original, {
          scheduledFor: "2026-08-31T12:00:00.000Z",
        }),
      ).toBe(true);
    });

    it("does not invalidate approval if unchanged", () => {
      expect(
        isApprovalInvalidatedByChange(original, {
          contentDigest: original.contentDigest,
          imageDigest: original.imageDigest,
          facebookPageConfigurationId: original.facebookPageConfigurationId,
          scheduledFor: original.scheduledFor,
        }),
      ).toBe(false);
    });
  });

  describe("Campaign Completion Assertion", () => {
    const campaign = createCampaign("reporting");
    const publication = createPublicationRecord();
    const artifacts = createAllArtifacts(campaign.id);

    it("allows completion when publication is verified and all 5 artifacts exist", () => {
      expect(() =>
        assertCanCompleteCampaign({
          campaign,
          publicationRecord: publication,
          artifacts,
        }),
      ).not.toThrow();
    });

    it("throws if publication record is missing", () => {
      expect(() =>
        assertCanCompleteCampaign({
          campaign,
          publicationRecord: null,
          artifacts,
        }),
      ).toThrow(/publication record is required/i);
    });

    it("throws if any of the 5 required artifacts is missing", () => {
      const missingOne = artifacts.slice(0, 4);
      expect(() =>
        assertCanCompleteCampaign({
          campaign,
          publicationRecord: publication,
          artifacts: missingOne,
        }),
      ).toThrow(/missing required marketing artifacts/i);
    });

    it("throws if campaign state is not reporting", () => {
      const nonReportingCampaign = createCampaign("scheduled");
      expect(() =>
        assertCanCompleteCampaign({
          campaign: nonReportingCampaign,
          publicationRecord: publication,
          artifacts,
        }),
      ).toThrow(/campaign must be in reporting state/i);
    });
  });
});
