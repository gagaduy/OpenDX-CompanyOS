// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    -- 1. Evolve campaign state check
    ALTER TABLE marketing_campaigns
      DROP CONSTRAINT IF EXISTS marketing_campaigns_state_check;
    ALTER TABLE marketing_campaigns
      ADD CONSTRAINT marketing_campaigns_state_check CHECK (state IN (
        'draft', 'validating', 'content_drafting', 'visual_creation',
        'campaign_review', 'awaiting_human_approval', 'revision_requested',
        'scheduled', 'publishing', 'publication_unknown',
        'verifying_publication', 'reporting', 'completed', 'partial_failure',
        'waiting_for_input', 'quality_escalated', 'blocked_credentials',
        'platform_rejected', 'schedule_missed', 'out_of_scope',
        'cross_department_coordination_required', 'failed', 'canceled'
      ));

    -- 2. Evolve visual asset aspect ratio
    ALTER TABLE marketing_visual_assets
      DROP CONSTRAINT IF EXISTS marketing_visual_assets_aspect_ratio_check;
    ALTER TABLE marketing_visual_assets
      ADD CONSTRAINT marketing_visual_assets_aspect_ratio_check CHECK (aspect_ratio IN ('1:1', '9:16'));

    -- 3. Evolve artifacts kind
    ALTER TABLE marketing_artifacts
      DROP CONSTRAINT IF EXISTS marketing_artifacts_kind_check;
    ALTER TABLE marketing_artifacts
      ADD CONSTRAINT marketing_artifacts_kind_check CHECK (kind IN (
        'campaign_brief_docx', 'facebook_content_docx', 'facebook_visual_png',
        'facebook_publication_log_xlsx', 'social_content_docx', 'social_visual_png',
        'social_publication_log_xlsx', 'marketing_final_report_pdf'
      ));

    -- 4. Relax legacy columns in brief and package
    ALTER TABLE marketing_campaign_briefs
      ALTER COLUMN facebook_page_configuration_id DROP NOT NULL;
    ALTER TABLE marketing_publication_packages
      ALTER COLUMN visual_asset_id DROP NOT NULL,
      ALTER COLUMN facebook_page_configuration_id DROP NOT NULL,
      ALTER COLUMN image_digest DROP NOT NULL;

    -- 5. Create marketing_publication_targets
    CREATE TABLE marketing_publication_targets (
      id uuid PRIMARY KEY,
      package_id uuid NOT NULL REFERENCES marketing_publication_packages(id) ON DELETE CASCADE,
      platform text NOT NULL CHECK (platform IN ('facebook', 'instagram')),
      format text NOT NULL CHECK (format IN (
        'feed_image', 'story_image', 'image_carousel',
        'feed_video', 'story_video', 'reel_video'
      )),
      account_configuration_id text NOT NULL CHECK (length(btrim(account_configuration_id)) BETWEEN 1 AND 255),
      content_version_id uuid NOT NULL REFERENCES marketing_content_versions(id),
      media_asset_ids uuid[] NOT NULL DEFAULT '{}',
      caption text NOT NULL CHECK (length(btrim(caption)) BETWEEN 1 AND 5000),
      scheduled_for timestamptz NOT NULL,
      required boolean NOT NULL DEFAULT true,
      execution_mode text NOT NULL CHECK (execution_mode IN ('live', 'simulation')),
      content_digest text NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
      media_digest text NOT NULL CHECK (media_digest ~ '^[a-f0-9]{64}$'),
      target_digest text NOT NULL CHECK (target_digest ~ '^[a-f0-9]{64}$'),
      status text NOT NULL CHECK (status IN (
        'pending_approval', 'approved', 'scheduled', 'claimed',
        'publishing', 'publication_unknown', 'verified',
        'platform_rejected', 'failed'
      )),
      lease_owner text,
      lease_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT marketing_publication_targets_package_digest_key UNIQUE (package_id, target_digest)
    );

    CREATE INDEX marketing_publication_targets_due_idx ON marketing_publication_targets (status, scheduled_for);
    CREATE INDEX marketing_publication_targets_lease_idx ON marketing_publication_targets (lease_expires_at);
    CREATE INDEX marketing_publication_targets_package_idx ON marketing_publication_targets (package_id);

    -- 6. Evolve publication attempts
    ALTER TABLE marketing_publication_attempts
      ADD COLUMN target_id uuid REFERENCES marketing_publication_targets(id) ON DELETE CASCADE,
      ADD COLUMN execution_mode text CHECK (execution_mode IN ('live', 'simulation')),
      ADD COLUMN simulated boolean DEFAULT false;

    ALTER TABLE marketing_publication_attempts
      DROP CONSTRAINT IF EXISTS marketing_publication_attempts_platform_check;
    ALTER TABLE marketing_publication_attempts
      ADD CONSTRAINT marketing_publication_attempts_platform_check CHECK (platform IN ('facebook', 'instagram'));

    -- 7. Evolve publication records
    ALTER TABLE marketing_publication_records
      DROP CONSTRAINT IF EXISTS marketing_publication_records_package_id_key,
      ADD COLUMN target_id uuid REFERENCES marketing_publication_targets(id) ON DELETE CASCADE,
      ADD COLUMN execution_mode text CHECK (execution_mode IN ('live', 'simulation')),
      ADD COLUMN simulated boolean DEFAULT false,
      ADD COLUMN display_message text,
      ADD COLUMN target_digest text CHECK (target_digest ~ '^[a-f0-9]{64}$'),
      ADD COLUMN verification_evidence_digest text;

    ALTER TABLE marketing_publication_records
      ALTER COLUMN image_digest DROP NOT NULL,
      ALTER COLUMN post_url DROP NOT NULL;

    ALTER TABLE marketing_publication_records
      DROP CONSTRAINT IF EXISTS marketing_publication_records_platform_check;
    ALTER TABLE marketing_publication_records
      ADD CONSTRAINT marketing_publication_records_platform_check CHECK (platform IN ('facebook', 'instagram'));

    ALTER TABLE marketing_publication_records
      ADD CONSTRAINT marketing_publication_records_target_id_key UNIQUE (target_id);

    -- 8. Backfill legacy packages into targets
    INSERT INTO marketing_publication_targets (
      id, package_id, platform, format, account_configuration_id,
      content_version_id, media_asset_ids, caption, scheduled_for,
      required, execution_mode, content_digest, media_digest, target_digest,
      status, created_at, updated_at
    )
    SELECT
      p.id AS id,
      p.id AS package_id,
      'facebook' AS platform,
      'feed_image' AS format,
      COALESCE(p.facebook_page_configuration_id, 'facebook-default') AS account_configuration_id,
      p.content_version_id,
      CASE WHEN p.visual_asset_id IS NOT NULL THEN ARRAY[p.visual_asset_id] ELSE '{}'::uuid[] END AS media_asset_ids,
      COALESCE(c.body, 'Legacy publication') AS caption,
      p.scheduled_for,
      true AS required,
      'live' AS execution_mode,
      p.content_digest,
      COALESCE(p.image_digest, p.content_digest) AS media_digest,
      p.package_digest AS target_digest,
      CASE
        WHEN r.id IS NOT NULL THEN 'verified'
        WHEN p.status = 'approved' THEN 'scheduled'
        WHEN p.status = 'submitted_for_approval' THEN 'pending_approval'
        ELSE 'pending_approval'
      END AS status,
      p.created_at,
      p.updated_at
    FROM marketing_publication_packages p
    LEFT JOIN marketing_content_versions c ON c.id = p.content_version_id
    LEFT JOIN marketing_publication_records r ON r.package_id = p.id
    ON CONFLICT DO NOTHING;

    -- Backfill attempt and record foreign keys
    UPDATE marketing_publication_attempts a
    SET target_id = t.id
    FROM marketing_publication_targets t
    WHERE a.package_id = t.package_id AND a.target_id IS NULL;

    UPDATE marketing_publication_records r
    SET target_id = t.id,
        target_digest = t.target_digest
    FROM marketing_publication_targets t
    WHERE r.package_id = t.package_id AND r.target_id IS NULL;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    -- Clean up multiple records per package before restoring unique(package_id)
    DELETE FROM marketing_publication_records
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY created_at ASC) as rn
        FROM marketing_publication_records
      ) sub WHERE rn > 1
    );

    -- Revert publication records
    ALTER TABLE marketing_publication_records
      DROP CONSTRAINT IF EXISTS marketing_publication_records_target_id_key,
      DROP COLUMN IF EXISTS target_id,
      DROP COLUMN IF EXISTS execution_mode,
      DROP COLUMN IF EXISTS simulated,
      DROP COLUMN IF EXISTS display_message,
      DROP COLUMN IF EXISTS target_digest,
      DROP COLUMN IF EXISTS verification_evidence_digest;

    ALTER TABLE marketing_publication_records
      ADD CONSTRAINT marketing_publication_records_package_id_key UNIQUE (package_id);

    -- Revert publication attempts
    ALTER TABLE marketing_publication_attempts
      DROP COLUMN IF EXISTS target_id,
      DROP COLUMN IF EXISTS execution_mode,
      DROP COLUMN IF EXISTS simulated;

    -- Drop targets table
    DROP TABLE IF EXISTS marketing_publication_targets CASCADE;

    -- Revert artifacts kind check
    ALTER TABLE marketing_artifacts
      DROP CONSTRAINT IF EXISTS marketing_artifacts_kind_check;
    ALTER TABLE marketing_artifacts
      ADD CONSTRAINT marketing_artifacts_kind_check CHECK (kind IN (
        'campaign_brief_docx', 'facebook_content_docx', 'facebook_visual_png',
        'facebook_publication_log_xlsx', 'marketing_final_report_pdf'
      ));

    -- Revert visual asset aspect ratio
    ALTER TABLE marketing_visual_assets
      DROP CONSTRAINT IF EXISTS marketing_visual_assets_aspect_ratio_check;
    ALTER TABLE marketing_visual_assets
      ADD CONSTRAINT marketing_visual_assets_aspect_ratio_check CHECK (aspect_ratio = '1:1');

    -- Revert campaign state check
    ALTER TABLE marketing_campaigns
      DROP CONSTRAINT IF EXISTS marketing_campaigns_state_check;
    ALTER TABLE marketing_campaigns
      ADD CONSTRAINT marketing_campaigns_state_check CHECK (state IN (
        'draft', 'validating', 'content_drafting', 'visual_creation',
        'campaign_review', 'awaiting_human_approval', 'revision_requested',
        'scheduled', 'publishing', 'publication_unknown',
        'verifying_publication', 'reporting', 'completed',
        'waiting_for_input', 'quality_escalated', 'blocked_credentials',
        'platform_rejected', 'schedule_missed', 'out_of_scope',
        'cross_department_coordination_required', 'failed', 'canceled'
      ));
  `);
}
