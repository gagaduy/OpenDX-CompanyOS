// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Request, RequestHandler, Response } from "express";
import type { StaffPrincipal } from "../../../../shared/auth/staff-principal";
import { successResponse } from "../../../../shared/http/api-response";
import { ApplicationError } from "../../../../shared/http/application-error";
import type { AgentTaskService } from "../../application/services/interfaces/agent-task.service";
import type { AgenticQueryService } from "../../application/services/interfaces/agentic-query.service";
import type { AgenticFileService } from "../../application/services/interfaces/agentic-file.service";
import type { AgenticIntakeFile } from "../../domain/entities/agentic-file";
import type { ApprovalService } from "../../application/services/interfaces/approval.service";
import type { ConfigurationService } from "../../application/services/interfaces/configuration.service";
import type { EmergencyRevocationService } from "../../application/services/implementations/emergency-revocation.service";
import {
  parseAgentKind, parseAuditQuery, parseCreateRevision, parseCreateTask, parseDecision,
  parseExpectedVersion, parsePage, parseRevocation, parseUpdateRevision,
  parseUpdateTask, parseUuid,
  parseFileAction, parseFileApproval, parseIdempotencyKey,
} from "../validators/agentic.validator";

export class AgenticController {
  constructor(
    private readonly tasks: AgentTaskService,
    private readonly approvals: ApprovalService,
    private readonly configurations: ConfigurationService,
    private readonly revocations: EmergencyRevocationService,
    private readonly queries: AgenticQueryService,
    private readonly files?: AgenticFileService,
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
    response.json(successResponse("Configuration submitted", await this.configurations.submit({ revisionId: parseUuid(request.params.revisionId), expectedVersion: 0 }, principal(response.locals))));
  });
  readonly activateRevision = handle(async (request, response) => {
    response.json(successResponse("Configuration activated", await this.configurations.activate({ revisionId: parseUuid(request.params.revisionId), ...parseExpectedVersion(request.body) }, principal(response.locals))));
  });
  readonly getRevisionDiff = handle(async (request, response) => {
    response.json(successResponse("Configuration diff retrieved", await this.configurations.getDiff(parseUuid(request.params.revisionId), principal(response.locals))));
  });
  readonly decideRevision = handle(async (request, response) => {
    response.json(successResponse("Configuration decided", await this.configurations.decide({ revisionId: parseUuid(request.params.revisionId), expectedVersion: 0, decision: "reject" }, principal(response.locals))));
  });
  readonly createRevocation = handle(async (request, response) => {
    response.status(201).json(successResponse("Revocation request accepted", await this.revocations.request({ ...parseRevocation(request.body), correlationId: String(response.locals.correlationId) }, principal(response.locals))));
  });
  readonly listAudit = handle(async (request, response) => {
    response.json(successResponse("Agent audit retrieved", await this.queries.listAudit(parseAuditQuery(request.query), principal(response.locals))));
  });
  readonly uploadFile = handle(async (request, response) => {
    if (request.file === undefined) throw new ApplicationError(400, "VALIDATION_ERROR", "Validation failed");
    if (Object.keys(request.body).length !== 0) throw new ApplicationError(400, "VALIDATION_ERROR", "Validation failed");
    const result = await files(this.files).upload({ originalFilename: request.file.originalname, mediaType: request.file.mimetype as "text/csv" | "text/plain", content: request.file.buffer }, principal(response.locals));
    response.status(201).json(successResponse("Agentic file uploaded", fileResponse(result.file)));
  });
  readonly getFile = handle(async (request, response) => {
    response.json(successResponse("Agentic file retrieved", fileResponse(await files(this.files).get(parseUuid(request.params.fileId), principal(response.locals)))));
  });
  readonly previewFile = handle(async (request, response) => {
    response.json(successResponse("Agentic file preview retrieved", await files(this.files).scanAndPreview(parseUuid(request.params.fileId), principal(response.locals))));
  });
  readonly approveFile = handle(async (request, response) => {
    const input = parseFileApproval(request.body);
    const task = await files(this.files).approvePreview({ fileId: parseUuid(request.params.fileId), ...input, idempotencyKey: parseIdempotencyKey(request.headers["idempotency-key"]) }, principal(response.locals));
    response.status(201).json(successResponse("Agentic file preview approved", task));
  });
  readonly rejectFile = handle(async (request, response) => {
    const result = await files(this.files).reject(parseUuid(request.params.fileId), parseFileAction(request.body).expectedFileVersion, principal(response.locals));
    response.json(successResponse("Agentic file rejected", fileResponse(result)));
  });
  readonly deleteFile = handle(async (request, response) => {
    const result = await files(this.files).delete(parseUuid(request.params.fileId), parseFileAction(request.body).expectedFileVersion, principal(response.locals));
    response.json(successResponse("Agentic file deleted", fileResponse(result)));
  });
}

function principal(locals: Record<string, unknown>): StaffPrincipal {
  return locals.staffPrincipal as StaffPrincipal;
}

function handle(operation: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void operation(request, response).catch(next); };
}

function files(service: AgenticFileService | undefined): AgenticFileService {
  if (service === undefined) throw new ApplicationError(503, "FILE_INTAKE_UNAVAILABLE", "Agentic file intake is unavailable");
  return service;
}

function fileResponse(file: AgenticIntakeFile) {
  const { objectKey: _objectKey, ...response } = file;
  return response;
}
