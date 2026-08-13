// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { AgentKind, AgentProfile } from "../../../domain/entities/agent-profile";
import { AgenticApplicationError } from "../agentic-application.error";
import type { AgenticQueryService } from "../interfaces/agentic-query.service";

type QueryRepository = Pick<AgenticRepository, "listAgents" | "findAgentByKind" | "listAudit">;

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
  async listAudit(limit: number) {
    return this.transactions.runReadOnly((session) => this.repository.listAudit(session, limit));
  }
}
