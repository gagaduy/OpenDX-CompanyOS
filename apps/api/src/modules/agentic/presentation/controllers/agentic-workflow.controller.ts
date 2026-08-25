// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Request, RequestHandler, Response } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import type { WorkflowRunService } from "../../application/services/interfaces/workflow-run.service";
import {
  parseCancelWorkflow,
  parseStartWorkflow,
  parseUuid,
} from "../validators/agentic.validator";

export class AgenticWorkflowController {
  constructor(private readonly workflows: WorkflowRunService) {}

  readonly startWorkflow = handle(async (request, response) => {
    const result = await this.workflows.startCommand({
      taskId: parseUuid(request.params.taskId),
      ...parseStartWorkflow(request.body),
    }, principal(response.locals));
    response.status(result.disposition === "accepted" ? 202 : 200)
      .json(successResponse("Agent workflow start accepted", result.run));
  });

  readonly getWorkflow = handle(async (request, response) => {
    const run = await this.workflows.get(
      parseUuid(request.params.runId),
      principal(response.locals),
    );
    response.json(successResponse("Agent workflow retrieved", run));
  });

  readonly cancelWorkflow = handle(async (request, response) => {
    const result = await this.workflows.cancelCommand({
      runId: parseUuid(request.params.runId),
      ...parseCancelWorkflow(request.body),
    }, principal(response.locals));
    response.status(result.disposition === "accepted" ? 202 : 200)
      .json(successResponse("Agent workflow cancellation accepted", result.run));
  });
}

function principal(locals: Record<string, unknown>): StaffPrincipal {
  return locals.staffPrincipal as StaffPrincipal;
}

function handle(operation: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void operation(request, response).catch(next); };
}
