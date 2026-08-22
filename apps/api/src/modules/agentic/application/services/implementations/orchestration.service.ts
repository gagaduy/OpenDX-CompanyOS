// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { WorkloadPrincipal } from "../../../../../shared/auth/workload-principal";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository, OrchestrationPlanAppendInput } from "../../repositories/interfaces/agentic.repository";
import { validateOrchestrationPlan } from "../../../domain/services/ai-ceo-orchestration-rules";
import { AgenticApplicationError } from "../agentic-application.error";
import type { OrchestrationService } from "../interfaces/orchestration.service";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";

type Repository = Pick<AgenticRepository, "findAgentByClientId" | "appendOrchestrationPlan" | "appendAudit" | "appendProvenance">;

export class OrchestrationServiceImpl implements OrchestrationService {
  constructor(private readonly repository: Repository, private readonly transactions: TransactionRunner,
    private readonly policy: PolicyEvaluator, private readonly generateId: () => string) {}

  async acceptPlan(plan: OrchestrationPlanAppendInput, principal: WorkloadPrincipal): Promise<void> {
    await this.transactions.run(async (session) => {
      const agent = await this.repository.findAgentByClientId(session, principal.clientId);
      if (agent?.kind !== "ai_ceo" || !agent.active || plan.createdBy !== principal.clientId) fail("FORBIDDEN", "AI CEO workload identity is required");
      const eligible = new Set<string>();
      for (const subtask of plan.subtasks) {
        const decision = await this.policy.evaluateInSession(session, {
          revisionId: plan.configurationRevisionId, policyVersion: plan.policyVersion,
          actorType: "agent", agentKind: "ai_ceo", department: subtask.owner,
          resource: "agentic_orchestration_plan", action: "assign",
          purpose: "store_health_review", dataClassification: "internal",
        });
        if (decision.effect === "DENY") fail("POLICY_DENIED", "Policy denied the assignment");
        if (decision.effect === "REQUIRE_APPROVAL") fail("POLICY_APPROVAL_REQUIRED", "Assignment requires human approval");
        eligible.add(subtask.owner);
      }
      validateOrchestrationPlan(plan, eligible);
      await this.repository.appendOrchestrationPlan(session, plan);
      await this.repository.appendProvenance(session, { id: this.generateId(), taskId: plan.taskId,
        sourceType: "agentic_orchestration_plan", sourceId: plan.id, sourceDigest: plan.digest,
        sourceVersion: plan.version, classification: "internal", recordedBy: principal.clientId, recordedAt: plan.createdAt });
      await this.repository.appendAudit(session, { id: this.generateId(), actorId: principal.subject,
        clientId: principal.clientId, actorType: "agent", taskId: plan.taskId, action: "agentic.orchestration.plan.accept",
        resourceType: "agentic_orchestration_plan", resourceId: plan.id, outcome: "allowed",
        policyVersion: plan.policyVersion, correlationId: plan.taskId, resultDigest: plan.digest, occurredAt: plan.createdAt });
    });
  }
}

function fail(code: string, message: string): never { throw new AgenticApplicationError(code, message); }
