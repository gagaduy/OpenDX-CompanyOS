// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { AgentKind, AgentProfile } from "../../../domain/entities/agent-profile";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import { AgenticApplicationError } from "../agentic-application.error";
import type { AgenticQueryService } from "../interfaces/agentic-query.service";

type QueryRepository = Pick<AgenticRepository, "listAgents" | "findAgentByKind" | "listAudit">;

const GOVERNANCE_AUDIT_RESOURCE_TYPES = [
  "configuration_revision",
  "approval_request",
  "agent",
  "tool_grant",
  "model",
] as const;

const AUDITOR_RESOURCE_TYPES = [
  ...GOVERNANCE_AUDIT_RESOURCE_TYPES,
  "agentic_task",
  "tool",
] as const;

export class AgenticQueryServiceImpl implements AgenticQueryService {
  constructor(private readonly repository: QueryRepository, private readonly transactions: TransactionRunner) {}
  async listEmployees(): Promise<readonly AgentProfile[]> {
    return this.transactions.runReadOnly((session) => this.repository.listAgents(session));
  }
  async getEmployee(agentKind: AgentKind): Promise<AgentProfile> {
    return this.transactions.runReadOnly(async (session) => {
      const agent = await this.repository.findAgentByKind(session, agentKind);
      if (agent === undefined) throw new AgenticApplicationError("AGENT_NOT_FOUND", "Digital Employee was not found");
      return agent;
    });
  }
  async listAudit(query: Parameters<AgenticQueryService["listAudit"]>[0], principal: StaffPrincipal) {
    const isAdministrator = principal.roles.includes("administrator");
    const isAuditor = principal.roles.includes("agentic_auditor");
    const isGovernance = principal.roles.includes("agentic_governance_admin");
    if (!isAdministrator && !isAuditor && !isGovernance) {
      throw new AgenticApplicationError("FORBIDDEN", "Audit access is not permitted");
    }
    const resourceTypes = isAdministrator
      ? undefined
      : isAuditor
        ? AUDITOR_RESOURCE_TYPES
        : GOVERNANCE_AUDIT_RESOURCE_TYPES;
    return this.transactions.runReadOnly((session) => this.repository.listAudit(session, {
      ...query,
      ...(resourceTypes === undefined ? {} : { resourceTypes }),
    }));
  }
}
