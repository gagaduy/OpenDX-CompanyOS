// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentKind } from "./agent-profile";

export type PolicyEffect = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";

export interface PolicyDecision {
  readonly effect: PolicyEffect;
  readonly policyVersion: number;
  readonly reasonCode: string;
  readonly matchedRuleIds: readonly string[];
  readonly evaluatedAt: string;
}

export interface AgentModelConfiguration {
  readonly agentKind?: AgentKind;
  readonly primaryModel: string;
  readonly fallbackModels: readonly string[];
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly inputCostMicrosPerMillion: number;
  readonly outputCostMicrosPerMillion: number;
}

export interface AgentBudgetLimits {
  readonly taskCostMicros: number;
  readonly dailyCostMicros: number;
  readonly monthlyCostMicros: number;
}
