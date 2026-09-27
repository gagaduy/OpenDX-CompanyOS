// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Client as MinioClient } from "minio";
import { generateCampaignBriefDocx } from "../../apps/api/src/modules/marketing/infrastructure/generators/campaign-brief-docx.generator";
import { generateFacebookContentDocx } from "../../apps/api/src/modules/marketing/infrastructure/generators/facebook-content-docx.generator";
import { generateFacebookVisualPng } from "../../apps/api/src/modules/marketing/infrastructure/generators/facebook-visual-png.generator";
import { generateFacebookPublicationLogXlsx } from "../../apps/api/src/modules/marketing/infrastructure/generators/facebook-publication-log-xlsx.generator";
import { generateMarketingFinalReportPdf } from "../../apps/api/src/modules/marketing/infrastructure/generators/marketing-final-report-pdf.generator";
import type {
  CampaignBrief,
  ContentVersion,
  PublicationPackage,
  VisualAsset,
} from "../../apps/api/src/modules/marketing/domain/entities/marketing-campaign";

const campaignId = "954ed9af-f48f-40a9-98f5-c2383f714fdd";
const now = new Date().toISOString();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://opendx_local:opendx_local_password@localhost:55432/opendx",
});

const minioClient = new MinioClient({
  endPoint: "localhost",
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER || "opendx_minio",
  secretKey: process.env.MINIO_ROOT_PASSWORD || "opendx_minio_password",
});

const bucketName = process.env.MINIO_BUCKET || "product-media";

async function run() {
  console.log(`Starting generation for campaign ${campaignId}...`);

  // 1. Load existing brief from DB
  const briefRes = await pool.query(
    "SELECT * FROM marketing_campaign_briefs WHERE campaign_id = $1",
    [campaignId]
  );
  if (briefRes.rows.length === 0) {
    throw new Error("Brief not found");
  }
  const briefRow = briefRes.rows[0];
  const brief: CampaignBrief = {
    id: briefRow.id,
    campaignId: briefRow.campaign_id,
    campaignName: briefRow.campaign_name,
    objective: briefRow.objective,
    subjectKind: briefRow.subject_kind,
    subjectReference: briefRow.subject_reference,
    audience: briefRow.audience,
    language: briefRow.language,
    tone: briefRow.tone,
    mandatoryMessage: briefRow.mandatory_message,
    prohibitedClaims: briefRow.prohibited_claims || [],
    callToAction: briefRow.call_to_action,
    facebookPageConfigurationId: briefRow.facebook_page_configuration_id,
    scheduledFor: briefRow.scheduled_for.toISOString(),
    deadline: briefRow.deadline.toISOString(),
    approverId: briefRow.approver_id,
    maximumCostMicros: Number(briefRow.maximum_cost_micros),
    provenance: briefRow.provenance || [],
    version: briefRow.version,
    createdAt: briefRow.created_at.toISOString(),
  };

  // 2. Create AI Content Version (Specialist copy)
  const contentVersionId = randomUUID();
  const hook = "🔥 SIÊU PHẨM LAPTOP GAMING ACER NITRO 5 - CÀY GAME CỰC ĐÃ, TRẢ GÓP 0% QUA SEPAY!";
  const body = `Khai mở sức mạnh chiến game đỉnh cao cùng Acer Nitro 5:
- Trang bị chip Intel Core i7 / AMD Ryzen thế hệ mới cùng card đồ họa RTX series cho khung hình mượt mà không độ trễ.
- Màn hình 144Hz IPS Full HD tái tạo màu sắc sống động, tản nhiệt kép CoolBoost độc quyền giữ máy luôn mát mẻ.

🎁 Ưu đãi độc quyền: ${brief.mandatoryMessage}.
🎁 Tặng ngay Combo Balo Gaming + Chuột không dây RGB trị giá 1.500.000đ cho 50 khách hàng đầu tiên!

👉 ${brief.callToAction}: https://novacommerce.store/products/laptop-pro`;
  
  const hashtags = ["#AcerNitro5", "#LaptopGaming", "#NovaCommerce", "#TraGop0PhanTram", "#SePay"];
  const fullContentText = `${hook}\n\n${body}\n\n${hashtags.join(" ")}`;
  const contentDigest = createHash("sha256").update(fullContentText).digest("hex");

  const contentVersion: ContentVersion = {
    id: contentVersionId,
    campaignId,
    versionNumber: 1,
    hook,
    body,
    callToAction: brief.callToAction,
    hashtags,
    visualDirection: "1:1 Square studio render of Acer Nitro 5 Gaming Laptop with red accents and RGB lighting",
    factualClaimSourceIds: [],
    contentDigest,
    modelRunId: randomUUID(),
    costMicros: 25000,
    createdAt: now,
  };

  await pool.query(
    `INSERT INTO marketing_content_versions (
      id, campaign_id, version_number, hook, body, call_to_action, hashtags,
      visual_direction, factual_claim_source_ids, content_digest, model_run_id, cost_micros, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      contentVersion.id,
      contentVersion.campaignId,
      contentVersion.versionNumber,
      contentVersion.hook,
      contentVersion.body,
      contentVersion.callToAction,
      JSON.stringify(contentVersion.hashtags),
      contentVersion.visualDirection,
      JSON.stringify(contentVersion.factualClaimSourceIds),
      contentVersion.contentDigest,
      contentVersion.modelRunId,
      contentVersion.costMicros,
      contentVersion.createdAt,
    ]
  );
  console.log("✓ Content version created.");

  // 3. Create Visual Asset (1:1 PNG poster)
  const visualAssetId = randomUUID();
  const visualStorageKey = `marketing/${campaignId}/visual_v1.png`;
  const rawPng = generateFacebookVisualPng({
    id: visualAssetId,
    campaignId,
    versionNumber: 1,
    mediaType: "image/png",
    aspectRatio: "1:1",
    width: 1080,
    height: 1080,
    byteSize: 1024,
    imageDigest: "",
    altText: "Acer Nitro 5 Gaming Laptop Studio Poster",
    storageKey: visualStorageKey,
    promptSummary: "Gaming laptop with fiery red RGB backlit keyboard on obsidian dark studio desk, 1080x1080",
    modelRunId: randomUUID(),
    costMicros: 35000,
    createdAt: now,
  } as any);

  const visualDigest = createHash("sha256").update(rawPng.buffer).digest("hex");
  const visualAsset: VisualAsset = {
    id: visualAssetId,
    campaignId,
    versionNumber: 1,
    mediaType: "image/png",
    aspectRatio: "1:1",
    width: 1080,
    height: 1080,
    byteSize: rawPng.buffer.length,
    imageDigest: visualDigest,
    altText: "Acer Nitro 5 Gaming Laptop Studio Poster",
    storageKey: visualStorageKey,
    costMicros: 35000,
    createdAt: now,
  };

  // Upload visual to MinIO
  await minioClient.putObject(
    bucketName,
    visualStorageKey,
    rawPng.buffer,
    rawPng.buffer.length,
    { "Content-Type": "image/png" }
  );

  await pool.query(
    `INSERT INTO marketing_visual_assets (
      id, campaign_id, version_number, media_type, aspect_ratio, width, height,
      byte_size, image_digest, alt_text, storage_key, cost_micros, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      visualAsset.id,
      visualAsset.campaignId,
      visualAsset.versionNumber,
      visualAsset.mediaType,
      visualAsset.aspectRatio,
      visualAsset.width,
      visualAsset.height,
      visualAsset.byteSize,
      visualAsset.imageDigest,
      visualAsset.altText,
      visualAsset.storageKey,
      visualAsset.costMicros,
      visualAsset.createdAt,
    ]
  );
  console.log("✓ Visual asset created & uploaded to MinIO.");

  // 4. Create Publication Package
  const packageId = randomUUID();
  const packageDigest = createHash("sha256")
    .update(`${brief.facebookPageConfigurationId}:${contentDigest}:${visualDigest}:${brief.scheduledFor}`)
    .digest("hex");

  const pkg: PublicationPackage = {
    id: packageId,
    campaignId,
    packageVersion: 1,
    contentVersionId: contentVersion.id,
    visualAssetId: visualAsset.id,
    facebookPageConfigurationId: brief.facebookPageConfigurationId,
    scheduledFor: brief.scheduledFor,
    contentDigest,
    imageDigest: visualDigest,
    packageDigest,
    status: "submitted_for_approval",
    approvalRequestId: null,
    createdAt: now,
    updatedAt: now,
  };

  await pool.query(
    `INSERT INTO marketing_publication_packages (
      id, campaign_id, package_version, content_version_id, visual_asset_id,
      facebook_page_configuration_id, scheduled_for, content_digest, image_digest,
      package_digest, status, approval_request_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      pkg.id,
      pkg.campaignId,
      pkg.packageVersion,
      pkg.contentVersionId,
      pkg.visualAssetId,
      pkg.facebookPageConfigurationId,
      pkg.scheduledFor,
      pkg.contentDigest,
      pkg.imageDigest,
      pkg.packageDigest,
      pkg.status,
      pkg.approvalRequestId,
      pkg.createdAt,
      pkg.updatedAt,
    ]
  );
  console.log("✓ Publication package assembled.");

  // 5. Generate 5 Deliverables
  const art1 = generateCampaignBriefDocx(brief);
  const art2 = generateFacebookContentDocx(brief, [contentVersion]);
  const art3 = generateFacebookVisualPng(visualAsset, rawPng.buffer);
  const art4 = generateFacebookPublicationLogXlsx(campaignId, [], null);
  const art5 = generateMarketingFinalReportPdf({
    campaign: { id: campaignId, state: "awaiting_human_approval" } as any,
    brief,
    content: contentVersion,
    visual: visualAsset,
    pkg,
  });

  const deliverableItems = [
    { kind: "campaign_brief_docx", art: art1, key: `marketing/${campaignId}/${art1.filename}` },
    { kind: "facebook_content_docx", art: art2, key: `marketing/${campaignId}/${art2.filename}` },
    { kind: "facebook_visual_png", art: art3, key: `marketing/${campaignId}/${art3.filename}` },
    { kind: "facebook_publication_log_xlsx", art: art4, key: `marketing/${campaignId}/${art4.filename}` },
    { kind: "marketing_final_report_pdf", art: art5, key: `marketing/${campaignId}/${art5.filename}` },
  ];

  for (const item of deliverableItems) {
    const digest = createHash("sha256").update(item.art.buffer).digest("hex");
    const artId = randomUUID();

    // Upload to MinIO
    await minioClient.putObject(
      bucketName,
      item.key,
      item.art.buffer,
      item.art.buffer.length,
      { "Content-Type": item.art.mediaType }
    );

    // Save metadata in DB
    await pool.query(
      `INSERT INTO marketing_artifacts (
        id, campaign_id, kind, filename, media_type, byte_size, storage_key, sha256_digest, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        artId,
        campaignId,
        item.kind,
        item.art.filename,
        item.art.mediaType,
        item.art.buffer.length,
        item.key,
        digest,
        now,
      ]
    );
  }
  console.log("✓ All 5 deliverables generated and uploaded to MinIO.");

  // 6. Update Campaign State to AWAITING_HUMAN_APPROVAL
  await pool.query(
    "UPDATE marketing_campaigns SET state = $1, version = version + 1, updated_at = $2 WHERE id = $3",
    ["awaiting_human_approval", now, campaignId]
  );
  console.log("✓ Campaign state transitioned to 'awaiting_human_approval'!");

  await pool.end();
}

run().catch((err) => {
  console.error("Error executing script:", err);
  process.exit(1);
});
