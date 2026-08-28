// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { assertIntegrationEnvironment } from "../../../../shared/testing/assert-integration-environment";
import { runMarketingMigrations } from "./run-marketing-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

const tables = [
  "marketing_campaigns",
  "marketing_campaign_briefs",
  "marketing_content_versions",
  "marketing_visual_assets",
  "marketing_publication_packages",
  "marketing_publication_attempts",
  "marketing_publication_records",
  "marketing_artifacts",
] as const;

suite("Marketing publication migration", () => {
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });

  afterAll(async () => {
    await runMarketingMigrations(databaseUrl!, "down", 999_999).catch(() => undefined);
    await pool.end();
  });

  it("creates, rolls back, and reapplies the marketing publication schema", async () => {
    await runMarketingMigrations(databaseUrl!, "up");

    const actual = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name",
      [tables],
    );
    expect(actual.rows.map(({ table_name }) => table_name)).toEqual([...tables].sort());

    await runMarketingMigrations(databaseUrl!, "down", 999_999);
    for (const table of tables) {
      expect((await pool.query(`SELECT to_regclass('public.${table}') AS name`)).rows[0]).toEqual({ name: null });
    }

    await runMarketingMigrations(databaseUrl!, "up");
    for (const table of tables) {
      expect((await pool.query(`SELECT to_regclass('public.${table}') AS name`)).rows[0]).toEqual({ name: table });
    }
  });

  it("enforces unique constraints and foreign keys", async () => {
    const campaignId = randomUUID();
    const briefId = randomUUID();
    const contentId = randomUUID();
    const visualId = randomUUID();
    const packageId = randomUUID();
    const attemptId = randomUUID();
    const recordId = randomUUID();
    const artifactId = randomUUID();

    // 1. Insert campaign
    await pool.query(
      `INSERT INTO marketing_campaigns (id, state, assignment_mode, created_by, idempotency_key)
       VALUES ($1, 'draft', 'direct_department', 'admin-1', 'idemp-1')`,
      [campaignId],
    );

    // Duplicate idempotency_key for same user must fail
    await expect(
      pool.query(
        `INSERT INTO marketing_campaigns (id, state, assignment_mode, created_by, idempotency_key)
         VALUES ($1, 'draft', 'direct_department', 'admin-1', 'idemp-1')`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    // 2. Insert brief
    await pool.query(
      `INSERT INTO marketing_campaign_briefs
       (id, campaign_id, campaign_name, objective, subject_kind, subject_reference,
        language, mandatory_message, call_to_action, facebook_page_configuration_id,
        scheduled_for, deadline, approver_id, maximum_cost_micros)
       VALUES ($1, $2, 'Launch NovaPhone', 'Promote new phone', 'catalog_product', 'prod-1',
               'vi', 'Special discount', 'Buy now', 'page-cfg-1',
               '2026-08-30T10:00:00.000Z', '2026-08-30T20:00:00.000Z', 'approver-1', 500000)`,
      [briefId, campaignId],
    );

    // Duplicate brief for same campaign must fail
    await expect(
      pool.query(
        `INSERT INTO marketing_campaign_briefs
         (id, campaign_id, campaign_name, objective, subject_kind, subject_reference,
          language, mandatory_message, call_to_action, facebook_page_configuration_id,
          scheduled_for, deadline, approver_id, maximum_cost_micros)
         VALUES ($1, $2, 'Another Brief', 'Objective', 'free_topic', 'topic-1',
                 'en', 'Message', 'CTA', 'page-cfg-1',
                 '2026-08-30T10:00:00.000Z', '2026-08-30T20:00:00.000Z', 'approver-1', 500000)`,
        [randomUUID(), campaignId],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    // 3. Insert content version
    const contentDigest = "a".repeat(64);
    await pool.query(
      `INSERT INTO marketing_content_versions
       (id, campaign_id, version_number, hook, body, call_to_action, visual_direction, content_digest)
       VALUES ($1, $2, 1, 'Hot launch', 'Full body text here', 'Shop today', 'Realistic phone render', $3)`,
      [contentId, campaignId, contentDigest],
    );

    // Duplicate content version_number for same campaign must fail
    await expect(
      pool.query(
        `INSERT INTO marketing_content_versions
         (id, campaign_id, version_number, hook, body, call_to_action, visual_direction, content_digest)
         VALUES ($1, $2, 1, 'Another hook', 'Body text', 'CTA', 'Direction', $3)`,
        [randomUUID(), campaignId, contentDigest],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    // 4. Insert visual asset
    const imageDigest = "b".repeat(64);
    await pool.query(
      `INSERT INTO marketing_visual_assets
       (id, campaign_id, version_number, media_type, aspect_ratio, width, height, byte_size, image_digest, alt_text, storage_key)
       VALUES ($1, $2, 1, 'image/png', '1:1', 1024, 1024, 204800, $3, 'Phone visual', 'marketing/asset1.png')`,
      [visualId, campaignId, imageDigest],
    );

    // 5. Insert publication package
    const packageDigest = "c".repeat(64);
    await pool.query(
      `INSERT INTO marketing_publication_packages
       (id, campaign_id, package_version, content_version_id, visual_asset_id,
        facebook_page_configuration_id, scheduled_for, content_digest, image_digest, package_digest, status)
       VALUES ($1, $2, 1, $3, $4, 'page-cfg-1', '2026-08-30T10:00:00.000Z', $5, $6, $7, 'draft')`,
      [packageId, campaignId, contentId, visualId, contentDigest, imageDigest, packageDigest],
    );

    // 6. Insert publication attempt
    await pool.query(
      `INSERT INTO marketing_publication_attempts
       (id, package_id, attempt_key, platform, page_configuration_id, status)
       VALUES ($1, $2, 'attempt-key-1', 'facebook', 'page-cfg-1', 'started')`,
      [attemptId, packageId],
    );

    // Duplicate attempt_key must fail
    await expect(
      pool.query(
        `INSERT INTO marketing_publication_attempts
         (id, package_id, attempt_key, platform, page_configuration_id, status)
         VALUES ($1, $2, 'attempt-key-1', 'facebook', 'page-cfg-1', 'started')`,
        [randomUUID(), packageId],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    // 7. Insert publication record
    const receiptDigest = "d".repeat(64);
    await pool.query(
      `INSERT INTO marketing_publication_records
       (id, package_id, platform, page_id, external_post_id, post_url,
        package_digest, content_digest, image_digest, verified_at, provider_receipt_digest)
       VALUES ($1, $2, 'facebook', 'page-100', 'post-200', 'https://facebook.com/post-200',
               $3, $4, $5, '2026-08-30T10:05:00.000Z', $6)`,
      [recordId, packageId, packageDigest, contentDigest, imageDigest, receiptDigest],
    );

    // Duplicate (platform, page_id, external_post_id) must fail
    await expect(
      pool.query(
        `INSERT INTO marketing_publication_records
         (id, package_id, platform, page_id, external_post_id, post_url,
          package_digest, content_digest, image_digest, verified_at, provider_receipt_digest)
         VALUES ($1, $2, 'facebook', 'page-100', 'post-200', 'https://facebook.com/post-200-dup',
                 $3, $4, $5, '2026-08-30T10:05:00.000Z', $6)`,
        [randomUUID(), packageId, packageDigest, contentDigest, imageDigest, receiptDigest],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    // 8. Insert artifact
    await pool.query(
      `INSERT INTO marketing_artifacts
       (id, campaign_id, kind, filename, media_type, byte_size, sha256_digest, storage_key)
       VALUES ($1, $2, 'campaign_brief_docx', 'campaign-brief.docx', 'application/docx', 1024, $3, 'marketing/brief.docx')`,
      [artifactId, campaignId, "e".repeat(64)],
    );

    // Duplicate artifact kind for same campaign must fail
    await expect(
      pool.query(
        `INSERT INTO marketing_artifacts
         (id, campaign_id, kind, filename, media_type, byte_size, sha256_digest, storage_key)
         VALUES ($1, $2, 'campaign_brief_docx', 'another.docx', 'application/docx', 1024, $3, 'marketing/another.docx')`,
        [randomUUID(), campaignId, "f".repeat(64)],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    // 9. Cascade delete test: Deleting campaign cascades to all child tables
    await pool.query("DELETE FROM marketing_campaigns WHERE id = $1", [campaignId]);

    expect((await pool.query("SELECT id FROM marketing_campaign_briefs WHERE id = $1", [briefId])).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM marketing_content_versions WHERE id = $1", [contentId])).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM marketing_visual_assets WHERE id = $1", [visualId])).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM marketing_publication_packages WHERE id = $1", [packageId])).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM marketing_publication_attempts WHERE id = $1", [attemptId])).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM marketing_publication_records WHERE id = $1", [recordId])).rowCount).toBe(0);
    expect((await pool.query("SELECT id FROM marketing_artifacts WHERE id = $1", [artifactId])).rowCount).toBe(0);
  });
});
