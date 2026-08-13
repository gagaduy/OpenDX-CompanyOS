// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type AgentKind =
  | "ai_ceo"
  | "catalog"
  | "inventory"
  | "order"
  | "finance"
  | "crm"
  | "support";

export interface AgentServicePrincipal {
  readonly subject: string;
  readonly clientId: string;
  readonly agentKind: AgentKind;
}

export interface AgentServiceIdentityResolver {
  resolve(clientId: string): Promise<{
    readonly agentKind: AgentKind;
    readonly active: boolean;
  } | undefined>;
}
