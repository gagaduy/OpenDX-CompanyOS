#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const expectedTools = [
  "catalog.product_completeness", "catalog.publication_readiness",
  "catalog.merchandising_summary", "inventory.stock_risk", "inventory.slow_stock",
  "inventory.reservation_anomalies", "order.stalled_summary",
  "order.invalid_state_evidence", "order.expiry_risk", "finance.pending_payments",
  "finance.reconciliation_discrepancies", "finance.provider_evidence_status",
  "crm.segment_summary", "crm.followup_opportunities", "support.sla_risk",
  "support.classification_summary", "support.related_order_context",
];
const departments = ["catalog", "inventory", "order", "finance", "crm", "support"];
const canaries = [
  "Canary Product Name", "canary@example.invalid", "+84999999999",
  "Canary Home Address", "Canary CRM note body", "Canary ticket text",
  "provider-canary-id", "sha256-canary-payload-hash",
];

function source(path) {
  if (!existsSync(join(root, path))) throw new Error(`Missing Phase C artifact: ${path}`);
  return readFileSync(join(root, path), "utf8");
}

function sourcesUnder(path, extensions) {
  const directory = join(root, path);
  if (!existsSync(directory)) return "";
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.includes(extname(entry.name)))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
    .join("\n");
}

export function collectAgenticPhaseCSnapshot() {
  const toolCatalog = source(
    "apps/api/src/modules/agentic/application/tools/department-tool-catalog.ts",
  );
  const toolMigration = source(
    "apps/api/src/modules/agentic/infrastructure/database/migrations/202608160019_create_department_tool_execution.ts",
  );
  return {
    sources: {
      toolCatalog,
      toolMigration,
      toolSurface: [
        toolCatalog,
        source("apps/api/src/modules/agentic/application/tools/department-tool-schemas.ts"),
        source("apps/api/src/modules/agentic/presentation/routes/agentic-tool.routes.ts"),
      ].join("\n"),
      agenticSources: sourcesUnder("apps/api/src/modules/agentic", [".ts"]),
      readerContracts: [
        ...departments.map((department) => {
          const module = department === "finance" ? "payment" : department;
          return source(
            `apps/api/src/modules/${module}/application/services/interfaces/${module}-health-reader.ts`,
          );
        }),
        source("apps/api/src/modules/reporting/application/services/interfaces/agentic-analytics-reader.ts"),
      ].join("\n"),
      ownerIndexes: departments.map((department) => source(
        `apps/api/src/modules/${department === "finance" ? "payment" : department}/index.ts`,
      )).join("\n"),
      analyticsMigrations: sourcesUnder(
        "apps/api/src/modules/reporting/infrastructure/database/migrations",
        [".ts"],
      ),
      analyticsMigrationTest: source(
        "apps/api/src/modules/reporting/infrastructure/database/reporting-migration.integration.test.ts",
      ),
      roleReconciliation: source("infra/temporal/scripts/prepare-postgres-roles.sh"),
      leakageTest: source("apps/api/src/modules/agentic/tests/agentic-tool.api.integration.test.ts"),
      app: source("apps/api/src/app.ts"),
      caddy: source("infra/deploy/Caddyfile"),
      localRealm: source("infra/keycloak/realm-export.json"),
      productionRealm: source("infra/keycloak/realm-production.json"),
      packageJson: source("package.json"),
      runtimeSources: sourcesUnder("services/ai-runtime/app", [".py"]),
      consoleSources: sourcesUnder("apps/console/src", [".ts", ".tsx"]),
    },
  };
}

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function rejectMatch(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

export function validateAgenticPhaseC({ sources }) {
  const descriptors = [...sources.toolCatalog.matchAll(
    /source\("([a-z_.]+)",\s*"([a-z_]+)"/g,
  )].map((match) => ({ name: match[1], owner: match[2] }));
  const names = descriptors.map(({ name }) => name);
  if (
    descriptors.length !== 17
    || new Set(names).size !== 17
    || expectedTools.some((tool) => !names.includes(tool))
  ) throw new Error("Phase C must define exactly 17 version-one tools");
  for (const descriptor of descriptors) {
    if (!descriptor.name.startsWith(`${descriptor.owner}.`)) {
      throw new Error(`Invalid tool owner for ${descriptor.name}`);
    }
  }
  requireMatch(sources.toolCatalog, /version:\s*1 as const/, "Tools must remain version one");

  for (const tool of expectedTools) {
    const escaped = tool.replaceAll(".", "\\.");
    requireMatch(
      sources.toolMigration,
      new RegExp(`'${escaped}',1,'[a-f0-9]{64}','[a-f0-9]{64}',true,1,2`),
      `Migration descriptor is missing or stale for ${tool}`,
    );
  }

  rejectMatch(
    sources.agenticSources,
    /(?:from\s+|import\s*)["'][^"']*(?:catalog|inventory|order|payment|crm|support)[^"']*(?:infrastructure|repositories|domain)[^"']*["']/i,
    "Agentic has a private Commerce import",
  );
  rejectMatch(
    sources.toolSurface,
    /generic[_ .-]?sql|sql[_ .-]?query|\/query["'`]/i,
    "Generic SQL or query tools are forbidden",
  );
  requireMatch(
    sources.app,
    /app\.use\(\s*["']\/v1\/internal\/agentic\/tools["']/,
    "Tool endpoint is not mounted on the internal API",
  );
  requireMatch(
    sources.caddy,
    /@internalAgentic path \/v1\/internal\/agentic\*[\s\S]*respond @internalAgentic 404/,
    "Caddy denial for the internal Agentic prefix is missing",
  );

  rejectMatch(
    sources.analyticsMigrations,
    /GRANT\s+SELECT(?:\([^)]*\))?\s+ON\s+(?!reporting_agentic_)[a-z_][a-z0-9_.]*\s+TO\s+opendx_agentic_reader/iu,
    "Analytics reader has a direct base-table grant",
  );
  requireMatch(
    sources.analyticsMigrations,
    /REVOKE ALL ON reporting_agentic_customer_segment_snapshot_v1\s+FROM opendx_agentic_reader/i,
    "Analytics reader must retain exactly three view grants",
  );
  requireMatch(
    sources.analyticsMigrationTest,
    /information_schema\.role_table_grants[\s\S]*opendx_agentic_reader/i,
    "Analytics role exact-grant coverage is missing",
  );
  requireMatch(
    sources.roleReconciliation,
    /'reporting_agentic_customer_segment_snapshot_v2'/,
    "Role reconciliation must preserve exactly three view grants",
  );
  rejectMatch(
    sources.roleReconciliation,
    /'reporting_agentic_customer_segment_snapshot_v1'/,
    "Role reconciliation must preserve exactly three view grants",
  );

  rejectMatch(
    sources.readerContracts,
    /\b(?:create|insert|update|delete|remove|mutate|reserve|release|transition|publish|cancel)[A-Z][A-Za-z0-9]*\s*[:(]/,
    "Commerce health reader exposes a mutation method",
  );
  for (const department of departments) {
    const contract = `${department === "finance" ? "Payment" : capitalize(department)}HealthReader`;
    requireMatch(sources.ownerIndexes, new RegExp(contract), `Missing public ${contract} export`);
  }

  for (const canary of canaries) {
    requireMatch(
      sources.leakageTest,
      new RegExp(escapeRegExp(canary)),
      `Missing leakage fixture: ${canary}`,
    );
  }
  requireMatch(
    sources.leakageTest,
    /for \(const canary of canaries\)[\s\S]*not\.toContain\(canary\)/,
    "Leakage fixtures are not asserted byte-for-byte",
  );

  for (const department of departments) {
    const client = `agent-${department}`;
    requireMatch(sources.localRealm, new RegExp(`"clientId": "${client}"`), `Missing local ${client} identity`);
    requireMatch(sources.productionRealm, new RegExp(`"clientId": "${client}"`), `Missing production ${client} identity`);
  }
  if (!/"check:agentic-phase-g-exit"/.test(sources.packageJson)) {
    rejectMatch(
      sources.consoleSources,
      /AgenticDashboard|features\/agentic|\/agentic(?:["'`/])/i,
      "Agentic Console UI is outside Phase C",
    );
  }
  rejectMatch(
    sources.agenticSources,
    /SEPAY_PRODUCTION|sepay.*production|production.*sepay/i,
    "Production SePay activation is outside Phase C",
  );
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function run() {
  validateAgenticPhaseC(collectAgenticPhaseCSnapshot());
  console.info("Agentic Phase C exit check passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(root, relative(root, process.argv[1]))) {
  run();
}
