// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertIntegrationEnvironment } from "../../../../../shared/testing/assert-integration-environment";
import { runMarketingMigrations } from "../../database/run-marketing-migrations";
import { PostgresqlMarketingRepository } from "./postgresql-marketing.repository";
import type {
  CampaignBrief,
  ContentVersion,
  MarketingArtifact,
  MarketingCampaign,
  PublicationAttempt,
  PublicationPackage,
  PublicationRecord,
  PublicationTarget,
  VisualAsset,
} from "../../../domain/entities/marketing-campaign";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("PostgreSQL Marketing Repository Integration", () => {
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new PostgresqlMarketingRepository(pool);

  beforeAll(async () => {
    await runMarketingMigrations(databaseUrl!, "up");
  });

  afterAll(async () => {
    await runMarketingMigrations(databaseUrl!, "down", 999_999).catch(() => undefined);
    await pool.end();
  });

  it("handles full marketing campaign persistence lifecycle with multi-targets and concurrent claims", async () => {
    const campaignId = randomUUID();
    const briefId = randomUUID();
    const idempotencyKey = `idemp-${randomUUID()}`;

    const campaign: MarketingCampaign = {
      id: campaignId,
      state: "draft",
      assignmentMode: "direct_department",
      createdBy: "staff-1",
      idempotencyKey,
      sourceTaskId: null,
      version: 1,
      createdAt: "2026-08-29T10:00:00.000Z",
      updatedAt: "2026-08-29T10:00:00.000Z",
    };

    const brief: CampaignBrief = {
      id: briefId,
      campaignId,
      campaignName: "Black Friday Promo",
      objective: "Drive Q4 Sales",
      subjectKind: "catalog_product",
      subjectReference: "prod-100",
      audience: "Tech Enthusiasts",
      language: "vi",
      tone: "Exciting",
      mandatoryMessage: "50% off all devices",
      prohibitedClaims: ["100% cure", "Free forever"],
      callToAction: "Order Now",
      facebookPageConfigurationId: "fb-page-main",
      scheduledFor: "2026-08-30T14:00:00.000Z",
      deadline: "2026-08-30T22:00:00.000Z",
      approverId: "approver-staff",
      maximumCostMicros: 1000000,
      provenance: [
        {
          sourceType: "catalog_snapshot",
          sourceId: "prod-100",
          sourceDigest: "a".repeat(64),
          classification: "internal",
        },
      ],
      version: 1,
      createdAt: "2026-08-29T10:00:00.000Z",
    };

    // 1. Create Campaign and Brief
    const createdCampaign = await repository.createCampaign(campaign, brief);
    expect(createdCampaign.id).toBe(campaignId);
    expect(createdCampaign.state).toBe("draft");

    // 2. Create Content & Visual Asset
    const contentId = randomUUID();
    const content: ContentVersion = {
      id: contentId,
      campaignId,
      versionNumber: 1,
      hook: "Exclusive Phone Deal",
      body: "Get the best deal today",
      callToAction: "Buy Now",
      hashtags: ["#tech", "#sale"],
      visualDirection: "Square render",
      factualClaimSourceIds: [],
      contentDigest: "1".repeat(64),
      modelRunId: null,
      costMicros: 1500,
      createdAt: "2026-08-29T10:01:00.000Z",
    };
    await repository.createContentVersion(content);

    const assetId = randomUUID();
    const asset: VisualAsset = {
      id: assetId,
      campaignId,
      versionNumber: 1,
      mediaType: "image/png",
      aspectRatio: "1:1",
      width: 1024,
      height: 1024,
      byteSize: 204800,
      imageDigest: "2".repeat(64),
      altText: "Promo visual",
      storageKey: `marketing/${campaignId}/visual-1.png`,
      modelRunId: null,
      costMicros: 2000,
      createdAt: "2026-08-29T10:02:00.000Z",
    };
    await repository.createVisualAsset(asset);

    // 3. Create Package with Targets
    const packageId = randomUUID();
    const fbTargetId = randomUUID();
    const igTargetId = randomUUID();

    const fbTarget: PublicationTarget = {
      id: fbTargetId,
      packageId,
      platform: "facebook",
      format: "feed_image",
      accountConfigurationId: "fb-cfg-1",
      contentVersionId: contentId,
      mediaAssetIds: [assetId],
      caption: "Facebook caption",
      scheduledFor: "2026-08-30T14:00:00.000Z",
      required: true,
      executionMode: "live",
      contentDigest: "1".repeat(64),
      mediaDigest: "2".repeat(64),
      targetDigest: "3".repeat(64),
      status: "pending_approval",
      createdAt: "2026-08-29T10:03:00.000Z",
      updatedAt: "2026-08-29T10:03:00.000Z",
    };

    const igTarget: PublicationTarget = {
      id: igTargetId,
      packageId,
      platform: "instagram",
      format: "story_image",
      accountConfigurationId: "ig-cfg-1",
      contentVersionId: contentId,
      mediaAssetIds: [assetId],
      caption: "Instagram caption",
      scheduledFor: "2026-08-30T14:00:00.000Z",
      required: true,
      executionMode: "simulation",
      contentDigest: "1".repeat(64),
      mediaDigest: "2".repeat(64),
      targetDigest: "4".repeat(64),
      status: "pending_approval",
      createdAt: "2026-08-29T10:03:00.000Z",
      updatedAt: "2026-08-29T10:03:00.000Z",
    };

    const pkg: PublicationPackage = {
      id: packageId,
      campaignId,
      packageVersion: 1,
      contentVersionId: contentId,
      visualAssetId: assetId,
      facebookPageConfigurationId: "fb-page-main",
      scheduledFor: "2026-08-30T14:00:00.000Z",
      contentDigest: "1".repeat(64),
      imageDigest: "2".repeat(64),
      packageDigest: "5".repeat(64),
      status: "submitted_for_approval",
      approvalRequestId: "req-1",
      targets: [fbTarget, igTarget],
      createdAt: "2026-08-29T10:03:00.000Z",
      updatedAt: "2026-08-29T10:03:00.000Z",
    };

    const createdPkg = await repository.createPublicationPackage(pkg);
    expect(createdPkg.targets).toHaveLength(2);

    const foundTargets = await repository.findPublicationTargetsByPackageId(packageId);
    expect(foundTargets).toHaveLength(2);

    // 4. Update Package Status to approved
    const approvedPkg = await repository.updatePublicationPackageStatus(packageId, "approved", "req-1");
    expect(approvedPkg.status).toBe("approved");

    const targetsAfterApproval = await repository.findPublicationTargetsByPackageId(packageId);
    expect(targetsAfterApproval.every((t) => t.status === "scheduled")).toBe(true);

    // 5. Concurrent claims test (Worker 1 vs Worker 2)
    const now = "2026-08-30T14:05:00.000Z";
    const [claims1, claims2] = await Promise.all([
      repository.claimDuePublicationTargets({ workerId: "worker-1", now, leaseSeconds: 30, limit: 10 }),
      repository.claimDuePublicationTargets({ workerId: "worker-2", now, leaseSeconds: 30, limit: 10 }),
    ]);

    const claimedIds = [...claims1, ...claims2].map((c) => c.id);
    expect(claimedIds).toContain(fbTargetId);
    expect(claimedIds).toContain(igTargetId);
    // No target claimed twice
    expect(claims1.some((c) => claims2.some((c2) => c2.id === c.id))).toBe(false);

    // 6. Attempts & Records for targets
    const attempt: PublicationAttempt = {
      id: randomUUID(),
      packageId,
      targetId: igTargetId,
      attemptKey: `attempt-${randomUUID()}`,
      platform: "instagram",
      pageConfigurationId: "ig-cfg-1",
      executionMode: "simulation",
      simulated: true,
      status: "succeeded",
      startedAt: now,
      finishedAt: now,
    };
    await repository.createPublicationAttempt(attempt);

    const targetAttempts = await repository.findPublicationAttemptsByTargetId(igTargetId);
    expect(targetAttempts).toHaveLength(1);
    expect(targetAttempts[0]?.simulated).toBe(true);

    const uniquePostId = `ig-post-${randomUUID()}`;
    const record: PublicationRecord = {
      id: randomUUID(),
      packageId,
      targetId: igTargetId,
      platform: "instagram",
      pageId: "ig-acc-1",
      externalPostId: uniquePostId,
      postUrl: null,
      executionMode: "simulation",
      simulated: true,
      displayMessage: "Local simulation - not published to Instagram",
      packageDigest: "5".repeat(64),
      contentDigest: "1".repeat(64),
      imageDigest: "2".repeat(64),
      targetDigest: "4".repeat(64),
      verifiedAt: now,
      providerReceiptDigest: "6".repeat(64),
      createdAt: now,
    };
    await repository.createPublicationRecord(record);

    const targetRecord = await repository.findPublicationRecordByTargetId(igTargetId);
    expect(targetRecord).not.toBeNull();
    expect(targetRecord?.simulated).toBe(true);
    expect(targetRecord?.displayMessage).toBe("Local simulation - not published to Instagram");

    // 7. Release lease
    await repository.releasePublicationTargetLease(igTargetId, "worker-1");
    const targetAfterRelease = await repository.findPublicationTargetById(igTargetId);
    expect(targetAfterRelease?.leaseOwner).toBeNull();
  });
});
