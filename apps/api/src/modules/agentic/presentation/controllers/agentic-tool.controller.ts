// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import { successResponse } from "../../../../shared/http/api-response";
import type { AgentServicePrincipal } from "../../application/identity/agent-service-principal";
import { AgenticApplicationError } from "../../application/services/agentic-application.error";
import type { ToolRegistry } from "../../application/services/interfaces/tool-registry";
import { findDepartmentToolDescriptor } from "../../application/tools/department-tool-catalog";
import type { DepartmentAgentKind } from "../../application/tools/department-tool-contracts";
import { parseAgenticToolInvocation } from "../validators/agentic-tool.validator";

export class AgenticToolController {
  constructor(private readonly tools: ToolRegistry) {}

  readonly invoke: RequestHandler = (request, response, next) => {
    void (async () => {
      const input = parseAgenticToolInvocation(request.body);
      const principal = response.locals.agentServicePrincipal as AgentServicePrincipal;
      const descriptor = findDepartmentToolDescriptor(input.toolName, input.toolVersion);
      if (
        descriptor === undefined
        || descriptor.agentKind !== principal.agentKind
        || descriptor.purpose !== input.purpose
        || descriptor.dataScope !== input.dataScope
        || descriptor.classification !== input.dataClassification
      ) {
        throw new AgenticApplicationError("TOOL_SCOPE_DENIED", "Tool is outside the Agent scope");
      }
      const result = await this.tools.invoke({
        ...input,
        principal: { ...principal, agentKind: principal.agentKind as DepartmentAgentKind },
      });
      response.json(successResponse("Department tool invoked", result));
    })().catch(next);
  };
}
