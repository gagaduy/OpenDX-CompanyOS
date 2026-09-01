// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";
import type {
  CampaignBrief,
  ContentVersion,
  MarketingArtifact,
  MarketingArtifactKind,
  MarketingCampaign,
  MarketingCampaignState,
  PublicationAttempt,
  PublicationExecutionMode,
  PublicationFormat,
  PublicationPackage,
  PublicationPackageStatus,
  PublicationRecord,
  PublicationTarget,
  PublicationTargetStatus,
  SocialPlatform,
  VisualAsset,
  VisualAssetAspectRatio,
} from "../../../domain/entities/marketing-campaign";
import type {
  ClaimDueTargetsInput,
  MarketingRepository,
  UpdateTargetStatusInput,
} from "../../../application/repositories/interfaces/marketing.repository";

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
  facebook_page_configuration_id: string | null;
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
  aspect_ratio: VisualAssetAspectRatio;
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
  visual_asset_id: string | null;
  facebook_page_configuration_id: string | null;
  scheduled_for: Date;
  content_digest: string;
  image_digest: string | null;
  package_digest: string;
  status: PublicationPackageStatus;
  approval_request_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface TargetRow {
  id: string;
  package_id: string;
  platform: SocialPlatform;
  format: PublicationFormat;
  account_configuration_id: string;
  content_version_id: string;
  media_asset_ids: string[];
  caption: string;
  scheduled_for: Date;
  required: boolean;
  execution_mode: PublicationExecutionMode;
  content_digest: string;
  media_digest: string;
  target_digest: string;
  status: PublicationTargetStatus;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface AttemptRow {
  id: string;
  package_id: string;
  target_id: string | null;
  attempt_key: string;
  platform: SocialPlatform;
  page_configuration_id: string;
  execution_mode: PublicationExecutionMode | null;
  simulated: boolean | null;
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
  target_id: string | null;
  platform: SocialPlatform;
  page_id: string;
  external_post_id: string;
  post_url: string | null;
  execution_mode: PublicationExecutionMode | null;
  simulated: boolean | null;
  display_message: string | null;
  package_digest: string;
  content_digest: string;
  image_digest: string | null;
  target_digest: string | null;
  verified_at: Date;
  provider_receipt_digest: string;
  verification_evidence_digest: string | null;
  created_at: Date;
}

interface ArtifactRow {
  id: string;
  campaign_id: string;
  kind: MarketingArtifactKind;
  filename: string;
  media_type: string;
  byte_size: string | number;
  sha256_digest: string;
  storage_key: string;
  created_at: Date;
}

export class PostgresqlMarketingRepository implements MarketingRepository {
  constructor(private readonly pool: Pool) {}

  async createCampaign(campaign: MarketingCampaign, brief: CampaignBrief): Promise<MarketingCampaign> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const campaignResult = await client.query<CampaignRow>(
        `INSERT INTO marketing_campaigns (id, state, assignment_mode, created_by, idempotency_key, source_task_id, version, created_at, updated_at)
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
          facebook_page_configuration_id, scheduled_for, deadline, approver_id, maximum_cost_micros,
          provenance, version, created_at)
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
          brief.facebookPageConfigurationId ?? null,
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
      return this.mapCampaignRow(campaignResult.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async findCampaignById(id: string): Promise<MarketingCampaign | null> {
    const res = await this.pool.query<CampaignRow>(
      "SELECT * FROM marketing_campaigns WHERE id = $1",
      [id],
    );
    return res.rows[0] ? this.mapCampaignRow(res.rows[0]) : null;
  }

  async findCampaignByIdempotencyKey(createdBy: string, idempotencyKey: string): Promise<MarketingCampaign | null> {
    const res = await this.pool.query<CampaignRow>(
      "SELECT * FROM marketing_campaigns WHERE created_by = $1 AND idempotency_key = $2",
      [createdBy, idempotencyKey],
    );
    return res.rows[0] ? this.mapCampaignRow(res.rows[0]) : null;
  }

  async listCampaigns(params?: { limit?: number; offset?: number }): Promise<readonly MarketingCampaign[]> {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const res = await this.pool.query<CampaignRow>(
      "SELECT * FROM marketing_campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset],
    );
    return res.rows.map((row) => this.mapCampaignRow(row));
  }

  async updateCampaignState(
    id: string,
    expectedVersion: number,
    nextState: MarketingCampaignState,
  ): Promise<MarketingCampaign> {
    const res = await this.pool.query<CampaignRow>(
      `UPDATE marketing_campaigns
       SET state = $1, version = version + 1, updated_at = now()
       WHERE id = $2 AND version = $3
       RETURNING *`,
      [nextState, id, expectedVersion],
    );
    if (res.rows.length === 0) {
      throw new Error(`Optimistic lock failure or campaign not found for id '${id}'.`);
    }
    return this.mapCampaignRow(res.rows[0]);
  }

  async findBriefByCampaignId(campaignId: string): Promise<CampaignBrief | null> {
    const res = await this.pool.query<BriefRow>(
      "SELECT * FROM marketing_campaign_briefs WHERE campaign_id = $1",
      [campaignId],
    );
    return res.rows[0] ? this.mapBriefRow(res.rows[0]) : null;
  }

  async createContentVersion(content: ContentVersion): Promise<ContentVersion> {
    const res = await this.pool.query<ContentVersionRow>(
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
    return this.mapContentVersionRow(res.rows[0]);
  }

  async findContentVersionsByCampaignId(campaignId: string): Promise<readonly ContentVersion[]> {
    const res = await this.pool.query<ContentVersionRow>(
      "SELECT * FROM marketing_content_versions WHERE campaign_id = $1 ORDER BY version_number ASC",
      [campaignId],
    );
    return res.rows.map((row) => this.mapContentVersionRow(row));
  }

  async findContentVersionById(id: string): Promise<ContentVersion | null> {
    const res = await this.pool.query<ContentVersionRow>(
      "SELECT * FROM marketing_content_versions WHERE id = $1",
      [id],
    );
    return res.rows[0] ? this.mapContentVersionRow(res.rows[0]) : null;
  }

  async createVisualAsset(asset: VisualAsset): Promise<VisualAsset> {
    const res = await this.pool.query<VisualAssetRow>(
      `INSERT INTO marketing_visual_assets
       (id, campaign_id, version_number, media_type, aspect_ratio, width, height, byte_size,
        image_digest, alt_text, storage_key, model_run_id, cost_micros, created_at)
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
    return this.mapVisualAssetRow(res.rows[0]);
  }

  async findVisualAssetsByCampaignId(campaignId: string): Promise<readonly VisualAsset[]> {
    const res = await this.pool.query<VisualAssetRow>(
      "SELECT * FROM marketing_visual_assets WHERE campaign_id = $1 ORDER BY version_number ASC",
      [campaignId],
    );
    return res.rows.map((row) => this.mapVisualAssetRow(row));
  }

  async findVisualAssetById(id: string): Promise<VisualAsset | null> {
    const res = await this.pool.query<VisualAssetRow>(
      "SELECT * FROM marketing_visual_assets WHERE id = $1",
      [id],
    );
    return res.rows[0] ? this.mapVisualAssetRow(res.rows[0]) : null;
  }

  async createPublicationPackage(pkg: PublicationPackage): Promise<PublicationPackage> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query<PackageRow>(
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
          pkg.visualAssetId ?? null,
          pkg.facebookPageConfigurationId ?? null,
          pkg.scheduledFor,
          pkg.contentDigest,
          pkg.imageDigest ?? null,
          pkg.packageDigest,
          pkg.status,
          pkg.approvalRequestId ?? null,
          pkg.createdAt,
          pkg.updatedAt,
        ],
      );

      let savedTargets: readonly PublicationTarget[] = [];
      if (pkg.targets && pkg.targets.length > 0) {
        for (const target of pkg.targets) {
          await client.query(
            `INSERT INTO marketing_publication_targets
             (id, package_id, platform, format, account_configuration_id,
              content_version_id, media_asset_ids, caption, scheduled_for,
              required, execution_mode, content_digest, media_digest, target_digest,
              status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
            [
              target.id,
              target.packageId,
              target.platform,
              target.format,
              target.accountConfigurationId,
              target.contentVersionId,
              target.mediaAssetIds,
              target.caption,
              target.scheduledFor,
              target.required,
              target.executionMode,
              target.contentDigest,
              target.mediaDigest,
              target.targetDigest,
              target.status,
              target.createdAt,
              target.updatedAt,
            ],
          );
        }
        savedTargets = pkg.targets;
      }

      await client.query("COMMIT");
      return this.mapPackageRow(res.rows[0], savedTargets);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async findPublicationPackagesByCampaignId(campaignId: string): Promise<readonly PublicationPackage[]> {
    const res = await this.pool.query<PackageRow>(
      "SELECT * FROM marketing_publication_packages WHERE campaign_id = $1 ORDER BY package_version ASC",
      [campaignId],
    );
    const packages: PublicationPackage[] = [];
    for (const row of res.rows) {
      const targets = await this.findPublicationTargetsByPackageId(row.id);
      packages.push(this.mapPackageRow(row, targets));
    }
    return packages;
  }

  async findPublicationPackageById(id: string): Promise<PublicationPackage | null> {
    const res = await this.pool.query<PackageRow>(
      "SELECT * FROM marketing_publication_packages WHERE id = $1",
      [id],
    );
    if (!res.rows[0]) return null;
    const targets = await this.findPublicationTargetsByPackageId(id);
    return this.mapPackageRow(res.rows[0], targets);
  }

  async findCurrentPackageByCampaignId(campaignId: string): Promise<PublicationPackage | null> {
    const res = await this.pool.query<PackageRow>(
      "SELECT * FROM marketing_publication_packages WHERE campaign_id = $1 ORDER BY package_version DESC LIMIT 1",
      [campaignId],
    );
    if (!res.rows[0]) return null;
    const targets = await this.findPublicationTargetsByPackageId(res.rows[0].id);
    return this.mapPackageRow(res.rows[0], targets);
  }

  async updatePublicationPackageStatus(
    id: string,
    status: PublicationPackageStatus,
    approvalRequestId?: string | null,
  ): Promise<PublicationPackage> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query<PackageRow>(
        `UPDATE marketing_publication_packages
         SET status = $1, approval_request_id = COALESCE($2, approval_request_id), updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [status, approvalRequestId ?? null, id],
      );
      if (res.rows.length === 0) {
        throw new Error(`Publication package not found for id '${id}'.`);
      }

      if (status === "approved") {
        await client.query(
          `UPDATE marketing_publication_targets
           SET status = 'scheduled', updated_at = now()
           WHERE package_id = $1 AND status = 'pending_approval'`,
          [id],
        );
      }

      const targetsRes = await client.query<TargetRow>(
        "SELECT * FROM marketing_publication_targets WHERE package_id = $1 ORDER BY created_at ASC",
        [id],
      );
      await client.query("COMMIT");
      return this.mapPackageRow(res.rows[0], targetsRes.rows.map((r) => this.mapTargetRow(r)));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async createPublicationTargets(targets: readonly PublicationTarget[]): Promise<readonly PublicationTarget[]> {
    if (targets.length === 0) return [];
    const results: PublicationTarget[] = [];
    for (const target of targets) {
      const res = await this.pool.query<TargetRow>(
        `INSERT INTO marketing_publication_targets
         (id, package_id, platform, format, account_configuration_id,
          content_version_id, media_asset_ids, caption, scheduled_for,
          required, execution_mode, content_digest, media_digest, target_digest,
          status, lease_owner, lease_expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [
          target.id,
          target.packageId,
          target.platform,
          target.format,
          target.accountConfigurationId,
          target.contentVersionId,
          target.mediaAssetIds,
          target.caption,
          target.scheduledFor,
          target.required,
          target.executionMode,
          target.contentDigest,
          target.mediaDigest,
          target.targetDigest,
          target.status,
          target.leaseOwner ?? null,
          target.leaseExpiresAt ?? null,
          target.createdAt,
          target.updatedAt,
        ],
      );
      results.push(this.mapTargetRow(res.rows[0]));
    }
    return results;
  }

  async findPublicationTargetsByPackageId(packageId: string): Promise<readonly PublicationTarget[]> {
    const res = await this.pool.query<TargetRow>(
      "SELECT * FROM marketing_publication_targets WHERE package_id = $1 ORDER BY created_at ASC",
      [packageId],
    );
    return res.rows.map((row) => this.mapTargetRow(row));
  }

  async findPublicationTargetById(id: string): Promise<PublicationTarget | null> {
    const res = await this.pool.query<TargetRow>(
      "SELECT * FROM marketing_publication_targets WHERE id = $1",
      [id],
    );
    return res.rows[0] ? this.mapTargetRow(res.rows[0]) : null;
  }

  async claimDuePublicationTargets(input: ClaimDueTargetsInput): Promise<readonly PublicationTarget[]> {
    const res = await this.pool.query<TargetRow>(
      `WITH due_targets AS (
         SELECT id FROM marketing_publication_targets
         WHERE status IN ('approved', 'scheduled')
           AND scheduled_for <= $2::timestamptz
           AND (lease_expires_at IS NULL OR lease_expires_at < $2::timestamptz)
         ORDER BY scheduled_for ASC
         LIMIT $4
         FOR UPDATE SKIP LOCKED
       )
       UPDATE marketing_publication_targets t
       SET status = 'claimed',
           lease_owner = $1,
           lease_expires_at = $2::timestamptz + ($3 || ' seconds')::interval,
           updated_at = $2::timestamptz
       FROM due_targets d
       WHERE t.id = d.id
       RETURNING t.*`,
      [input.workerId, input.now, input.leaseSeconds, input.limit],
    );
    return res.rows.map((row) => this.mapTargetRow(row));
  }

  async updatePublicationTargetStatus(input: UpdateTargetStatusInput): Promise<PublicationTarget> {
    const res = await this.pool.query<TargetRow>(
      `UPDATE marketing_publication_targets
       SET status = $2,
           lease_owner = $3,
           lease_expires_at = $4,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [input.targetId, input.status, input.leaseOwner ?? null, input.leaseExpiresAt ?? null],
    );
    if (res.rows.length === 0) {
      throw new Error(`Publication target not found for id '${input.targetId}'.`);
    }
    return this.mapTargetRow(res.rows[0]);
  }

  async releasePublicationTargetLease(targetId: string, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE marketing_publication_targets
       SET lease_owner = NULL,
           lease_expires_at = NULL,
           updated_at = now()
       WHERE id = $1 AND lease_owner = $2`,
      [targetId, workerId],
    );
  }

  async findPublicationAttemptsByTargetId(targetId: string): Promise<readonly PublicationAttempt[]> {
    const res = await this.pool.query<AttemptRow>(
      "SELECT * FROM marketing_publication_attempts WHERE target_id = $1 ORDER BY started_at ASC",
      [targetId],
    );
    return res.rows.map((row) => this.mapAttemptRow(row));
  }

  async findPublicationRecordByTargetId(targetId: string): Promise<PublicationRecord | null> {
    const res = await this.pool.query<RecordRow>(
      "SELECT * FROM marketing_publication_records WHERE target_id = $1",
      [targetId],
    );
    return res.rows[0] ? this.mapRecordRow(res.rows[0]) : null;
  }

  async createPublicationAttempt(attempt: PublicationAttempt): Promise<PublicationAttempt> {
    const res = await this.pool.query<AttemptRow>(
      `INSERT INTO marketing_publication_attempts
       (id, package_id, target_id, attempt_key, platform, page_configuration_id, execution_mode, simulated,
        status, error_code, error_class, response_digest, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        attempt.id,
        attempt.packageId,
        attempt.targetId ?? null,
        attempt.attemptKey,
        attempt.platform,
        attempt.pageConfigurationId,
        attempt.executionMode ?? null,
        attempt.simulated ?? false,
        attempt.status,
        attempt.errorCode ?? null,
        attempt.errorClass ?? null,
        attempt.responseDigest ?? null,
        attempt.startedAt,
        attempt.finishedAt ?? null,
      ],
    );
    return this.mapAttemptRow(res.rows[0]);
  }

  async updatePublicationAttempt(
    id: string,
    status: PublicationAttempt["status"],
    finishedAt?: string,
    errorCode?: string | null,
    errorClass?: string | null,
    responseDigest?: string | null,
  ): Promise<PublicationAttempt> {
    const res = await this.pool.query<AttemptRow>(
      `UPDATE marketing_publication_attempts
       SET status = $1, finished_at = $2, error_code = $3, error_class = $4, response_digest = $5
       WHERE id = $6
       RETURNING *`,
      [status, finishedAt ?? null, errorCode ?? null, errorClass ?? null, responseDigest ?? null, id],
    );
    if (res.rows.length === 0) {
      throw new Error(`Publication attempt not found for id '${id}'.`);
    }
    return this.mapAttemptRow(res.rows[0]);
  }

  async findPublicationAttemptsByPackageId(packageId: string): Promise<readonly PublicationAttempt[]> {
    const res = await this.pool.query<AttemptRow>(
      "SELECT * FROM marketing_publication_attempts WHERE package_id = $1 ORDER BY started_at ASC",
      [packageId],
    );
    return res.rows.map((row) => this.mapAttemptRow(row));
  }

  async createPublicationRecord(record: PublicationRecord): Promise<PublicationRecord> {
    const res = await this.pool.query<RecordRow>(
      `INSERT INTO marketing_publication_records
       (id, package_id, target_id, platform, page_id, external_post_id, post_url,
        execution_mode, simulated, display_message,
        package_digest, content_digest, image_digest, target_digest,
        verified_at, provider_receipt_digest, verification_evidence_digest, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        record.id,
        record.packageId,
        record.targetId ?? null,
        record.platform,
        record.pageId,
        record.externalPostId,
        record.postUrl ?? null,
        record.executionMode ?? null,
        record.simulated ?? false,
        record.displayMessage ?? null,
        record.packageDigest,
        record.contentDigest,
        record.imageDigest ?? null,
        record.targetDigest ?? null,
        record.verifiedAt,
        record.providerReceiptDigest,
        record.verificationEvidenceDigest ?? null,
        record.createdAt,
      ],
    );
    return this.mapRecordRow(res.rows[0]);
  }

  async findPublicationRecordByPackageId(packageId: string): Promise<PublicationRecord | null> {
    const res = await this.pool.query<RecordRow>(
      "SELECT * FROM marketing_publication_records WHERE package_id = $1",
      [packageId],
    );
    return res.rows[0] ? this.mapRecordRow(res.rows[0]) : null;
  }

  async findPublicationRecordsByPackageId(packageId: string): Promise<readonly PublicationRecord[]> {
    const res = await this.pool.query<RecordRow>(
      "SELECT * FROM marketing_publication_records WHERE package_id = $1 ORDER BY created_at ASC",
      [packageId],
    );
    return res.rows.map((row) => this.mapRecordRow(row));
  }

  async findPublicationRecordByExternalPostId(
    platform: string,
    pageId: string,
    externalPostId: string,
  ): Promise<PublicationRecord | null> {
    const res = await this.pool.query<RecordRow>(
      "SELECT * FROM marketing_publication_records WHERE platform = $1 AND page_id = $2 AND external_post_id = $3",
      [platform, pageId, externalPostId],
    );
    return res.rows[0] ? this.mapRecordRow(res.rows[0]) : null;
  }

  async createArtifact(artifact: MarketingArtifact): Promise<MarketingArtifact> {
    const res = await this.pool.query<ArtifactRow>(
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
    return this.mapArtifactRow(res.rows[0]);
  }

  async findArtifactsByCampaignId(campaignId: string): Promise<readonly MarketingArtifact[]> {
    const res = await this.pool.query<ArtifactRow>(
      "SELECT * FROM marketing_artifacts WHERE campaign_id = $1 ORDER BY created_at ASC",
      [campaignId],
    );
    return res.rows.map((row) => this.mapArtifactRow(row));
  }

  async findArtifactById(id: string): Promise<MarketingArtifact | null> {
    const res = await this.pool.query<ArtifactRow>(
      "SELECT * FROM marketing_artifacts WHERE id = $1",
      [id],
    );
    return res.rows[0] ? this.mapArtifactRow(res.rows[0]) : null;
  }

  private mapCampaignRow(row: CampaignRow): MarketingCampaign {
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

  private mapBriefRow(row: BriefRow): CampaignBrief {
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
      prohibitedClaims: row.prohibited_claims,
      callToAction: row.call_to_action,
      facebookPageConfigurationId: row.facebook_page_configuration_id,
      scheduledFor: row.scheduled_for.toISOString(),
      deadline: row.deadline.toISOString(),
      approverId: row.approver_id,
      maximumCostMicros: Number(row.maximum_cost_micros),
      provenance: row.provenance,
      version: row.version,
      createdAt: row.created_at.toISOString(),
    };
  }

  private mapContentVersionRow(row: ContentVersionRow): ContentVersion {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      versionNumber: row.version_number,
      hook: row.hook,
      body: row.body,
      callToAction: row.call_to_action,
      hashtags: row.hashtags,
      visualDirection: row.visual_direction,
      factualClaimSourceIds: row.factual_claim_source_ids,
      contentDigest: row.content_digest,
      modelRunId: row.model_run_id,
      costMicros: Number(row.cost_micros),
      createdAt: row.created_at.toISOString(),
    };
  }

  private mapVisualAssetRow(row: VisualAssetRow): VisualAsset {
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

  private mapPackageRow(row: PackageRow, targets?: readonly PublicationTarget[]): PublicationPackage {
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
      targets: targets && targets.length > 0 ? targets : undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapTargetRow(row: TargetRow): PublicationTarget {
    return {
      id: row.id,
      packageId: row.package_id,
      platform: row.platform,
      format: row.format,
      accountConfigurationId: row.account_configuration_id,
      contentVersionId: row.content_version_id,
      mediaAssetIds: row.media_asset_ids || [],
      caption: row.caption,
      scheduledFor: row.scheduled_for.toISOString(),
      required: row.required,
      executionMode: row.execution_mode,
      contentDigest: row.content_digest,
      mediaDigest: row.media_digest,
      targetDigest: row.target_digest,
      status: row.status,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: row.lease_expires_at ? row.lease_expires_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapAttemptRow(row: AttemptRow): PublicationAttempt {
    return {
      id: row.id,
      packageId: row.package_id,
      targetId: row.target_id,
      attemptKey: row.attempt_key,
      platform: row.platform,
      pageConfigurationId: row.page_configuration_id,
      executionMode: row.execution_mode ?? undefined,
      simulated: row.simulated ?? false,
      status: row.status,
      errorCode: row.error_code,
      errorClass: row.error_class,
      responseDigest: row.response_digest,
      startedAt: row.started_at.toISOString(),
      finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    };
  }

  private mapRecordRow(row: RecordRow): PublicationRecord {
    return {
      id: row.id,
      packageId: row.package_id,
      targetId: row.target_id,
      platform: row.platform,
      pageId: row.page_id,
      externalPostId: row.external_post_id,
      postUrl: row.post_url,
      executionMode: row.execution_mode ?? undefined,
      simulated: row.simulated ?? false,
      displayMessage: row.display_message,
      packageDigest: row.package_digest,
      contentDigest: row.content_digest,
      imageDigest: row.image_digest,
      targetDigest: row.target_digest,
      verifiedAt: row.verified_at.toISOString(),
      providerReceiptDigest: row.provider_receipt_digest,
      verificationEvidenceDigest: row.verification_evidence_digest,
      createdAt: row.created_at.toISOString(),
    };
  }

  private mapArtifactRow(row: ArtifactRow): MarketingArtifact {
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
}
