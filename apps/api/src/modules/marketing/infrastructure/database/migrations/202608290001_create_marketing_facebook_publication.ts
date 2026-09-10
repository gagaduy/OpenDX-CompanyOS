// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE marketing_campaigns (
      id uuid PRIMARY KEY,
      state text NOT NULL CHECK (state IN (
        'draft', 'validating', 'content_drafting', 'visual_creation',
        'campaign_review', 'awaiting_human_approval', 'revision_requested',
        'scheduled', 'publishing', 'publication_unknown',
        'verifying_publication', 'reporting', 'completed',
        'waiting_for_input', 'quality_escalated', 'blocked_credentials',
        'platform_rejected', 'schedule_missed', 'out_of_scope',
        'cross_department_coordination_required', 'failed', 'canceled'
      )),
      assignment_mode text NOT NULL CHECK (assignment_mode IN ('direct_department', 'ai_ceo')),
      created_by text NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 255),
      idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 255),
      source_task_id text,
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT marketing_campaigns_created_by_idempotency_key_key UNIQUE (created_by, idempotency_key)
    );
    CREATE INDEX marketing_campaigns_created_by_idx ON marketing_campaigns(created_by, created_at DESC);
    CREATE INDEX marketing_campaigns_state_idx ON marketing_campaigns(state);

    CREATE TABLE marketing_campaign_briefs (
      id uuid PRIMARY KEY,
      campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      campaign_name text NOT NULL CHECK (length(btrim(campaign_name)) BETWEEN 1 AND 500),
      objective text NOT NULL CHECK (length(btrim(objective)) BETWEEN 1 AND 2000),
      subject_kind text NOT NULL CHECK (subject_kind IN ('catalog_product', 'free_topic')),
      subject_reference text NOT NULL CHECK (length(btrim(subject_reference)) BETWEEN 1 AND 500),
      audience text,
      language text NOT NULL CHECK (language IN ('vi', 'en')),
      tone text,
      mandatory_message text NOT NULL CHECK (length(btrim(mandatory_message)) BETWEEN 1 AND 5000),
      prohibited_claims jsonb NOT NULL DEFAULT '[]'::jsonb,
      call_to_action text NOT NULL CHECK (length(btrim(call_to_action)) BETWEEN 1 AND 500),
      facebook_page_configuration_id text NOT NULL CHECK (length(btrim(facebook_page_configuration_id)) BETWEEN 1 AND 255),
      scheduled_for timestamptz NOT NULL,
      deadline timestamptz NOT NULL,
      approver_id text NOT NULL CHECK (length(btrim(approver_id)) BETWEEN 1 AND 255),
      maximum_cost_micros bigint NOT NULL CHECK (maximum_cost_micros > 0),
      provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT marketing_campaign_briefs_campaign_id_key UNIQUE (campaign_id)
    );

    CREATE TABLE marketing_content_versions (
      id uuid PRIMARY KEY,
      campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      version_number integer NOT NULL CHECK (version_number > 0),
      hook text NOT NULL CHECK (length(btrim(hook)) BETWEEN 1 AND 240),
      body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
      call_to_action text NOT NULL CHECK (length(btrim(call_to_action)) BETWEEN 1 AND 300),
      hashtags jsonb NOT NULL DEFAULT '[]'::jsonb,
      visual_direction text NOT NULL CHECK (length(btrim(visual_direction)) BETWEEN 1 AND 1000),
      factual_claim_source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      content_digest text NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
      model_run_id text,
      cost_micros bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT marketing_content_versions_campaign_version_key UNIQUE (campaign_id, version_number)
    );

    CREATE TABLE marketing_visual_assets (
      id uuid PRIMARY KEY,
      campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      version_number integer NOT NULL CHECK (version_number > 0),
      media_type text NOT NULL CHECK (media_type = 'image/png'),
      aspect_ratio text NOT NULL CHECK (aspect_ratio = '1:1'),
      width integer NOT NULL CHECK (width > 0),
      height integer NOT NULL CHECK (height > 0),
      byte_size integer NOT NULL CHECK (byte_size > 0),
      image_digest text NOT NULL CHECK (image_digest ~ '^[a-f0-9]{64}$'),
      alt_text text NOT NULL CHECK (length(btrim(alt_text)) BETWEEN 1 AND 1000),
      storage_key text NOT NULL CHECK (length(btrim(storage_key)) BETWEEN 1 AND 500),
      model_run_id text,
      cost_micros bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT marketing_visual_assets_campaign_version_key UNIQUE (campaign_id, version_number)
    );

    CREATE TABLE marketing_publication_packages (
      id uuid PRIMARY KEY,
      campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      package_version integer NOT NULL CHECK (package_version > 0),
      content_version_id uuid NOT NULL REFERENCES marketing_content_versions(id),
      visual_asset_id uuid NOT NULL REFERENCES marketing_visual_assets(id),
      facebook_page_configuration_id text NOT NULL CHECK (length(btrim(facebook_page_configuration_id)) BETWEEN 1 AND 255),
      scheduled_for timestamptz NOT NULL,
      content_digest text NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
      image_digest text NOT NULL CHECK (image_digest ~ '^[a-f0-9]{64}$') ,
      package_digest text NOT NULL CHECK (package_digest ~ '^[a-f0-9]{64}$'),
      status text NOT NULL CHECK (status IN ('draft', 'submitted_for_approval', 'approved', 'rejected', 'superseded')),
      approval_request_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT marketing_publication_packages_campaign_version_key UNIQUE (campaign_id, package_version)
    );

    CREATE TABLE marketing_publication_attempts (
      id uuid PRIMARY KEY,
      package_id uuid NOT NULL REFERENCES marketing_publication_packages(id) ON DELETE CASCADE,
      attempt_key text NOT NULL UNIQUE CHECK (length(btrim(attempt_key)) BETWEEN 1 AND 255),
      platform text NOT NULL CHECK (platform = 'facebook'),
      page_configuration_id text NOT NULL CHECK (length(btrim(page_configuration_id)) BETWEEN 1 AND 255),
      status text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'unknown')),
      error_code text,
      error_class text,
      response_digest text,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz
    );

    CREATE TABLE marketing_publication_records (
      id uuid PRIMARY KEY,
      package_id uuid NOT NULL UNIQUE REFERENCES marketing_publication_packages(id) ON DELETE CASCADE,
      platform text NOT NULL CHECK (platform = 'facebook'),
      page_id text NOT NULL CHECK (length(btrim(page_id)) BETWEEN 1 AND 255),
      external_post_id text NOT NULL CHECK (length(btrim(external_post_id)) BETWEEN 1 AND 255),
      post_url text NOT NULL CHECK (length(btrim(post_url)) BETWEEN 1 AND 1000),
      package_digest text NOT NULL CHECK (package_digest ~ '^[a-f0-9]{64}$'),
      content_digest text NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
      image_digest text NOT NULL CHECK (image_digest ~ '^[a-f0-9]{64}$'),
      verified_at timestamptz NOT NULL,
      provider_receipt_digest text NOT NULL CHECK (provider_receipt_digest ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT marketing_publication_records_external_post_key UNIQUE (platform, page_id, external_post_id)
    );

    CREATE TABLE marketing_artifacts (
      id uuid PRIMARY KEY,
      campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN (
        'campaign_brief_docx', 'facebook_content_docx', 'facebook_visual_png',
        'facebook_publication_log_xlsx', 'marketing_final_report_pdf'
      )),
      filename text NOT NULL CHECK (length(btrim(filename)) BETWEEN 1 AND 255),
      media_type text NOT NULL CHECK (length(btrim(media_type)) BETWEEN 1 AND 255),
      byte_size bigint NOT NULL CHECK (byte_size > 0),
      sha256_digest text NOT NULL CHECK (sha256_digest ~ '^[a-f0-9]{64}$'),
      storage_key text NOT NULL CHECK (length(btrim(storage_key)) BETWEEN 1 AND 500),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT marketing_artifacts_campaign_kind_key UNIQUE (campaign_id, kind)
    );
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE IF EXISTS marketing_artifacts CASCADE;
    DROP TABLE IF EXISTS marketing_publication_records CASCADE;
    DROP TABLE IF EXISTS marketing_publication_attempts CASCADE;
    DROP TABLE IF EXISTS marketing_publication_packages CASCADE;
    DROP TABLE IF EXISTS marketing_visual_assets CASCADE;
    DROP TABLE IF EXISTS marketing_content_versions CASCADE;
    DROP TABLE IF EXISTS marketing_campaign_briefs CASCADE;
    DROP TABLE IF EXISTS marketing_campaigns CASCADE;
  `);
}
