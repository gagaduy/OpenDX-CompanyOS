// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Request, RequestHandler, Response } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { ApplicationError } from "../../../../shared/http/application-error";
import { successResponse } from "../../../../shared/http/api-response";
import type { WorkflowBlueprintRepository } from "../../application/repositories/interfaces/workflow-blueprint.repository";
import {
  parseSaveWorkflowDraft,
  parsePublishWorkflow,
} from "../validators/agentic.validator";

export class WorkflowBlueprintController {
  constructor(private readonly repository: WorkflowBlueprintRepository) {}

  readonly listBlueprints = handle(async (_request, response) => {
    const blueprints = await this.repository.listBlueprints();
    response.json(successResponse("Workflow blueprints retrieved", blueprints));
  });

  readonly getBlueprint = handle(async (request, response) => {
    const id = String(request.params.id);
    const blueprint = await this.repository.findById(id);
    if (!blueprint) {
      throw new ApplicationError(404, "WORKFLOW_NOT_FOUND", `Workflow blueprint '${id}' not found`);
    }
    response.json(successResponse("Workflow blueprint retrieved", blueprint));
  });

  readonly saveDraft = handle(async (request, response) => {
    const id = String(request.params.id);
    const draft = parseSaveWorkflowDraft(request.body);
    const actor = principal(response.locals);
    const updated = await this.repository.saveDraft(id, {
      ...draft,
      updatedBy: actor?.subject ?? "operator",
    });
    response.json(successResponse("Workflow blueprint draft saved", updated));
  });

  readonly publishBlueprint = handle(async (request, response) => {
    const id = String(request.params.id);
    const publishData = parsePublishWorkflow(request.body);
    const actor = principal(response.locals);
    const published = await this.repository.publish(id, {
      ...publishData,
      updatedBy: actor?.subject ?? "operator",
    });
    response.json(successResponse("Workflow blueprint published and activated", published));
  });
}

function principal(locals: Record<string, unknown>): StaffPrincipal | undefined {
  return locals.staffPrincipal as StaffPrincipal | undefined;
}

function handle(operation: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void operation(request, response).catch(next); };
}
