// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository, PolicyRecord } from "../../repositories/interfaces/agentic.repository";
import type { PolicyDecision, PolicyEffect } from "../../../domain/entities/governance-records";
import type { PolicyEvaluator, PolicyRequest } from "../interfaces/policy-evaluator";

type PolicyRepository = Pick<AgenticRepository, "listPolicies" | "findActiveRevocation">;

export class PolicyService implements PolicyEvaluator {
  constructor(
    private readonly repository: PolicyRepository,
    private readonly transactions: TransactionRunner,
    private readonly now: () => string,
  ) {}

  async evaluate(request: PolicyRequest): Promise<PolicyDecision> {
    return this.transactions.runReadOnly((session) => this.evaluateInSession(session, request));
  }

  async evaluateInSession(session: DatabaseSession, request: PolicyRequest): Promise<PolicyDecision> {
    if (request.agentKind !== undefined) {
      const revocation = await this.repository.findActiveRevocation(
        session, "agent", request.agentKind,
      );
      if (revocation !== undefined) {
        return decision("DENY", request.policyVersion, "EMERGENCY_REVOCATION", [], this.now());
      }
    }
    const matches = (await this.repository.listPolicies(session, request.revisionId))
      .filter((rule) => matchesRequest(rule, request));
    if (matches.length === 0) {
      return decision("DENY", request.policyVersion, "NO_MATCH", [], this.now());
    }
    const winner = [...matches].sort(comparePrecedence)[0]!;
    return decision(
      winner.effect,
      request.policyVersion,
      winner.reasonCode,
      matches.map(({ id }) => id).sort(),
      this.now(),
    );
  }
}

function matchesRequest(rule: PolicyRecord, request: PolicyRequest): boolean {
  return rule.actorType === request.actorType
    && rule.agentKind === request.agentKind
    && rule.department === request.department
    && rule.resource === request.resource
    && rule.action === request.action
    && rule.purpose === request.purpose
    && rule.dataClassification === request.dataClassification;
}

const precedence: Record<PolicyEffect, number> = {
  DENY: 0,
  REQUIRE_APPROVAL: 1,
  ALLOW: 2,
};

function comparePrecedence(left: PolicyRecord, right: PolicyRecord): number {
  return precedence[left.effect] - precedence[right.effect]
    || left.ruleOrder - right.ruleOrder
    || left.id.localeCompare(right.id);
}

function decision(
  effect: PolicyEffect,
  policyVersion: number,
  reasonCode: string,
  matchedRuleIds: readonly string[],
  evaluatedAt: string,
): PolicyDecision {
  return { effect, policyVersion, reasonCode, matchedRuleIds, evaluatedAt };
}
