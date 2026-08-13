// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentKind } from "../../domain/entities/agent-profile";

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
