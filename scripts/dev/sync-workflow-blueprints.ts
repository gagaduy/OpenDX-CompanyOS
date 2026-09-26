// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import {
  CUSTOMER_RECOVERY_WORKFLOW_FIXTURE,
  MARKETING_LAUNCH_WORKFLOW_FIXTURE,
  INVENTORY_REPLENISH_WORKFLOW_FIXTURE,
} from "../../apps/console/src/features/workflows/types";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://opendx_local:opendx_local_password@localhost:55432/opendx",
});

async function main() {
  console.log("Connecting to PostgreSQL to sync workflow blueprints...");

  const workflows = [
    {
      ...CUSTOMER_RECOVERY_WORKFLOW_FIXTURE,
      policyRules: {
        auto_approval_threshold: 2000000,
        currency: "VND",
        approval_gate_role: "support_manager",
      },
    },
    {
      ...MARKETING_LAUNCH_WORKFLOW_FIXTURE,
      policyRules: {
        mandatory_approval: true,
        approval_gate_role: "content_lead",
      },
    },
    {
      ...INVENTORY_REPLENISH_WORKFLOW_FIXTURE,
      policyRules: {
        auto_po_threshold: 10000000,
        currency: "VND",
        approval_gate_role: "finance_director",
      },
    },
  ];

  for (const wf of workflows) {
    console.log(`Syncing blueprint: ${wf.code} (${wf.name})...`);
    await pool.query(
      `
      INSERT INTO workflow_blueprints (
        id, code, name, category, description, target_outcome, version, status, policy_rules, nodes, edges, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, NOW())
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        target_outcome = EXCLUDED.target_outcome,
        version = EXCLUDED.version,
        status = EXCLUDED.status,
        policy_rules = EXCLUDED.policy_rules,
        nodes = EXCLUDED.nodes,
        edges = EXCLUDED.edges,
        updated_at = NOW();
    `,
      [
        wf.id,
        wf.code,
        wf.name,
        wf.category,
        wf.description,
        wf.targetOutcome,
        wf.version,
        wf.status,
        JSON.stringify(wf.policyRules),
        JSON.stringify(wf.nodes),
        JSON.stringify(wf.edges || []),
      ]
    );

    // If nodes were empty in database, explicitly update them
    await pool.query(
      `
      UPDATE workflow_blueprints
      SET nodes = $1::jsonb
      WHERE code = $2 AND (nodes IS NULL OR jsonb_array_length(nodes) = 0);
    `,
      [JSON.stringify(wf.nodes), wf.code]
    );
  }

  const result = await pool.query(
    "SELECT id, code, name, jsonb_array_length(nodes) as node_count, policy_rules FROM workflow_blueprints ORDER BY code;"
  );
  console.log("\nSync completed successfully! Current blueprints in DB:");
  console.table(result.rows);

  await pool.end();
}

main().catch((err) => {
  console.error("Error syncing blueprints:", err);
  process.exit(1);
});
