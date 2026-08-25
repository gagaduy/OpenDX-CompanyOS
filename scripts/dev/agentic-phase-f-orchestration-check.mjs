#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEPARTMENTS = [
  "catalog", "inventory", "order", "finance", "crm", "support",
];

const source = (path) => readFileSync(path, "utf8");
const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function collectAgenticPhaseF() {
  return {
    localCompose: source("infra/docker/docker-compose.yml"),
    productionCompose: source("infra/deploy/compose.production.yml"),
    productionCheck: source("scripts/dev/agentic-production-compose-check.mjs"),
    localRealm: source("infra/keycloak/realm-export.json"),
    productionRealm: source("infra/keycloak/realm-production.json"),
    reconciler: source("infra/keycloak/reconcile-production-realm.sh"),
    workflow: source("services/ai-runtime/app/agentic/workflows/store_health_review_v1.py"),
    departmentExecution: source("services/ai-runtime/app/agentic/application/department_execution.py"),
    workflowTests: source("services/ai-runtime/tests/agentic/workflows/test_store_health_orchestration.py"),
    apiDocs: source("docs/api/agentic.md"),
    buildDocs: source("docs/build-from-source.md"),
    roadmap: source("docs/roadmap/mvp-status.md"),
  };
}

export function validateDepartmentSecrets(secrets) {
  const keys = Object.keys(secrets).sort();
  invariant(
    keys.join(",") === [...DEPARTMENTS].sort().join(","),
    "Exactly six Department secrets are required",
  );
  const values = Object.values(secrets);
  invariant(
    values.every((value) => typeof value === "string" && value.length >= 12),
    "Department secrets must be non-empty deployment values",
  );
  invariant(new Set(values).size === values.length, "Department secrets must be distinct");
}

export function validateAgenticPhaseF(snapshot) {
  for (const value of [snapshot.localCompose, snapshot.productionCompose]) {
    invariant(value.includes("ORCHESTRATION_DESCRIPTOR_EXECUTION_ENABLED"), "Descriptor execution flag is missing");
    invariant(value.includes("DEPARTMENT_TOOL_API_BASE_URL"), "Private Department Tool API boundary is missing");
    invariant(value.includes("AGENT_AI_CEO_CLIENT_ID"), "AI CEO worker identity is missing");
    for (const kind of DEPARTMENTS) {
      invariant(value.includes(`AGENT_${kind.toUpperCase()}_CLIENT_ID`), `Missing ${kind} worker identity`);
    }
  }
  invariant(
    snapshot.productionCheck.includes("isolated to Keycloak and the worker")
      && snapshot.productionCheck.includes("services[\"ai-runtime\"].environment"),
    "Execution credentials must not reach the API or AI Runtime gateway",
  );
  for (const realm of [snapshot.localRealm, snapshot.productionRealm]) {
    const parsed = JSON.parse(realm);
    for (const clientId of ["agent-ai-ceo", ...DEPARTMENTS.map((kind) => `agent-${kind}`)]) {
      const matches = parsed.clients.filter((client) => client.clientId === clientId);
      invariant(matches.length === 1, `Realm must define exactly one ${clientId} client`);
      const [client] = matches;
      invariant(
        client?.publicClient === false && client.serviceAccountsEnabled === true
          && client.standardFlowEnabled === false && client.directAccessGrantsEnabled === false,
        `${clientId} must be a confidential service-account-only client`,
      );
    }
  }
  invariant(
    snapshot.reconciler.includes("reconcile_client agent-ai-ceo")
      && DEPARTMENTS.every((kind) => snapshot.reconciler.includes(`reconcile_client agent-${kind}`)),
    "Keycloak reconciliation must own all seven execution identities",
  );
  invariant(
    snapshot.workflow.includes('workflow.patched("phase-f-execution-descriptor-v1")')
      && snapshot.workflow.includes("DescriptorExecutionReference"),
    "The replay-safe descriptor workflow patch is missing",
  );
  invariant(
    snapshot.workflowTests.includes("Replayer")
      && snapshot.workflowTests.includes("authorizedContext")
      && snapshot.workflowTests.includes("test_cancellation_drains")
      && snapshot.workflowTests.includes("test_phase_f_acceptance_restarts_worker_replays_history_without_duplicate_effects")
      && snapshot.workflowTests.includes('multiprocessing.get_context("spawn")')
      && snapshot.workflowTests.includes("PHASE_F_NODES"),
    "Old/new replay, reference-only history, and cancellation evidence are required",
  );
  invariant(
    snapshot.departmentExecution.includes("await self._controls.mediate_collaboration(")
      && snapshot.workflow.includes("DescriptorCollaborationReference"),
    "Mediated collaboration must execute before the target Department",
  );
  invariant(
    snapshot.apiDocs.includes("Phase F descriptor orchestration")
      && snapshot.buildDocs.includes("check:agentic-phase-f-orchestration")
      && snapshot.roadmap.includes("Phase F: AI CEO Coordination")
      && snapshot.roadmap.includes("Slice 1 complete"),
    "Phase F API, operations, and roadmap documentation is incomplete",
  );
}

export function run() {
  validateAgenticPhaseF(collectAgenticPhaseF());
  console.info(
    "Agentic Phase F static orchestration gate passed; the paired Temporal acceptance verifies worker crash/restart, replay, effects, and Commerce immutability.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
