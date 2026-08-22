// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export const AGENT_KINDS = [
  "ai_ceo",
  "catalog",
  "inventory",
  "order",
  "finance",
  "crm",
  "support",
] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

export interface AgentProfile {
  readonly kind: AgentKind;
  readonly keycloakClientId: string;
  readonly active: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
