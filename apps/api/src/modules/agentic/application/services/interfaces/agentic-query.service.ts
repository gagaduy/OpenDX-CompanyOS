// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AuditEventRecord } from "../../repositories/interfaces/agentic.repository";
import type { AgentKind, AgentProfile } from "../../../domain/entities/agent-profile";

export interface AgenticQueryService {
  listEmployees(): Promise<readonly AgentProfile[]>;
  getEmployee(agentKind: AgentKind): Promise<AgentProfile>;
  listAudit(limit: number): Promise<readonly AuditEventRecord[]>;
}
