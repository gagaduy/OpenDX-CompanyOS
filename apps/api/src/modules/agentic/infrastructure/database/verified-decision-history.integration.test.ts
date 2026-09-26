// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { assertIntegrationEnvironment } from "../../../../shared/testing/assert-integration-environment";
import { createMarketingDecisionHistoryReader } from "../../../marketing";
import { createCatalogDecisionHistoryReader } from "../../../catalog";
import { createInventoryDecisionHistoryReader } from "../../../inventory";
import { createSupportDecisionHistoryReader } from "../../../support";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("verified department decision history", () => {
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  afterAll(async () => pool.end());

  it("projects only source-verified decisions, preserving source time and unknown actors", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE marketing_campaigns (id uuid, state text, updated_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE marketing_campaign_briefs (campaign_id uuid, campaign_name text) ON COMMIT DROP;
        CREATE TEMP TABLE marketing_publication_packages (id uuid, campaign_id uuid, status text, approval_request_id text, updated_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE merchandising_campaigns (id uuid, name text) ON COMMIT DROP;
        CREATE TEMP TABLE audit_events (id text, resource_id text, actor_id text, action text, resource_type text, outcome text, occurred_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE inventory_replenishment_proposals (id uuid, status text, summary text, reviewed_at timestamptz, reviewed_by text) ON COMMIT DROP;
        CREATE TEMP TABLE support_ticket_events (id uuid, ticket_id uuid, actor_id text, idempotency_key text, occurred_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE support_ai_proposal_decisions (id uuid, proposal_id text, actor_id text, occurred_at timestamptz) ON COMMIT DROP;
      `);
      const campaign = "00000000-0000-4000-8000-000000000001";
      const canceled = "00000000-0000-4000-8000-000000000002";
      const merch = "00000000-0000-4000-8000-000000000003";
      const inventory = "00000000-0000-4000-8000-000000000004";
      const support = "00000000-0000-4000-8000-000000000005";
      await client.query("INSERT INTO marketing_campaigns VALUES ($1, 'completed', '2026-09-14T09:00Z'), ($2, 'canceled', '2026-09-14T10:00Z')", [campaign, canceled]);
      await client.query("INSERT INTO marketing_campaign_briefs VALUES ($1, 'Approved campaign'), ($2, 'Canceled campaign')", [campaign, canceled]);
      await client.query("INSERT INTO marketing_publication_packages VALUES ($1, $2, 'approved', 'staff-marketing', '2026-09-14T09:00Z'), ($3, $2, 'draft', NULL, '2026-09-14T11:00Z')", ["00000000-0000-4000-8000-000000000010", campaign, "00000000-0000-4000-8000-000000000011"]);
      await client.query("INSERT INTO merchandising_campaigns VALUES ($1, 'Merch campaign')", [merch]);
      await client.query("INSERT INTO audit_events VALUES ('audit-approved', $1, 'staff-merch', 'catalog.campaign.activated', 'campaign', 'success', '2026-09-14T08:00Z'), ('audit-reverted', $1, 'staff-merch', 'catalog.campaign.reverted', 'campaign', 'success', '2026-09-14T12:00Z')", [merch]);
      await client.query("INSERT INTO inventory_replenishment_proposals VALUES ($1, 'approved', 'Restock', '2026-09-14T07:00Z', 'staff-ops'), ($2, 'pending_review', 'Draft restock', NULL, NULL)", [inventory, campaign]);
      await client.query("INSERT INTO support_ticket_events VALUES ($1, $2, 'support-ai-steward', $3, '2026-09-14T06:00Z'), ($4, $5, 'staff-agent', 'ordinary-resolve', '2026-09-14T13:00Z')", ["00000000-0000-4000-8000-000000000012", campaign, `ai_resolve:${support}:${campaign}:1`, "00000000-0000-4000-8000-000000000013", canceled]);
      await client.query("INSERT INTO support_ai_proposal_decisions VALUES ($1, $2, 'staff-support', '2026-09-14T05:00Z')", ["00000000-0000-4000-8000-000000000014", "00000000-0000-4000-8000-000000000015"]);
      const session = { query: async <Row extends object>(sql: string, values?: readonly unknown[]) => {
        const result = await client.query<Row>(sql, values as unknown[]);
        return { rows: result.rows, rowCount: result.rowCount ?? 0 };
      } };
      const readers = [createMarketingDecisionHistoryReader(), createCatalogDecisionHistoryReader(), createInventoryDecisionHistoryReader(), createSupportDecisionHistoryReader()];
      const events = [];
      for (const reader of readers) events.push(...await reader.listRecent(session, 30));
      expect(events.map((event) => `${event.department}:${event.decision}`).sort()).toEqual([
        "marketing:approved", "marketing:canceled", "merchandising:approved", "operations:approved", "support:approved", "support:canceled",
      ]);
      expect(events.find((event) => event.department === "support" && event.decision === "approved")).toMatchObject({
        resourceId: support, occurredAt: "2026-09-14T06:00:00.000Z", sourceTable: "support_ticket_events",
      });
      expect(events.find((event) => event.department === "marketing" && event.decision === "canceled")?.actorId).toBeUndefined();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
