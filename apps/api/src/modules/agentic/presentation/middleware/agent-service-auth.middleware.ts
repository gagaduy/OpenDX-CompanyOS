// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { StaffTokenVerifier } from "../../../../shared/auth/staff-auth.middleware";
import { ApplicationError } from "../../../../shared/http/application-error";
import type {
  AgentServiceIdentityResolver,
  AgentServicePrincipal,
} from "../../application/identity/agent-service-principal";

export function authenticateAgentService(
  verifier: StaffTokenVerifier,
  identities: AgentServiceIdentityResolver,
): RequestHandler {
  return async (request, response, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(request.header("authorization") ?? "");
    if (match?.[1] === undefined) {
      next(unauthorized());
      return;
    }

    try {
      const payload = await verifier.verify(match[1]);
      const subject = payload.sub;
      const clientId = typeof payload.azp === "string"
        ? payload.azp
        : typeof payload.client_id === "string"
          ? payload.client_id
          : undefined;
      if (typeof subject !== "string" || subject.length === 0 || clientId === undefined) {
        throw new Error("Agent service identity is missing");
      }
      const identity = await identities.resolve(clientId);
      if (identity === undefined || !identity.active) {
        throw new Error("Agent service identity is unavailable");
      }
      const principal: AgentServicePrincipal = {
        subject,
        clientId,
        agentKind: identity.agentKind,
      };
      response.locals.agentServicePrincipal = principal;
      next();
    } catch {
      next(unauthorized());
    }
  };
}

function unauthorized(): ApplicationError {
  return new ApplicationError(401, "UNAUTHORIZED", "Authentication required");
}
