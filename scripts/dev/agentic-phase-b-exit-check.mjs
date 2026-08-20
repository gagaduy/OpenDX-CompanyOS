#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();

const paths = {
  apiRoutes: "apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts",
  workloadRoutes: "apps/api/src/modules/agentic/presentation/routes/agentic-workload.routes.ts",
  workflowMigration: "apps/api/src/modules/agentic/infrastructure/database/migrations/202608140017_create_agent_workflow_control.ts",
  runtimeRoutes: "services/ai-runtime/app/agentic/presentation/router.py",
  workflow: "services/ai-runtime/app/agentic/workflows/store_health_review_v1.py",
  activities: "services/ai-runtime/app/agentic/activities/store_health_activities.py",
  pythonProject: "services/ai-runtime/pyproject.toml",
  localCompose: "infra/docker/docker-compose.yml",
  productionCompose: "infra/deploy/compose.production.yml",
  caddy: "infra/deploy/Caddyfile",
  recoveryHelper: "scripts/ops/postgres-recovery-set.mjs",
  backup: "scripts/ops/postgres-backup.sh",
  restore: "scripts/ops/postgres-restore.sh",
  lifecycle: "scripts/dev/agentic-workflow-lifecycle-check.mjs",
  recovery: "scripts/dev/agentic-workflow-recovery-check.mjs",
  packageJson: "package.json",
  apiDocs: "docs/api/agentic.md",
  runtimeDocs: "docs/architecture/agentic-workflow-runtime.md",
  buildDocs: "docs/build-from-source.md",
  dependencyDocs: "docs/dependencies.md",
  roadmap: "docs/roadmap/mvp-status.md",
};

function source(path) {
  if (!existsSync(join(root, path))) throw new Error(`Missing Phase B artifact: ${path}`);
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

function filesUnder(path, extensions) {
  const directory = join(root, path);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.includes(extname(entry.name)))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

export function collectAgenticPhaseBSnapshot() {
  return {
    sources: {
      ...Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, source(path)])),
      runtimeSources: sourcesUnder("services/ai-runtime/app", [".py"]),
      consoleSources: sourcesUnder("apps/console/src", [".ts", ".tsx"]),
      agenticSources: [
        sourcesUnder("services/ai-runtime/app/agentic", [".py"]),
        sourcesUnder("apps/api/src/modules/agentic", [".ts"]),
      ].join("\n"),
    },
    agenticFiles: [
      ...filesUnder("services/ai-runtime/app/agentic", [".py"]),
      ...filesUnder("apps/api/src/modules/agentic", [".ts"]),
    ],
  };
}

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function rejectMatch(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

export function validateAgenticPhaseB({ sources, agenticFiles: files }) {
  requireMatch(sources.apiRoutes, /\/tasks\/:taskId\/start/, "Missing workflow start route");
  requireMatch(sources.apiRoutes, /get\("\/workflow-runs\/:runId"/, "Missing workflow run read route");
  requireMatch(sources.apiRoutes, /\/workflow-runs\/:runId\/cancel/, "Missing workflow cancellation route");
  requireMatch(sources.apiRoutes, /\/approvals\/:approvalId\/decision/, "Missing approval decision route");
  for (const [pattern, label] of [
    [/workflow-runs\/:runId\/plan/, "frozen-plan callback"],
    [/workflow-runs\/:runId\/state/, "state-projection callback"],
    [/activity-invocations\/reserve/, "activity reservation callback"],
    [/activity-invocations\/:invocationKey\/complete/, "activity completion callback"],
    [/activity-invocations\/:invocationKey\/fail/, "activity failure callback"],
  ]) requireMatch(sources.workloadRoutes, pattern, `Missing ${label}`);

  for (const [pattern, label] of [
    [/CREATE TABLE agentic_workflow_runs/, "workflow run table"],
    [/CREATE TABLE agentic_activity_invocations/, "activity invocation table"],
    [/CREATE TABLE agentic_workflow_signal_receipts/, "signal receipt table"],
  ]) requireMatch(sources.workflowMigration, pattern, `Missing ${label}`);

  requireMatch(sources.runtimeRoutes, /\/internal\/agentic\/workflow-runs/, "Missing internal runtime routes");
  requireMatch(sources.workflow, /StoreHealthReviewWorkflowV1/, "Missing deterministic Store Health workflow");
  requireMatch(sources.activities, /invocation_key/, "Missing idempotent activity invocation binding");
  requireMatch(sources.pythonProject, /temporalio==1\.30\.0/, "Temporal SDK must stay exactly pinned");

  for (const [pattern, label] of [
    [/\n  temporal:/, "Temporal server"],
    [/\n  ai-runtime:/, "AI runtime gateway"],
    [/\n  ai-worker:/, "Temporal worker"],
    [/\n  temporal-namespace:/, "Temporal namespace registration"],
  ]) requireMatch(sources.localCompose, pattern, `Local Compose is missing ${label}`);
  rejectMatch(sources.localCompose, /temporal-ui\s*:/i, "Temporal UI is outside Phase B");
  rejectMatch(
    sources.productionCompose,
    /["']?7233:7233["']?|(?:published|"published")\s*:\s*["']?7233/i,
    "Production has a public Temporal port",
  );
  rejectMatch(sources.productionCompose, /temporal-ui\s*:/i, "Temporal UI is outside Phase B");
  requireMatch(sources.productionCompose, /TEMPORAL_TLS_ENABLED:\s*["']?true/i, "Production Temporal clients must use TLS");
  requireMatch(sources.productionCompose, /TEMPORAL_TLS_REQUIRE_CLIENT_AUTH:\s*["']?true/i, "Production Temporal must require client authentication");
  requireMatch(sources.caddy, /respond @internalAgentic 404/, "Caddy must deny the internal Agentic API");

  for (const member of ["opendx.dump", "temporal.dump", "temporal_visibility.dump", "manifest.json", "checksums.sha256"]) {
    requireMatch(sources.recoveryHelper, new RegExp(member.replace(".", "\\.")), `Recovery set is missing ${member}`);
  }
  requireMatch(sources.packageJson, /"check:agentic-workflow"/, "Missing live workflow lifecycle gate");
  requireMatch(sources.packageJson, /"check:agentic-workflow-recovery"/, "Missing live workflow recovery gate");
  requireMatch(sources.lifecycle, /opendx-database-maintenance\.lock/, "Lifecycle gate does not share the maintenance lock");
  requireMatch(sources.recovery, /Replayer/, "Recovery gate does not replay Temporal history");

  for (const [value, pattern, message] of [
    [sources.apiDocs, /PostgreSQL projection[\s\S]*Temporal history/i, "Agentic API docs must distinguish projection from history"],
    [sources.runtimeDocs, /deterministic[\s\S]*idempotenc/i, "Runtime docs must define determinism and idempotency"],
    [sources.runtimeDocs, /mTLS/i, "Runtime docs must define production mTLS"],
    [sources.runtimeDocs, /non-HA single-VPS/i, "Runtime docs must define the non-HA boundary"],
    [sources.buildDocs, /check:agentic-workflow[\s\S]*check:agentic-workflow-recovery/i, "Build docs must list both live Agentic gates"],
    [sources.dependencyDocs, /temporalio.*1\.30\.0/i, "Dependency docs must record the Temporal SDK pin"],
    [sources.roadmap, /Phase B[\s\S]{0,500}(complete|completed)/i, "Roadmap must mark Phase B complete"],
    [sources.roadmap, /Phase C[\s\S]{0,500}(?:complete|gates pass)/i, "Roadmap must preserve Phase C closure"],
  ]) requireMatch(value, pattern, message);

  rejectMatch(sources.consoleSources, /AgenticDashboard|features\/agentic|\/agentic(?:["'`/])/i, "Console Agentic page is outside Phase B");
  rejectMatch(sources.agenticSources, /SEPAY_PRODUCTION/i, "Production SePay activation is outside Phase B");
  const phaseCDeclared = /"check:agentic-phase-c-exit"/.test(sources.packageJson);
  const approvedPhaseCToolFile = /apps\/api\/src\/modules\/agentic\/(?:tests\/agentic-tool|application\/tools\/department-tool|infrastructure\/tools\/|presentation\/(?:controllers|routes|validators)\/agentic-tool|application\/services\/(?:implementations\/tool-sharing|interfaces\/department-tool)|infrastructure\/database\/migrations\/2026081600(?:19|20|21)_)/i;
  const commerceToolChange = files.some((path) =>
    /(?:services\/ai-runtime\/app\/agentic|apps\/api\/src\/modules\/agentic)\/.*(?:tools?|commerce).*(?:\.py|\.ts)$/i.test(path)
    && !/tool-registry|tool_registry/i.test(path)
    && !(phaseCDeclared && approvedPhaseCToolFile.test(path)));
  const commerceEndpoint = /\/v1\/(?:admin\/)?(?:catalog|inventory|orders?|customers?|crm|support|payments?)(?:\/|["'`])/i
    .test(sources.agenticSources);
  const commerceImport = /modules\/(?:catalog|inventory|order|customer|crm|support|payment)\//i
    .test(sources.agenticSources);
  if (commerceToolChange || commerceEndpoint || commerceImport) {
    throw new Error("Commerce tool execution is outside Phase B");
  }
}

export function run() {
  validateAgenticPhaseB(collectAgenticPhaseBSnapshot());
  console.info("Agentic Phase B exit check passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(root, relative(root, process.argv[1]))) {
  run();
}
