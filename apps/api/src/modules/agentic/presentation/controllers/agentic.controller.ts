// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Request, RequestHandler, Response } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import type { AgentTaskService } from "../../application/services/interfaces/agent-task.service";
import type { AgenticQueryService } from "../../application/services/interfaces/agentic-query.service";
import type { ApprovalService } from "../../application/services/interfaces/approval.service";
import type { ConfigurationService } from "../../application/services/interfaces/configuration.service";
import type { EmergencyRevocationService } from "../../application/services/implementations/emergency-revocation.service";
import {
  parseAgentKind, parseAuditQuery, parseCreateRevision, parseCreateTask, parseDecision,
  parseExpectedVersion, parsePage, parseRevisionDecision, parseRevocation, parseUpdateRevision,
  parseUpdateTask, parseUuid,
} from "../validators/agentic.validator";

export class AgenticController {
  constructor(
    private readonly tasks: AgentTaskService,
    private readonly approvals: ApprovalService,
    private readonly configurations: ConfigurationService,
    private readonly revocations: EmergencyRevocationService,
    private readonly queries: AgenticQueryService,
  ) {}

  readonly createTask = handle(async (request, response) => {
    response.status(201).json(successResponse("Agent task created", await this.tasks.create(parseCreateTask(request.body), principal(response.locals))));
  });
  readonly listTasks = handle(async (request, response) => {
    response.json(successResponse("Agent tasks retrieved", await this.tasks.list(parsePage(request.query), principal(response.locals))));
  });
  readonly getTask = handle(async (request, response) => {
    response.json(successResponse("Agent task retrieved", await this.tasks.get(parseUuid(request.params.taskId), principal(response.locals))));
  });
  readonly updateTask = handle(async (request, response) => {
    response.json(successResponse("Agent task updated", await this.tasks.updateDraft({ taskId: parseUuid(request.params.taskId), ...parseUpdateTask(request.body) }, principal(response.locals))));
  });
  readonly readyTask = handle(async (request, response) => {
    response.json(successResponse("Agent task is ready", await this.tasks.ready({ taskId: parseUuid(request.params.taskId), ...parseExpectedVersion(request.body) }, principal(response.locals))));
  });
  readonly cancelTask = handle(async (request, response) => {
    response.json(successResponse("Agent task canceled", await this.tasks.cancel({ taskId: parseUuid(request.params.taskId), ...parseExpectedVersion(request.body) }, principal(response.locals))));
  });
  readonly listApprovals = handle(async (request, response) => {
    response.json(successResponse("Agent approvals retrieved", await this.approvals.list(parsePage(request.query), principal(response.locals))));
  });
  readonly getApproval = handle(async (request, response) => {
    response.json(successResponse("Agent approval retrieved", await this.approvals.get(parseUuid(request.params.approvalId), principal(response.locals))));
  });
  readonly decideApproval = handle(async (request, response) => {
    const result = await this.approvals.decideCommand({ approvalId: parseUuid(request.params.approvalId), ...parseDecision(request.body) }, principal(response.locals));
    response.status(result.workflowSignal && result.disposition === "accepted" ? 202 : 200)
      .json(successResponse("Agent approval decided", result.approval));
  });
  readonly listEmployees = handle(async (_request, response) => {
    response.json(successResponse("Digital Employees retrieved", await this.queries.listEmployees()));
  });
  readonly getEmployee = handle(async (request, response) => {
    response.json(successResponse("Digital Employee retrieved", await this.queries.getEmployee(parseAgentKind(request.params.agentKind))));
  });
  readonly createRevision = handle(async (request, response) => {
    response.status(201).json(successResponse("Configuration draft created", await this.configurations.createDraft(parseCreateRevision(request.body), principal(response.locals))));
  });
  readonly updateRevision = handle(async (request, response) => {
    response.json(successResponse("Configuration draft updated", await this.configurations.updateDraft({ revisionId: parseUuid(request.params.revisionId), ...parseUpdateRevision(request.body) }, principal(response.locals))));
  });
  readonly submitRevision = handle(async (request, response) => {
    response.json(successResponse("Configuration submitted", await this.configurations.submit({ revisionId: parseUuid(request.params.revisionId), ...parseExpectedVersion(request.body) }, principal(response.locals))));
  });
  readonly getRevisionDiff = handle(async (request, response) => {
    response.json(successResponse("Configuration diff retrieved", await this.configurations.getDiff(parseUuid(request.params.revisionId), principal(response.locals))));
  });
  readonly decideRevision = handle(async (request, response) => {
    response.json(successResponse("Configuration decided", await this.configurations.decide({ revisionId: parseUuid(request.params.revisionId), ...parseRevisionDecision(request.body) }, principal(response.locals))));
  });
  readonly createRevocation = handle(async (request, response) => {
    response.status(201).json(successResponse("Revocation request accepted", await this.revocations.request({ ...parseRevocation(request.body), correlationId: String(response.locals.correlationId) }, principal(response.locals))));
  });
  readonly listAudit = handle(async (request, response) => {
    response.json(successResponse("Agent audit retrieved", await this.queries.listAudit(parseAuditQuery(request.query), principal(response.locals))));
  });
}

function principal(locals: Record<string, unknown>): StaffPrincipal {
  return locals.staffPrincipal as StaffPrincipal;
}

function handle(operation: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void operation(request, response).catch(next); };
}
