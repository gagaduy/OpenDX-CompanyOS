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
  "marketing_publication_targets",
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

  it("backfills legacy facebook package into publication target and rolls down safely", async () => {
    // 1. Roll back to 0
    await runMarketingMigrations(databaseUrl!, "down", 999_999);

    // 2. Migrate only 1 step up (legacy schema)
    await runMarketingMigrations(databaseUrl!, "up", 1);

    const legacyCampaignId = randomUUID();
    const legacyBriefId = randomUUID();
    const legacyContentId = randomUUID();
    const legacyVisualId = randomUUID();
    const legacyPackageId = randomUUID();
    const legacyAttemptId = randomUUID();
    const legacyRecordId = randomUUID();

    await pool.query(
      `INSERT INTO marketing_campaigns (id, state, assignment_mode, created_by, idempotency_key)
       VALUES ($1, 'reporting', 'direct_department', 'admin-legacy', 'idemp-legacy-1')`,
      [legacyCampaignId],
    );

    await pool.query(
      `INSERT INTO marketing_campaign_briefs
       (id, campaign_id, campaign_name, objective, subject_kind, subject_reference,
        language, mandatory_message, call_to_action, facebook_page_configuration_id,
        scheduled_for, deadline, approver_id, maximum_cost_micros)
       VALUES ($1, $2, 'Legacy Campaign', 'Objective', 'catalog_product', 'prod-leg',
               'vi', 'Legacy message', 'Buy now', 'page-cfg-legacy',
               '2026-08-30T10:00:00.000Z', '2026-08-30T20:00:00.000Z', 'approver-1', 500000)`,
      [legacyBriefId, legacyCampaignId],
    );

    const contentDigest = "a".repeat(64);
    await pool.query(
      `INSERT INTO marketing_content_versions
       (id, campaign_id, version_number, hook, body, call_to_action, visual_direction, content_digest)
       VALUES ($1, $2, 1, 'Legacy hook', 'Legacy body', 'CTA', 'Direction', $3)`,
      [legacyContentId, legacyCampaignId, contentDigest],
    );

    const imageDigest = "b".repeat(64);
    await pool.query(
      `INSERT INTO marketing_visual_assets
       (id, campaign_id, version_number, media_type, aspect_ratio, width, height, byte_size, image_digest, alt_text, storage_key)
       VALUES ($1, $2, 1, 'image/png', '1:1', 1024, 1024, 204800, $3, 'Alt', 'marketing/asset.png')`,
      [legacyVisualId, legacyCampaignId, imageDigest],
    );

    const packageDigest = "c".repeat(64);
    await pool.query(
      `INSERT INTO marketing_publication_packages
       (id, campaign_id, package_version, content_version_id, visual_asset_id,
        facebook_page_configuration_id, scheduled_for, content_digest, image_digest, package_digest, status)
       VALUES ($1, $2, 1, $3, $4, 'page-cfg-legacy', '2026-08-30T10:00:00.000Z', $5, $6, $7, 'approved')`,
      [legacyPackageId, legacyCampaignId, legacyContentId, legacyVisualId, contentDigest, imageDigest, packageDigest],
    );

    await pool.query(
      `INSERT INTO marketing_publication_attempts
       (id, package_id, attempt_key, platform, page_configuration_id, status)
       VALUES ($1, $2, 'legacy-attempt-1', 'facebook', 'page-cfg-legacy', 'succeeded')`,
      [legacyAttemptId, legacyPackageId],
    );

    await pool.query(
      `INSERT INTO marketing_publication_records
       (id, package_id, platform, page_id, external_post_id, post_url,
        package_digest, content_digest, image_digest, verified_at, provider_receipt_digest)
       VALUES ($1, $2, 'facebook', 'page-legacy-100', 'post-legacy-200', 'https://facebook.com/post-legacy-200',
               $3, $4, $5, '2026-08-30T10:05:00.000Z', $6)`,
      [legacyRecordId, legacyPackageId, packageDigest, contentDigest, imageDigest, "d".repeat(64)],
    );

    // 3. Migrate forward to latest (step 2)
    await runMarketingMigrations(databaseUrl!, "up");

    // 4. Assert exactly one backfilled target and target_id linkage
    const target = await pool.query(
      "SELECT * FROM marketing_publication_targets WHERE package_id = $1",
      [legacyPackageId],
    );
    expect(target.rows).toEqual([
      expect.objectContaining({
        package_id: legacyPackageId,
        platform: "facebook",
        format: "feed_image",
        execution_mode: "live",
        status: "verified",
      }),
    ]);

    const attempt = await pool.query(
      "SELECT * FROM marketing_publication_attempts WHERE id = $1",
      [legacyAttemptId],
    );
    const record = await pool.query(
      "SELECT * FROM marketing_publication_records WHERE id = $1",
      [legacyRecordId],
    );
    expect(attempt.rows[0]?.target_id).toBe(target.rows[0]?.id);
    expect(record.rows[0]?.target_id).toBe(target.rows[0]?.id);

    // 5. Roll down the latest provider-reference migration first
    await runMarketingMigrations(databaseUrl!, "down", 1);
    expect(
      (await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'marketing_publication_attempts'
           AND column_name = 'provider_reference'`,
      )).rows,
    ).toEqual([]);

    // 6. Roll down the publication-target migration
    await runMarketingMigrations(databaseUrl!, "down", 1);
    expect((await pool.query("SELECT to_regclass('public.marketing_publication_targets') AS name")).rows[0]).toEqual({ name: null });

    const legacyRecordAfterRollback = await pool.query(
      "SELECT * FROM marketing_publication_records WHERE id = $1",
      [legacyRecordId],
    );
    expect(legacyRecordAfterRollback.rows[0]?.package_id).toBe(legacyPackageId);

    // 7. Migrate up again
    await runMarketingMigrations(databaseUrl!, "up");
    expect((await pool.query("SELECT to_regclass('public.marketing_publication_targets') AS name")).rows[0]).toEqual({ name: "marketing_publication_targets" });
  });
});
