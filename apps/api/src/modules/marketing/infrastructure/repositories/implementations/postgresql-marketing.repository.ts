// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";
import type {
  CampaignBrief,
  ContentVersion,
  MarketingArtifact,
  MarketingCampaign,
  MarketingCampaignState,
  PublicationAttempt,
  PublicationPackage,
  PublicationPackageStatus,
  PublicationRecord,
  VisualAsset,
} from "../../../domain/entities/marketing-campaign";
import type { MarketingRepository } from "../../../application/repositories/interfaces/marketing.repository";

interface CampaignRow {
  id: string;
  state: MarketingCampaignState;
  assignment_mode: "direct_department" | "ai_ceo";
  created_by: string;
  idempotency_key: string;
  source_task_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface BriefRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  objective: string;
  subject_kind: "catalog_product" | "free_topic";
  subject_reference: string;
  audience: string | null;
  language: "vi" | "en";
  tone: string | null;
  mandatory_message: string;
  prohibited_claims: readonly string[];
  call_to_action: string;
  facebook_page_configuration_id: string;
  scheduled_for: Date;
  deadline: Date;
  approver_id: string;
  maximum_cost_micros: string | number;
  provenance: readonly {
    sourceType: string;
    sourceId: string;
    sourceDigest: string;
    classification: "internal" | "confidential";
  }[];
  version: number;
  created_at: Date;
}

interface ContentVersionRow {
  id: string;
  campaign_id: string;
  version_number: number;
  hook: string;
  body: string;
  call_to_action: string;
  hashtags: readonly string[];
  visual_direction: string;
  factual_claim_source_ids: readonly string[];
  content_digest: string;
  model_run_id: string | null;
  cost_micros: string | number;
  created_at: Date;
}

interface VisualAssetRow {
  id: string;
  campaign_id: string;
  version_number: number;
  media_type: "image/png";
  aspect_ratio: "1:1";
  width: number;
  height: number;
  byte_size: number;
  image_digest: string;
  alt_text: string;
  storage_key: string;
  model_run_id: string | null;
  cost_micros: string | number;
  created_at: Date;
}

interface PackageRow {
  id: string;
  campaign_id: string;
  package_version: number;
  content_version_id: string;
  visual_asset_id: string;
  facebook_page_configuration_id: string;
  scheduled_for: Date;
  content_digest: string;
  image_digest: string;
  package_digest: string;
  status: PublicationPackageStatus;
  approval_request_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AttemptRow {
  id: string;
  package_id: string;
  attempt_key: string;
  platform: "facebook";
  page_configuration_id: string;
  status: "started" | "succeeded" | "failed" | "unknown";
  error_code: string | null;
  error_class: string | null;
  response_digest: string | null;
  started_at: Date;
  finished_at: Date | null;
}

interface RecordRow {
  id: string;
  package_id: string;
  platform: "facebook";
  page_id: string;
  external_post_id: string;
  post_url: string;
  package_digest: string;
  content_digest: string;
  image_digest: string;
  verified_at: Date;
  provider_receipt_digest: string;
  created_at: Date;
}

interface ArtifactRow {
  id: string;
  campaign_id: string;
  kind: MarketingArtifact["kind"];
  filename: string;
  media_type: string;
  byte_size: string | number;
  sha256_digest: string;
  storage_key: string;
  created_at: Date;
}

function mapCampaignRow(row: CampaignRow): MarketingCampaign {
  return {
    id: row.id,
    state: row.state,
    assignmentMode: row.assignment_mode,
    createdBy: row.created_by,
    idempotencyKey: row.idempotency_key,
    sourceTaskId: row.source_task_id,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapBriefRow(row: BriefRow): CampaignBrief {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    objective: row.objective,
    subjectKind: row.subject_kind,
    subjectReference: row.subject_reference,
    audience: row.audience,
    language: row.language,
    tone: row.tone,
    mandatoryMessage: row.mandatory_message,
    prohibitedClaims: Array.isArray(row.prohibited_claims) ? row.prohibited_claims : [],
    callToAction: row.call_to_action,
    facebookPageConfigurationId: row.facebook_page_configuration_id,
    scheduledFor: row.scheduled_for.toISOString(),
    deadline: row.deadline.toISOString(),
    approverId: row.approver_id,
    maximumCostMicros: Number(row.maximum_cost_micros),
    provenance: Array.isArray(row.provenance) ? row.provenance : [],
    version: row.version,
    createdAt: row.created_at.toISOString(),
  };
}

function mapContentRow(row: ContentVersionRow): ContentVersion {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    versionNumber: row.version_number,
    hook: row.hook,
    body: row.body,
    callToAction: row.call_to_action,
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    visualDirection: row.visual_direction,
    factualClaimSourceIds: Array.isArray(row.factual_claim_source_ids) ? row.factual_claim_source_ids : [],
    contentDigest: row.content_digest,
    modelRunId: row.model_run_id,
    costMicros: Number(row.cost_micros),
    createdAt: row.created_at.toISOString(),
  };
}

function mapVisualRow(row: VisualAssetRow): VisualAsset {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    versionNumber: row.version_number,
    mediaType: row.media_type,
    aspectRatio: row.aspect_ratio,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    imageDigest: row.image_digest,
    altText: row.alt_text,
    storageKey: row.storage_key,
    modelRunId: row.model_run_id,
    costMicros: Number(row.cost_micros),
    createdAt: row.created_at.toISOString(),
  };
}

function mapPackageRow(row: PackageRow): PublicationPackage {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    packageVersion: row.package_version,
    contentVersionId: row.content_version_id,
    visualAssetId: row.visual_asset_id,
    facebookPageConfigurationId: row.facebook_page_configuration_id,
    scheduledFor: row.scheduled_for.toISOString(),
    contentDigest: row.content_digest,
    imageDigest: row.image_digest,
    packageDigest: row.package_digest,
    status: row.status,
    approvalRequestId: row.approval_request_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAttemptRow(row: AttemptRow): PublicationAttempt {
  return {
    id: row.id,
    packageId: row.package_id,
    attemptKey: row.attempt_key,
    platform: row.platform,
    pageConfigurationId: row.page_configuration_id,
    status: row.status,
    errorCode: row.error_code,
    errorClass: row.error_class,
    responseDigest: row.response_digest,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
  };
}

function mapRecordRow(row: RecordRow): PublicationRecord {
  return {
    id: row.id,
    packageId: row.package_id,
    platform: row.platform,
    pageId: row.page_id,
    externalPostId: row.external_post_id,
    postUrl: row.post_url,
    packageDigest: row.package_digest,
    contentDigest: row.content_digest,
    imageDigest: row.image_digest,
    verifiedAt: row.verified_at.toISOString(),
    providerReceiptDigest: row.provider_receipt_digest,
    createdAt: row.created_at.toISOString(),
  };
}

function mapArtifactRow(row: ArtifactRow): MarketingArtifact {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: row.kind,
    filename: row.filename,
    mediaType: row.media_type,
    byteSize: Number(row.byte_size),
    sha256Digest: row.sha256_digest,
    storageKey: row.storage_key,
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresqlMarketingRepository implements MarketingRepository {
  constructor(private readonly pool: Pool) {}

  async createCampaign(
    campaign: MarketingCampaign,
    brief: CampaignBrief,
  ): Promise<MarketingCampaign> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const campaignResult = await client.query<CampaignRow>(
        `INSERT INTO marketing_campaigns
         (id, state, assignment_mode, created_by, idempotency_key, source_task_id, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          campaign.id,
          campaign.state,
          campaign.assignmentMode,
          campaign.createdBy,
          campaign.idempotencyKey,
          campaign.sourceTaskId ?? null,
          campaign.version,
          campaign.createdAt,
          campaign.updatedAt,
        ],
      );

      await client.query(
        `INSERT INTO marketing_campaign_briefs
         (id, campaign_id, campaign_name, objective, subject_kind, subject_reference,
          audience, language, tone, mandatory_message, prohibited_claims, call_to_action,
          facebook_page_configuration_id, scheduled_for, deadline, approver_id,
          maximum_cost_micros, provenance, version, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          brief.id,
          brief.campaignId,
          brief.campaignName,
          brief.objective,
          brief.subjectKind,
          brief.subjectReference,
          brief.audience ?? null,
          brief.language,
          brief.tone ?? null,
          brief.mandatoryMessage,
          JSON.stringify(brief.prohibitedClaims),
          brief.callToAction,
          brief.facebookPageConfigurationId,
          brief.scheduledFor,
          brief.deadline,
          brief.approverId,
          brief.maximumCostMicros,
          JSON.stringify(brief.provenance),
          brief.version,
          brief.createdAt,
        ],
      );

      await client.query("COMMIT");
      return mapCampaignRow(campaignResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findCampaignById(id: string): Promise<MarketingCampaign | null> {
    const result = await this.pool.query<CampaignRow>(
      "SELECT * FROM marketing_campaigns WHERE id = $1",
      [id],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapCampaignRow(result.rows[0]);
  }

  async findCampaignByIdempotencyKey(
    createdBy: string,
    idempotencyKey: string,
  ): Promise<MarketingCampaign | null> {
    const result = await this.pool.query<CampaignRow>(
      "SELECT * FROM marketing_campaigns WHERE created_by = $1 AND idempotency_key = $2",
      [createdBy, idempotencyKey],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapCampaignRow(result.rows[0]);
  }

  async listCampaigns(params?: {
    limit?: number;
    offset?: number;
  }): Promise<readonly MarketingCampaign[]> {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const result = await this.pool.query<CampaignRow>(
      "SELECT * FROM marketing_campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset],
    );
    return result.rows.map(mapCampaignRow);
  }

  async updateCampaignState(
    id: string,
    expectedVersion: number,
    nextState: MarketingCampaignState,
  ): Promise<MarketingCampaign> {
    const result = await this.pool.query<CampaignRow>(
      `UPDATE marketing_campaigns
       SET state = $1, version = version + 1, updated_at = now()
       WHERE id = $2 AND version = $3
       RETURNING *`,
      [nextState, id, expectedVersion],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      throw new Error(
        `Optimistic concurrency failure updating marketing campaign ${id} at version ${expectedVersion}.`,
      );
    }
    return mapCampaignRow(result.rows[0]);
  }

  async findBriefByCampaignId(campaignId: string): Promise<CampaignBrief | null> {
    const result = await this.pool.query<BriefRow>(
      "SELECT * FROM marketing_campaign_briefs WHERE campaign_id = $1",
      [campaignId],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapBriefRow(result.rows[0]);
  }

  async createContentVersion(content: ContentVersion): Promise<ContentVersion> {
    const result = await this.pool.query<ContentVersionRow>(
      `INSERT INTO marketing_content_versions
       (id, campaign_id, version_number, hook, body, call_to_action, hashtags,
        visual_direction, factual_claim_source_ids, content_digest, model_run_id, cost_micros, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        content.id,
        content.campaignId,
        content.versionNumber,
        content.hook,
        content.body,
        content.callToAction,
        JSON.stringify(content.hashtags),
        content.visualDirection,
        JSON.stringify(content.factualClaimSourceIds),
        content.contentDigest,
        content.modelRunId ?? null,
        content.costMicros,
        content.createdAt,
      ],
    );
    return mapContentRow(result.rows[0]);
  }

  async findContentVersionsByCampaignId(
    campaignId: string,
  ): Promise<readonly ContentVersion[]> {
    const result = await this.pool.query<ContentVersionRow>(
      "SELECT * FROM marketing_content_versions WHERE campaign_id = $1 ORDER BY version_number ASC",
      [campaignId],
    );
    return result.rows.map(mapContentRow);
  }

  async findContentVersionById(id: string): Promise<ContentVersion | null> {
    const result = await this.pool.query<ContentVersionRow>(
      "SELECT * FROM marketing_content_versions WHERE id = $1",
      [id],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapContentRow(result.rows[0]);
  }

  async createVisualAsset(asset: VisualAsset): Promise<VisualAsset> {
    const result = await this.pool.query<VisualAssetRow>(
      `INSERT INTO marketing_visual_assets
       (id, campaign_id, version_number, media_type, aspect_ratio, width, height,
        byte_size, image_digest, alt_text, storage_key, model_run_id, cost_micros, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        asset.id,
        asset.campaignId,
        asset.versionNumber,
        asset.mediaType,
        asset.aspectRatio,
        asset.width,
        asset.height,
        asset.byteSize,
        asset.imageDigest,
        asset.altText,
        asset.storageKey,
        asset.modelRunId ?? null,
        asset.costMicros,
        asset.createdAt,
      ],
    );
    return mapVisualRow(result.rows[0]);
  }

  async findVisualAssetsByCampaignId(
    campaignId: string,
  ): Promise<readonly VisualAsset[]> {
    const result = await this.pool.query<VisualAssetRow>(
      "SELECT * FROM marketing_visual_assets WHERE campaign_id = $1 ORDER BY version_number ASC",
      [campaignId],
    );
    return result.rows.map(mapVisualRow);
  }

  async findVisualAssetById(id: string): Promise<VisualAsset | null> {
    const result = await this.pool.query<VisualAssetRow>(
      "SELECT * FROM marketing_visual_assets WHERE id = $1",
      [id],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapVisualRow(result.rows[0]);
  }

  async createPublicationPackage(pkg: PublicationPackage): Promise<PublicationPackage> {
    const result = await this.pool.query<PackageRow>(
      `INSERT INTO marketing_publication_packages
       (id, campaign_id, package_version, content_version_id, visual_asset_id,
        facebook_page_configuration_id, scheduled_for, content_digest, image_digest,
        package_digest, status, approval_request_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
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
        pkg.approvalRequestId ?? null,
        pkg.createdAt,
        pkg.updatedAt,
      ],
    );
    return mapPackageRow(result.rows[0]);
  }

  async findPublicationPackagesByCampaignId(
    campaignId: string,
  ): Promise<readonly PublicationPackage[]> {
    const result = await this.pool.query<PackageRow>(
      "SELECT * FROM marketing_publication_packages WHERE campaign_id = $1 ORDER BY package_version ASC",
      [campaignId],
    );
    return result.rows.map(mapPackageRow);
  }

  async findPublicationPackageById(id: string): Promise<PublicationPackage | null> {
    const result = await this.pool.query<PackageRow>(
      "SELECT * FROM marketing_publication_packages WHERE id = $1",
      [id],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapPackageRow(result.rows[0]);
  }

  async findCurrentPackageByCampaignId(
    campaignId: string,
  ): Promise<PublicationPackage | null> {
    const result = await this.pool.query<PackageRow>(
      "SELECT * FROM marketing_publication_packages WHERE campaign_id = $1 ORDER BY package_version DESC LIMIT 1",
      [campaignId],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapPackageRow(result.rows[0]);
  }

  async updatePublicationPackageStatus(
    id: string,
    status: PublicationPackageStatus,
    approvalRequestId?: string | null,
  ): Promise<PublicationPackage> {
    const result = await this.pool.query<PackageRow>(
      `UPDATE marketing_publication_packages
       SET status = $1,
           approval_request_id = COALESCE($2, approval_request_id),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [status, approvalRequestId ?? null, id],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      throw new Error(`Publication package ${id} not found.`);
    }
    return mapPackageRow(result.rows[0]);
  }

  async createPublicationAttempt(
    attempt: PublicationAttempt,
  ): Promise<PublicationAttempt> {
    const result = await this.pool.query<AttemptRow>(
      `INSERT INTO marketing_publication_attempts
       (id, package_id, attempt_key, platform, page_configuration_id, status,
        error_code, error_class, response_digest, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        attempt.id,
        attempt.packageId,
        attempt.attemptKey,
        attempt.platform,
        attempt.pageConfigurationId,
        attempt.status,
        attempt.errorCode ?? null,
        attempt.errorClass ?? null,
        attempt.responseDigest ?? null,
        attempt.startedAt,
        attempt.finishedAt ?? null,
      ],
    );
    return mapAttemptRow(result.rows[0]);
  }

  async updatePublicationAttempt(
    id: string,
    status: PublicationAttempt["status"],
    finishedAt?: string,
    errorCode?: string | null,
    errorClass?: string | null,
    responseDigest?: string | null,
  ): Promise<PublicationAttempt> {
    const result = await this.pool.query<AttemptRow>(
      `UPDATE marketing_publication_attempts
       SET status = $1,
           finished_at = COALESCE($2::timestamptz, now()),
           error_code = $3,
           error_class = $4,
           response_digest = $5
       WHERE id = $6
       RETURNING *`,
      [
        status,
        finishedAt ?? null,
        errorCode ?? null,
        errorClass ?? null,
        responseDigest ?? null,
        id,
      ],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      throw new Error(`Publication attempt ${id} not found.`);
    }
    return mapAttemptRow(result.rows[0]);
  }

  async findPublicationAttemptsByPackageId(
    packageId: string,
  ): Promise<readonly PublicationAttempt[]> {
    const result = await this.pool.query<AttemptRow>(
      "SELECT * FROM marketing_publication_attempts WHERE package_id = $1 ORDER BY started_at ASC",
      [packageId],
    );
    return result.rows.map(mapAttemptRow);
  }

  async createPublicationRecord(
    record: PublicationRecord,
  ): Promise<PublicationRecord> {
    const result = await this.pool.query<RecordRow>(
      `INSERT INTO marketing_publication_records
       (id, package_id, platform, page_id, external_post_id, post_url,
        package_digest, content_digest, image_digest, verified_at, provider_receipt_digest, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        record.id,
        record.packageId,
        record.platform,
        record.pageId,
        record.externalPostId,
        record.postUrl,
        record.packageDigest,
        record.contentDigest,
        record.imageDigest,
        record.verifiedAt,
        record.providerReceiptDigest,
        record.createdAt,
      ],
    );
    return mapRecordRow(result.rows[0]);
  }

  async findPublicationRecordByPackageId(
    packageId: string,
  ): Promise<PublicationRecord | null> {
    const result = await this.pool.query<RecordRow>(
      "SELECT * FROM marketing_publication_records WHERE package_id = $1",
      [packageId],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapRecordRow(result.rows[0]);
  }

  async findPublicationRecordByExternalPostId(
    platform: string,
    pageId: string,
    externalPostId: string,
  ): Promise<PublicationRecord | null> {
    const result = await this.pool.query<RecordRow>(
      "SELECT * FROM marketing_publication_records WHERE platform = $1 AND page_id = $2 AND external_post_id = $3",
      [platform, pageId, externalPostId],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapRecordRow(result.rows[0]);
  }

  async createArtifact(artifact: MarketingArtifact): Promise<MarketingArtifact> {
    const result = await this.pool.query<ArtifactRow>(
      `INSERT INTO marketing_artifacts
       (id, campaign_id, kind, filename, media_type, byte_size, sha256_digest, storage_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        artifact.id,
        artifact.campaignId,
        artifact.kind,
        artifact.filename,
        artifact.mediaType,
        artifact.byteSize,
        artifact.sha256Digest,
        artifact.storageKey,
        artifact.createdAt,
      ],
    );
    return mapArtifactRow(result.rows[0]);
  }

  async findArtifactsByCampaignId(
    campaignId: string,
  ): Promise<readonly MarketingArtifact[]> {
    const result = await this.pool.query<ArtifactRow>(
      "SELECT * FROM marketing_artifacts WHERE campaign_id = $1 ORDER BY created_at ASC",
      [campaignId],
    );
    return result.rows.map(mapArtifactRow);
  }

  async findArtifactById(id: string): Promise<MarketingArtifact | null> {
    const result = await this.pool.query<ArtifactRow>(
      "SELECT * FROM marketing_artifacts WHERE id = $1",
      [id],
    );
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapArtifactRow(result.rows[0]);
  }
}
