// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentKind } from "../../../domain/entities/agent-profile";
import type { PolicyDecision } from "../../../domain/entities/governance-records";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface PolicyRequest {
  readonly revisionId: string;
  readonly policyVersion: number;
  readonly actorType: string;
  readonly agentKind?: AgentKind;
  readonly department?: string;
  readonly resource: string;
  readonly action: string;
  readonly purpose: string;
  readonly dataClassification: string;
}

export interface PolicyEvaluator {
  evaluate(request: PolicyRequest): Promise<PolicyDecision>;
  evaluateInSession(session: DatabaseSession, request: PolicyRequest): Promise<PolicyDecision>;
}
