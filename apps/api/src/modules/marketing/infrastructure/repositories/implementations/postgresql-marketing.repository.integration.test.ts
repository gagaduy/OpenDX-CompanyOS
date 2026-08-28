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

  it("handles full marketing campaign persistence lifecycle", async () => {
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

    // 2. Lookups
    const foundById = await repository.findCampaignById(campaignId);
    expect(foundById).toEqual(createdCampaign);

    const foundByKey = await repository.findCampaignByIdempotencyKey("staff-1", idempotencyKey);
    expect(foundByKey).toEqual(createdCampaign);

    const foundBrief = await repository.findBriefByCampaignId(campaignId);
    expect(foundBrief).toEqual(brief);

    const list = await repository.listCampaigns({ limit: 10, offset: 0 });
    expect(list.some((c) => c.id === campaignId)).toBe(true);

    // 3. Update Campaign State with optimistic concurrency
    const updatedCampaign = await repository.updateCampaignState(campaignId, 1, "validating");
    expect(updatedCampaign.state).toBe("validating");
    expect(updatedCampaign.version).toBe(2);

    // Version mismatch should fail
    await expect(
      repository.updateCampaignState(campaignId, 1, "content_drafting"),
    ).rejects.toThrow(/optimistic concurrency failure/i);

    // 4. Content Versions
    const content1: ContentVersion = {
      id: randomUUID(),
      campaignId,
      versionNumber: 1,
      hook: "Super Deal",
      body: "Check out our best gadgets today.",
      callToAction: "Click here",
      hashtags: ["#tech", "#promo"],
      visualDirection: "Modern futuristic dark theme",
      factualClaimSourceIds: ["prod-100"],
      contentDigest: "b".repeat(64),
      modelRunId: "run-101",
      costMicros: 5000,
      createdAt: "2026-08-29T10:05:00.000Z",
    };
    const createdContent = await repository.createContentVersion(content1);
    expect(createdContent.id).toBe(content1.id);

    const contentList = await repository.findContentVersionsByCampaignId(campaignId);
    expect(contentList).toHaveLength(1);
    expect(contentList[0]).toEqual(content1);

    const foundContent = await repository.findContentVersionById(content1.id);
    expect(foundContent).toEqual(content1);

    // 5. Visual Assets
    const visual1: VisualAsset = {
      id: randomUUID(),
      campaignId,
      versionNumber: 1,
      mediaType: "image/png",
      aspectRatio: "1:1",
      width: 1024,
      height: 1024,
      byteSize: 150000,
      imageDigest: "c".repeat(64),
      altText: "Futuristic phone on dark stand",
      storageKey: `marketing/${campaignId}/visual-1.png`,
      modelRunId: "run-img-101",
      costMicros: 40000,
      createdAt: "2026-08-29T10:10:00.000Z",
    };
    const createdVisual = await repository.createVisualAsset(visual1);
    expect(createdVisual.id).toBe(visual1.id);

    const visualList = await repository.findVisualAssetsByCampaignId(campaignId);
    expect(visualList).toHaveLength(1);
    expect(visualList[0]).toEqual(visual1);

    const foundVisual = await repository.findVisualAssetById(visual1.id);
    expect(foundVisual).toEqual(visual1);

    // 6. Publication Packages
    const package1: PublicationPackage = {
      id: randomUUID(),
      campaignId,
      packageVersion: 1,
      contentVersionId: content1.id,
      visualAssetId: visual1.id,
      facebookPageConfigurationId: "fb-page-main",
      scheduledFor: "2026-08-30T14:00:00.000Z",
      contentDigest: content1.contentDigest,
      imageDigest: visual1.imageDigest,
      packageDigest: "d".repeat(64),
      status: "draft",
      approvalRequestId: null,
      createdAt: "2026-08-29T10:15:00.000Z",
      updatedAt: "2026-08-29T10:15:00.000Z",
    };
    const createdPackage = await repository.createPublicationPackage(package1);
    expect(createdPackage.id).toBe(package1.id);

    const packageList = await repository.findPublicationPackagesByCampaignId(campaignId);
    expect(packageList).toHaveLength(1);

    const currentPkg = await repository.findCurrentPackageByCampaignId(campaignId);
    expect(currentPkg?.id).toBe(package1.id);

    const updatedPkg = await repository.updatePublicationPackageStatus(
      package1.id,
      "submitted_for_approval",
      "req-app-1",
    );
    expect(updatedPkg.status).toBe("submitted_for_approval");
    expect(updatedPkg.approvalRequestId).toBe("req-app-1");

    // 7. Publication Attempts
    const attempt1: PublicationAttempt = {
      id: randomUUID(),
      packageId: package1.id,
      attemptKey: `attempt-${randomUUID()}`,
      platform: "facebook",
      pageConfigurationId: "fb-page-main",
      status: "started",
      errorCode: null,
      errorClass: null,
      responseDigest: null,
      startedAt: "2026-08-30T14:00:00.000Z",
      finishedAt: null,
    };
    const createdAttempt = await repository.createPublicationAttempt(attempt1);
    expect(createdAttempt.id).toBe(attempt1.id);

    const updatedAttempt = await repository.updatePublicationAttempt(
      attempt1.id,
      "succeeded",
      "2026-08-30T14:00:05.000Z",
      null,
      null,
      "e".repeat(64),
    );
    expect(updatedAttempt.status).toBe("succeeded");
    expect(updatedAttempt.responseDigest).toBe("e".repeat(64));

    const attemptList = await repository.findPublicationAttemptsByPackageId(package1.id);
    expect(attemptList).toHaveLength(1);

    // 8. Publication Record
    const record1: PublicationRecord = {
      id: randomUUID(),
      packageId: package1.id,
      platform: "facebook",
      pageId: "fb-page-999",
      externalPostId: "fb-page-999_post-888",
      postUrl: "https://facebook.com/post-888",
      packageDigest: package1.packageDigest,
      contentDigest: package1.contentDigest,
      imageDigest: package1.imageDigest,
      verifiedAt: "2026-08-30T14:01:00.000Z",
      providerReceiptDigest: "f".repeat(64),
      createdAt: "2026-08-30T14:01:00.000Z",
    };
    const createdRecord = await repository.createPublicationRecord(record1);
    expect(createdRecord.id).toBe(record1.id);

    const foundRecord = await repository.findPublicationRecordByPackageId(package1.id);
    expect(foundRecord).toEqual(record1);

    const foundRecordByExt = await repository.findPublicationRecordByExternalPostId(
      "facebook",
      "fb-page-999",
      "fb-page-999_post-888",
    );
    expect(foundRecordByExt).toEqual(record1);

    // 9. Artifacts
    const artifact1: MarketingArtifact = {
      id: randomUUID(),
      campaignId,
      kind: "marketing_final_report_pdf",
      filename: "marketing-final-report.pdf",
      mediaType: "application/pdf",
      byteSize: 2048,
      sha256Digest: "1".repeat(64),
      storageKey: `marketing/${campaignId}/marketing-final-report.pdf`,
      createdAt: "2026-08-30T14:02:00.000Z",
    };
    const createdArtifact = await repository.createArtifact(artifact1);
    expect(createdArtifact.id).toBe(artifact1.id);

    const artifactList = await repository.findArtifactsByCampaignId(campaignId);
    expect(artifactList).toHaveLength(1);
    expect(artifactList[0]).toEqual(artifact1);

    const foundArtifact = await repository.findArtifactById(artifact1.id);
    expect(foundArtifact).toEqual(artifact1);
  });
});
