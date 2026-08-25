// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AuditEventRecord } from "../../repositories/interfaces/agentic.repository";
import type { AgentKind, AgentProfile } from "../../../domain/entities/agent-profile";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";

export interface AgenticAuditQuery {
  readonly limit: number;
  readonly actorId?: string;
  readonly action?: string;
  readonly outcome?: AuditEventRecord["outcome"];
}

export interface AgenticQueryService {
  listEmployees(): Promise<readonly AgentProfile[]>;
  getEmployee(agentKind: AgentKind): Promise<AgentProfile>;
  listAudit(query: AgenticAuditQuery, principal: StaffPrincipal): Promise<readonly AuditEventRecord[]>;
}
