// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const keycloakUrl = process.env.KEYCLOAK_URL ?? process.env.AGENTIC_CHECK_KEYCLOAK_URL ?? "http://localhost:8081";
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

function psql(query) {
  const result = spawnSync("docker", [
    "compose",
    "--env-file", ".env",
    "-f", "infra/docker/docker-compose.yml",
    "exec", "-T", "postgres",
    "psql", "-U", "opendx_local", "-d", "opendx", "-Atqc", query,
  ], { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function getAdminToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "opendx-lifecycle-check",
    username: "admin@novacommerce.example",
    password: "opendx_admin_change_me",
  });

  const response = await fetch(`${keycloakUrl}/realms/opendx/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await response.json();
  assert.equal(response.status, 200, `Keycloak login failed: ${JSON.stringify(payload)}`);
  assert.ok(payload.access_token, "No access token in response");
  return payload.access_token;
}

async function main() {
  console.log("🚀 [E2E] Starting Dynamic Campaign Engine Verification...");

  // 1. Authenticate with Keycloak
  console.log("🔑 [1/6] Authenticating as Admin via Keycloak...");
  const token = await getAdminToken();
  console.log("   ✓ Acquired staff token successfully.");

  // 2. Generate dynamic campaign proposal
  console.log("🤖 [2/6] Generating Campaign Proposal with arbitrary prompt & theme...");
  const prompt = "Giảm giá 25% các dòng sản phẩm nhân dịp Tết Trung Thu trong 3 ngày";
  const genRes = await fetch(`${apiUrl}/v1/admin/catalog/ai-merchandising/campaigns/generate-proposal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-correlation-id": "e2e-campaign-test",
    },
    body: JSON.stringify({ prompt }),
  });

  const rawText = await genRes.text();
  assert.equal(genRes.status, 200, `Generate proposal returned ${genRes.status}: ${rawText}`);
  const proposal = JSON.parse(rawText);
  console.log(`   ✓ Proposal created: ID=${proposal.id}, Name="${proposal.name}"`);
  console.log(`   ✓ ThemeKey: ${proposal.themeKey}, Discount: ${proposal.discountPercent}%, Duration: ${proposal.durationDays} days`);

  assert.equal(proposal.status, "draft");
  assert.equal(proposal.themeKey, "mid_autumn");
  assert.equal(proposal.discountPercent, 25);
  assert.equal(proposal.durationDays, 3);
  assert.ok(proposal.items.length > 0, "Proposal items should not be empty");

  for (const item of proposal.items) {
    const expectedCampaignPrice = Math.round((item.originalPriceVnd * 75) / 100);
    assert.equal(item.campaignPriceVnd, expectedCampaignPrice, `Price calculation mismatch for ${item.productName}`);
  }
  console.log(`   ✓ Verified exact price math for all ${proposal.items.length} items (-25%).`);

  // 3. Activate campaign
  console.log(`🚀 [3/6] Activating Campaign ID=${proposal.id}...`);
  const activateRes = await fetch(`${apiUrl}/v1/admin/catalog/ai-merchandising/campaigns/${proposal.id}/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-correlation-id": "e2e-campaign-activate",
    },
    body: JSON.stringify({}),
  });

  const activateRaw = await activateRes.text();
  assert.equal(activateRes.status, 200, `Activate failed: ${activateRaw}`);
  const activateResult = JSON.parse(activateRaw);
  assert.equal(activateResult.success, true);
  console.log("   ✓ Campaign successfully activated!");

  // 4. Verify in PostgreSQL (product_prices SCD Type 2)
  console.log("🗄️ [4/6] Verifying SCD Type 2 price truth in PostgreSQL...");
  const firstItem = proposal.items[0];
  const activePriceQuery = `
    SELECT amount_minor, valid_from <= NOW() as valid_from_ok, valid_to > NOW() as valid_to_ok
    FROM product_prices
    WHERE variant_id = '${firstItem.variantId}'
      AND valid_from <= NOW()
      AND (valid_to IS NULL OR valid_to > NOW())
    ORDER BY valid_from DESC, id DESC
    LIMIT 1;
  `;
  const dbPriceRow = psql(activePriceQuery);
  console.log("   ✓ DB Active Price:", dbPriceRow);
  assert.ok(dbPriceRow.includes(String(firstItem.campaignPriceVnd)), `DB active price must match campaign price (${firstItem.campaignPriceVnd})`);

  // 5. Verify Active Campaign endpoint returns countdown
  console.log("⏱️ [5/6] Verifying Active Campaign Monitor endpoint...");
  const activeRes = await fetch(`${apiUrl}/v1/admin/catalog/ai-merchandising/campaigns/active`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-correlation-id": "e2e-campaign-active",
    },
  });
  assert.equal(activeRes.status, 200);
  const activeData = await activeRes.json();
  assert.ok(activeData, "Active campaign data must exist");
  assert.equal(activeData.id, proposal.id);
  assert.ok(activeData.remainingMs > 0, "Remaining milliseconds must be positive");
  console.log(`   ✓ Active campaign confirmed: ${activeData.name}, remainingMs=${activeData.remainingMs}`);

  // 6. Emergency Revert and price restoration
  console.log("🛑 [6/6] Triggering Emergency Revert and verifying baseline price restoration...");
  const revertRes = await fetch(`${apiUrl}/v1/admin/catalog/ai-merchandising/campaigns/${proposal.id}/revert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-correlation-id": "e2e-campaign-revert",
    },
    body: JSON.stringify({}),
  });

  const revertRaw = await revertRes.text();
  assert.equal(revertRes.status, 200, `Revert failed: ${revertRaw}`);
  const revertResult = JSON.parse(revertRaw);
  assert.equal(revertResult.success, true);
  console.log("   ✓ Campaign reverted!");

  // Verify baseline price restored
  const restoredPriceQuery = `
    SELECT amount_minor
    FROM product_prices
    WHERE variant_id = '${firstItem.variantId}'
      AND valid_from <= NOW()
      AND (valid_to IS NULL OR valid_to > NOW())
    ORDER BY valid_from DESC, id DESC
    LIMIT 1;
  `;
  const restoredPriceRow = psql(restoredPriceQuery);
  console.log("   ✓ DB Restored Baseline Price:", restoredPriceRow);
  assert.equal(Number(restoredPriceRow), firstItem.originalPriceVnd, "Storefront price must immediately restore to original baseline price");

  // Verify active campaign is now null
  const postRevertActiveRes = await fetch(`${apiUrl}/v1/admin/catalog/ai-merchandising/campaigns/active`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-correlation-id": "e2e-campaign-check-null",
    },
  });
  const postRevertActive = await postRevertActiveRes.json();
  assert.equal(postRevertActive, null, "Active campaign must be null after revert");
  console.log("   ✓ Active campaign monitor reports null after revert.");

  console.log("\n🎉 ALL E2E VERIFICATION CHECKS PASSED PERFECTLY!");
}

main().catch((err) => {
  console.error("❌ [E2E] Verification failed:", err);
  process.exit(1);
});
