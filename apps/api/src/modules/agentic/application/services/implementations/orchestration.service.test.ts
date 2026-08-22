// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository, OrchestrationPlanAppendInput } from "../../repositories/interfaces/agentic.repository";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";
import { OrchestrationServiceImpl } from "./orchestration.service";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const principal = { subject: "service-account-agent-ai-ceo", clientId: "agent-ai-ceo", workload: "agentic_worker" } as const;
const plan: OrchestrationPlanAppendInput = {
  id: "plan-1", taskId: "task-1", version: 1, digest: "a".repeat(64), taskBriefDigest: "b".repeat(64),
  policyVersion: 4, configurationRevisionId: "revision-1", createdBy: principal.clientId,
  createdAt: "2026-08-22T00:00:00.000Z", subtasks: [{ id: "catalog-1", owner: "catalog",
    expectedResultSchemaDigest: "c".repeat(64), allowedToolsDigest: "d".repeat(64),
    dataScope: "catalog.aggregate", freshnessSeconds: 300, timeoutSeconds: 30,
    budgetMicros: 100, sourceProvenanceDigest: "e".repeat(64), dependencies: [] }],
};

describe("OrchestrationServiceImpl", () => {
  it("re-evaluates policy before plan persistence", async () => {
    const repository = {
      findAgentByClientId: vi.fn().mockResolvedValue({ kind: "ai_ceo", active: true }),
      appendOrchestrationPlan: vi.fn(), appendAudit: vi.fn(), appendProvenance: vi.fn(),
    } as unknown as Pick<AgenticRepository, "findAgentByClientId" | "appendOrchestrationPlan" | "appendAudit" | "appendProvenance">;
    const policy = { evaluateInSession: vi.fn().mockResolvedValue({ effect: "DENY", policyVersion: 4, reasonCode: "DENIED", matchedRuleIds: [], evaluatedAt: plan.createdAt }) } as unknown as PolicyEvaluator;
    const service = new OrchestrationServiceImpl(repository, transactions, policy, () => "event-1");

    await expect(service.acceptPlan(plan, principal)).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(policy.evaluateInSession).toHaveBeenCalledOnce();
    expect(repository.appendOrchestrationPlan).not.toHaveBeenCalled();
  });
});
