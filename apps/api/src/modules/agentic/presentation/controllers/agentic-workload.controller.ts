// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Request, RequestHandler, Response } from "express";
import type { WorkloadPrincipal } from "../../../../shared/auth/workload-principal";
import { successResponse } from "../../../../shared/http/api-response";
import type { WorkflowRunService } from "../../application/services/interfaces/workflow-run.service";
import type { ModelRunService } from "../../application/services/interfaces/model-run.service";
import type { OrchestrationService } from "../../application/services/interfaces/orchestration.service";
import {
  parseCompleteModelRun,
  parseCompleteActivity,
  parseFailActivity,
  parseFailModelRun,
  parseInvocationKey,
  parseProjectWorkflowState,
  parseReserveActivity,
  parseReserveModelRun,
  parseStartModelRun,
  parseUuid,
  parseAcceptOrchestrationPlan,
} from "../validators/agentic.validator";

export class AgenticWorkloadController {
  constructor(
    private readonly workflows: WorkflowRunService,
    private readonly modelRuns: ModelRunService,
    private readonly orchestration: OrchestrationService,
  ) {}

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

  readonly reserveModelRun = handle(async (request, response) => {
    response.json(successResponse("Model run reserved", await this.modelRuns.reserve(
      parseReserveModelRun(request.body), principal(response.locals),
    )));
  });

  readonly startModelRun = handle(async (request, response) => {
    response.json(successResponse("Model run started", await this.modelRuns.start({
      runId: parseUuid(request.params.runId),
      ...parseStartModelRun(request.body),
    }, principal(response.locals))));
  });

  readonly completeModelRun = handle(async (request, response) => {
    response.json(successResponse("Model run completed", await this.modelRuns.complete({
      runId: parseUuid(request.params.runId),
      ...parseCompleteModelRun(request.body),
    }, principal(response.locals))));
  });

  readonly failModelRun = handle(async (request, response) => {
    response.json(successResponse("Model run failed", await this.modelRuns.fail({
      runId: parseUuid(request.params.runId),
      ...parseFailModelRun(request.body),
    }, principal(response.locals))));
  });

  readonly acceptOrchestrationPlan = handle(async (request, response) => {
    await this.orchestration.acceptPlan(parseAcceptOrchestrationPlan(request.body), principal(response.locals));
    response.status(202).json(successResponse("Orchestration plan accepted", { accepted: true }));
  });
}

function principal(locals: Record<string, unknown>): WorkloadPrincipal {
  return locals.workloadPrincipal as WorkloadPrincipal;
}

function handle(operation: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void operation(request, response).catch(next); };
}
