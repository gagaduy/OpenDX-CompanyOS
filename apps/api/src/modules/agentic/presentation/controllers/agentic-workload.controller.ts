// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Request, RequestHandler, Response } from "express";
import type { WorkloadPrincipal } from "../../../../shared/auth/workload-principal";
import { successResponse } from "../../../../shared/http/api-response";
import type { WorkflowRunService } from "../../application/services/interfaces/workflow-run.service";
import {
  parseCompleteActivity,
  parseFailActivity,
  parseInvocationKey,
  parseProjectWorkflowState,
  parseReserveActivity,
  parseUuid,
} from "../validators/agentic.validator";

export class AgenticWorkloadController {
  constructor(private readonly workflows: WorkflowRunService) {}

  readonly loadPlan = handle(async (request, response) => {
    response.json(successResponse("Frozen workflow plan retrieved", await this.workflows.loadPlan(
      parseUuid(request.params.runId),
      principal(response.locals),
    )));
  });

  readonly projectState = handle(async (request, response) => {
    response.json(successResponse("Workflow state projected", await this.workflows.projectState({
      runId: parseUuid(request.params.runId),
      ...parseProjectWorkflowState(request.body),
    }, principal(response.locals))));
  });

  readonly reserveActivity = handle(async (request, response) => {
    response.json(successResponse("Activity invocation reserved", await this.workflows.reserveActivity(
      parseReserveActivity(request.body),
      principal(response.locals),
    )));
  });

  readonly completeActivity = handle(async (request, response) => {
    response.json(successResponse("Activity invocation completed", await this.workflows.completeActivity({
      invocationKey: parseInvocationKey(request.params.invocationKey),
      ...parseCompleteActivity(request.body),
    }, principal(response.locals))));
  });

  readonly failActivity = handle(async (request, response) => {
    response.json(successResponse("Activity invocation failed", await this.workflows.failActivity({
      invocationKey: parseInvocationKey(request.params.invocationKey),
      ...parseFailActivity(request.body),
    }, principal(response.locals))));
  });
}

function principal(locals: Record<string, unknown>): WorkloadPrincipal {
  return locals.workloadPrincipal as WorkloadPrincipal;
}

function handle(operation: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void operation(request, response).catch(next); };
}
