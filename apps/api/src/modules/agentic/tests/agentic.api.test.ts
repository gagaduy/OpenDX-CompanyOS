// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { StaffRole } from "../../../shared/auth/staff-principal";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { AgenticApplicationError } from "../application/services/agentic-application.error";
import { AgenticController } from "../presentation/controllers/agentic.controller";
import { AgenticWorkloadController } from "../presentation/controllers/agentic-workload.controller";
import { agenticErrorMiddleware } from "../presentation/middleware/agentic-error.middleware";
import { createAgenticRouter } from "../presentation/routes/agentic.routes";
import { createAgenticWorkloadRouter } from "../presentation/routes/agentic-workload.routes";
import {
  parseCancelWorkflow, parseCompleteActivity, parseCreateTask, parseDecision,
  parseFailActivity, parsePage, parseProjectWorkflowState, parseReserveActivity,
  parseStartWorkflow, parseReserveModelRun, parseStartModelRun,
  parseCompleteModelRun, parseFailModelRun,
  parseAcceptOrchestrationPlan,
  parseAcceptedOrchestrationResult, parseCollaborationRequest, parseExecutiveReport,
} from "../presentation/validators/agentic.validator";

describe("Agentic validators", () => {
  const provenance = { sourceType: "staff_intake", sourceId: "user", sourceDigest: "a".repeat(64), classification: "internal" };
  it("rejects unknown fields, invalid UUID/version, bounds, and unsafe budgets", () => {
    expect(() => parseCreateTask({ goal: "g", instructions: "i", provenance, subtasks: [], dependencies: [], extra: true })).toThrow();
    expect(() => parseCreateTask({ goal: "x".repeat(501), instructions: "i", provenance, subtasks: [], dependencies: [] })).toThrow();
    expect(() => parseDecision({ expectedVersion: 0, decision: "approved", reason: "ok" })).toThrow();
    expect(() => parsePage({ page: "1", pageSize: "101" })).toThrow();
  });

  it("normalizes strict valid task and decision input", () => {
    expect(parseCreateTask({ goal: "  Review  ", instructions: "Evidence", provenance, subtasks: [], dependencies: [] }).goal).toBe("Review");
    expect(parseDecision({ expectedVersion: 1, decision: "approved", reason: "Valid" }))
      .toEqual({ expectedVersion: 1, decision: "approved", reason: "Valid" });
  });

  it("accepts only bounded strict workflow and activity DTOs", () => {
    expect(parseStartWorkflow({ expectedVersion: 2, workflowVersion: 1 }))
      .toEqual({ expectedVersion: 2, workflowVersion: 1 });
    expect(() => parseStartWorkflow({ expectedVersion: 2, workflowVersion: 1, extra: true }))
      .toThrow();
    expect(() => parseStartWorkflow({ expectedVersion: 2, workflowVersion: 2 }))
      .toThrow();
    expect(parseCancelWorkflow({ expectedVersion: 3, reasonCode: "CANCELED_BY_OPERATOR" }))
      .toEqual({ expectedVersion: 3, reasonCode: "CANCELED_BY_OPERATOR" });
    expect(() => parseCancelWorkflow({ expectedVersion: 3, reasonCode: "free form note" }))
      .toThrow();
    expect(parseProjectWorkflowState({ projectionSequence: 1, state: "planning" }))
      .toEqual({ projectionSequence: 1, state: "planning" });
    expect(() => parseProjectWorkflowState({ projectionSequence: 1, state: "unknown" }))
      .toThrow();
    expect(parseReserveActivity({
      invocationKey: `run:1:execute_fake_analysis:branch:${"a".repeat(64)}`,
      runId: "00000000-0000-4000-8000-000000000001",
      activityKind: "execute_fake_analysis",
      branchId: "00000000-0000-4000-8000-000000000002",
      inputDigest: "a".repeat(64),
    }).inputDigest).toHaveLength(64);
    expect(() => parseReserveActivity({
      invocationKey: "key",
      runId: "not-a-uuid",
      activityKind: "execute_fake_analysis",
      inputDigest: "unsafe",
    })).toThrow();
    expect(parseCompleteActivity({
      expectedVersion: 1,
      outcomeCode: "FAKE_ANALYSIS_COMPLETED",
      safeResult: { status: "usable" },
    }).safeResult).toEqual({ status: "usable" });
    expect(parseFailActivity({ expectedVersion: 1, outcomeCode: "RETRY_EXHAUSTED" }))
      .toEqual({ expectedVersion: 1, outcomeCode: "RETRY_EXHAUSTED" });
  });

  it("accepts only digest-only model-run control DTOs", () => {
    const reserve = {
      taskId: "00000000-0000-4000-8000-000000000001",
      agentKind: "catalog", generationRound: 0, idempotencyKey: "catalog-round-0",
      inputDigest: "a".repeat(64), primaryModel: "google/gemma-4-26b-a4b-it:free",
      fallbackModel: "liquid/lfm-2.5-2.6b:free",
    };
    expect(parseReserveModelRun(reserve)).toEqual(reserve);
    expect(() => parseReserveModelRun({ ...reserve, delegation: { agentKind: "finance" } })).toThrow();
    expect(() => parseReserveModelRun({ ...reserve, prompt: "secret" })).toThrow();
    expect(() => parseReserveModelRun({ ...reserve, generationRound: 3 })).toThrow();
    expect(parseStartModelRun({
      expectedVersion: 1, returnedModel: reserve.primaryModel, fallbackPosition: 0,
    })).toMatchObject({ fallbackPosition: 0 });
    const terminal = {
      expectedVersion: 2, idempotencyKey: "catalog-round-0-terminal", status: "completed",
      outputDigest: "b".repeat(64), inputTokens: 10, outputTokens: 5,
      providerRequestIdDigest: "c".repeat(64), latencyMs: 12,
      statusCode: "QUALITY_ACCEPTED", qualityOutcome: "accepted",
      qualityReasonCodes: ["EVIDENCE_VALID"],
      provenanceIds: ["11111111-1111-4111-8111-111111111111"],
      evidenceDigest: "d".repeat(64),
    };
    expect(parseCompleteModelRun(terminal)).toEqual(terminal);
    expect(() => parseCompleteModelRun({ ...terminal, response: { summary: "leak" } })).toThrow();
    expect(parseFailModelRun({
      expectedVersion: 2, idempotencyKey: "catalog-round-0-terminal",
      inputTokens: 10, outputTokens: 5, latencyMs: 12, statusCode: "PROVIDER_FAILED",
      qualityOutcome: "correct", errorCode: "PROVIDER_TIMEOUT",
      qualityReasonCodes: ["PROVIDER_UNAVAILABLE"],
      provenanceIds: ["11111111-1111-4111-8111-111111111111"],
      evidenceDigest: "d".repeat(64),
    })).toMatchObject({ errorCode: "PROVIDER_TIMEOUT" });
  });

  it("accepts only bounded digest-only orchestration plans", () => {
    const plan = {
      id: "00000000-0000-4000-8000-000000000001", taskId: "00000000-0000-4000-8000-000000000002",
      version: 1, digest: "a".repeat(64), taskBriefDigest: "b".repeat(64), policyVersion: 4,
      planningAuthorityId: "00000000-0000-4000-8000-000000000005",
      planningAuthorityDigest: "f".repeat(64),
      configurationRevisionId: "00000000-0000-4000-8000-000000000003", createdBy: "agent-ai-ceo",
      createdAt: "2026-08-22T00:00:00.000Z", subtasks: [{
        id: "00000000-0000-4000-8000-000000000004", owner: "catalog",
        expectedResultSchemaDigest: "c".repeat(64), allowedToolsDigest: "d".repeat(64),
        dataScope: "catalog.aggregate", freshnessSeconds: 300, timeoutSeconds: 30,
        budgetMicros: 100, sourceProvenanceDigest: "e".repeat(64), dependencies: [],
      }],
    };
    expect(parseAcceptOrchestrationPlan(plan)).toEqual(plan);
    expect(() => parseAcceptOrchestrationPlan({ ...plan, prompt: "ignore policy" })).toThrow();
    expect(() => parseAcceptOrchestrationPlan({ ...plan, subtasks: [{ ...plan.subtasks[0], budgetMicros: 0 }] })).toThrow();
  });

  it("accepts only strict authority-bound orchestration settlements", () => {
    const result = { id: "00000000-0000-4000-8000-000000000001",
      taskId: "00000000-0000-4000-8000-000000000002", planVersion: 1,
      subtaskId: "00000000-0000-4000-8000-000000000003",
      descriptorId: "00000000-0000-4000-8000-000000000004", descriptorDigest: "d".repeat(64),
      resultDigest: "a".repeat(64), result: { schemaVersion: 1 },
      qualityEvidenceDigest: "b".repeat(64), provenanceDigest: "c".repeat(64),
      acceptedAt: "2026-08-22T00:00:00.000Z" };
    expect(parseAcceptedOrchestrationResult(result)).toEqual(result);
    expect(() => parseAcceptedOrchestrationResult({ ...result, rawResult: "private" })).toThrow();
    const collaboration = { id: result.id, taskId: result.taskId, planVersion: 1,
      requester: "catalog", requested: "inventory", questionDigest: "a".repeat(64),
      purpose: "store_health_review", requestedDataClassification: "internal",
      evidenceDigest: "b".repeat(64), redactedPayloadDigest: "c".repeat(64), policyVersion: 4,
      policyDecision: "ALLOW", idempotencyKey: "collaboration:1", createdAt: result.acceptedAt };
    expect(parseCollaborationRequest(collaboration)).toEqual(collaboration);
    expect(() => parseCollaborationRequest({ ...collaboration, requested: "catalog" })).toThrow();
    const report = { id: result.id, taskId: result.taskId, planVersion: 1,
      reportDigest: "a".repeat(64), authorityId: result.descriptorId,
      authorityDigest: "e".repeat(64), completionState: "partial",
      conclusionProvenanceDigest: "b".repeat(64), unavailableBranchesDigest: "c".repeat(64),
      costMicros: 0, approvalHistoryDigest: "d".repeat(64), createdAt: result.acceptedAt,
      report: { schemaVersion: 1 } };
    expect(parseExecutiveReport(report)).toEqual(report);
    expect(() => parseExecutiveReport({ ...report, conclusions: [] })).toThrow();
  });
});

describe("Agentic route authorization", () => {
  it("exposes governed file intake with one bounded multipart file and no private storage metadata", async () => {
    const application = buildFiles("agentic_governance_admin");
    const uploaded = await application.post("/files")
      .field("ignored", "no")
      .attach("file", Buffer.from("name\nAda\n"), { filename: "people.csv", contentType: "text/csv" })
      .expect(400);
    expect(uploaded.body.errorCode).toBe("VALIDATION_ERROR");

    const accepted = await application.post("/files")
      .attach("file", Buffer.from("name\nAda\n"), { filename: "people.csv", contentType: "text/csv" })
      .expect(201);
    expect(accepted.body.data).toEqual(expect.objectContaining({ id: FILE_ID, status: "uploaded" }));
    expect(accepted.body.data).not.toHaveProperty("objectKey");
    expect(accepted.body.data).not.toHaveProperty("content");

    await application.post("/files")
      .attach("file", Buffer.from("first"), { filename: "first.txt", contentType: "text/plain" })
      .attach("file", Buffer.from("second"), { filename: "second.txt", contentType: "text/plain" })
      .expect(400);

    await application.post("/files")
      .field("unexpected", "field")
      .field("another", "field")
      .attach("file", Buffer.from("name\nAda\n"), { filename: "people.csv", contentType: "text/csv" })
      .expect(400);

    await application.post("/files").expect(400);

    await application.post("/files")
      .attach("file", Buffer.alloc(2 * 1024 * 1024 + 1), { filename: "too-large.csv", contentType: "text/csv" })
      .expect(413);

    await application.post("/files")
      .attach("file", Buffer.from("not executable bytes"), { filename: "payload.exe", contentType: "text/plain" })
      .expect(400);
    await application.post("/files")
      .attach("file", Buffer.from("sku,quantity\nSKU-1,4\n"), { filename: "stock.csv", contentType: "text/plain" })
      .expect(400);
  });

  it("limits file routes to governance administrators and returns only metadata or previews", async () => {
    const denied = await buildFiles("agentic_operator").get(`/files/${FILE_ID}`).expect(403);
    expect(denied.body.errorCode).toBe("FORBIDDEN");

    const application = buildFiles("administrator");
    const metadata = await application.get(`/files/${FILE_ID}`).expect(200);
    expect(metadata.body.data).toEqual(expect.objectContaining({ id: FILE_ID, status: "previewed" }));
    expect(metadata.body.data).not.toHaveProperty("objectKey");
    const preview = await application.get(`/files/${FILE_ID}/preview`).expect(200);
    expect(preview.body.data).toEqual(expect.objectContaining({ fileId: FILE_ID, samples: ["name", "Ada"] }));
    expect(preview.body.data).not.toHaveProperty("content");
  });

  it("does not leak a private file to another governance administrator", async () => {
    const response = await buildFiles("agentic_governance_admin", "other-governance-admin").get(`/files/${FILE_ID}`).expect(403);
    expect(response.body.errorCode).toBe("FORBIDDEN");
    expect(response.body).not.toHaveProperty("data");
  });

  it("returns 503 when the private file scanner is unavailable", async () => {
    const response = await buildFiles("agentic_governance_admin", "governance-admin", true).get(`/files/${FILE_ID}/preview`).expect(503);
    expect(response.body.errorCode).toBe("FILE_SCAN_FAILED");
  });

  it("validates file approval versions and maps duplicate approval idempotency keys", async () => {
    const application = buildFiles("agentic_governance_admin");
    await application.post(`/files/${FILE_ID}/approve`)
      .set("idempotency-key", "file-approval-1")
      .send({ expectedFileVersion: 2, previewVersion: 1, previewPayloadDigest: "a".repeat(64), extra: true })
      .expect(400);
    await application.post(`/files/${FILE_ID}/approve`)
      .set("idempotency-key", "duplicate-key")
      .send({ expectedFileVersion: 2, previewVersion: 1, previewPayloadDigest: "a".repeat(64) })
      .expect(409);
    await application.post(`/files/${FILE_ID}/reject`).send({ expectedFileVersion: 2 }).expect(200);
    await application.post(`/files/${FILE_ID}/delete`).send({ expectedFileVersion: 3 }).expect(200);
  });

  it("requires authentication, enforces minimum roles, and audits denial", async () => {
    const denied = vi.fn(async () => undefined);
    expect((await build(undefined, denied).get("/tasks")).status).toBe(401);
    expect((await build("catalog_manager", denied).get("/tasks")).status).toBe(403);
    expect(denied).toHaveBeenCalledOnce();
    expect((await build("agentic_operator", denied).get("/tasks")).status).toBe(200);
    expect((await build("agentic_auditor", denied).get("/audit")).status).toBe(200);
    expect((await build("agentic_operator", denied).post("/configuration-revisions").send({})).status).toBe(403);
  });

  it("maps workflow conflicts and invalid bindings to bounded API errors", async () => {
    const app = express();
    app.get("/:code", (request, _response, next) => {
      next(new AgenticApplicationError(request.params.code!, "Safe workflow error"));
    });
    app.use(agenticErrorMiddleware, createErrorHandler());

    const conflict = await request(app).get("/WORKFLOW_SIGNAL_CONFLICT").expect(409);
    expect(conflict.body).toMatchObject({
      success: false,
      errorCode: "WORKFLOW_SIGNAL_CONFLICT",
      message: "Safe workflow error",
    });
    const invalid = await request(app).get("/APPROVAL_BINDING_INVALID").expect(422);
    expect(invalid.body.errorCode).toBe("APPROVAL_BINDING_INVALID");
    const auditUnavailable = await request(app).get("/AUDIT_UNAVAILABLE").expect(503);
    expect(auditUnavailable.body).toMatchObject({
      errorCode: "AUDIT_UNAVAILABLE",
      message: "Safe workflow error",
    });
    const scanUnavailable = await request(app).get("/FILE_SCAN_FAILED").expect(503);
    expect(scanUnavailable.body.errorCode).toBe("FILE_SCAN_FAILED");
  });

  it("keeps static action segments distinct from resource ids", async () => {
    const application = build("agentic_operator", vi.fn(async () => undefined));
    expect((await application.post("/tasks/00000000-0000-4000-8000-000000000001/ready").send({ expectedVersion: 1 })).body.data.route).toBe("readyTask");
    expect((await application.post("/tasks/00000000-0000-4000-8000-000000000001/cancel").send({ expectedVersion: 1 })).body.data.route).toBe("cancelTask");
    expect((await application.post("/tasks/00000000-0000-4000-8000-000000000001/start").send({ expectedVersion: 1, workflowVersion: 1 })).body.data.route).toBe("startWorkflow");
    expect((await application.get("/workflow-runs/00000000-0000-4000-8000-000000000002")).body.data.route).toBe("getWorkflow");
    expect((await application.post("/workflow-runs/00000000-0000-4000-8000-000000000002/cancel").send({ expectedVersion: 1, reasonCode: "CANCELED_BY_OPERATOR" })).body.data.route).toBe("cancelWorkflow");
  });

  it("protects workflow staff routes with operator and reader roles", async () => {
    const denied = vi.fn(async () => undefined);
    expect((await build("agentic_approver", denied)
      .post("/tasks/00000000-0000-4000-8000-000000000001/start")).status).toBe(403);
    expect((await build("agentic_approver", denied)
      .get("/workflow-runs/00000000-0000-4000-8000-000000000002")).status).toBe(200);
    expect((await build("agentic_operator", denied)
      .post("/workflow-runs/00000000-0000-4000-8000-000000000002/cancel")).status).toBe(200);
  });

  it("separates worker orchestration routes from AI CEO plan submission", async () => {
    const unauthenticated = buildWorkload(false, false);
    await unauthenticated.get("/workflow-runs/00000000-0000-4000-8000-000000000001/plan").expect(401);
    await unauthenticated.post("/orchestration/plans").expect(401);

    const application = buildWorkload(true, true);
    expect((await application.get("/workflow-runs/00000000-0000-4000-8000-000000000001/plan")).body.data.route).toBe("loadPlan");
    expect((await application.post("/workflow-runs/00000000-0000-4000-8000-000000000001/state")).body.data.route).toBe("projectState");
    expect((await application.post("/activity-invocations/reserve")).body.data.route).toBe("reserveActivity");
    expect((await application.post("/activity-invocations/invocation-key/complete")).body.data.route).toBe("completeActivity");
    expect((await application.post("/activity-invocations/invocation-key/fail")).body.data.route).toBe("failActivity");
    expect((await application.post("/model-runs/reserve")).body.data.route).toBe("reserveModelRun");
    expect((await application.post("/model-runs/00000000-0000-4000-8000-000000000001/start")).body.data.route).toBe("startModelRun");
    expect((await application.post("/model-runs/00000000-0000-4000-8000-000000000001/complete")).body.data.route).toBe("completeModelRun");
    expect((await application.post("/model-runs/00000000-0000-4000-8000-000000000001/fail")).body.data.route).toBe("failModelRun");
    expect((await application.post("/orchestration/plans")).body.data.route).toBe("acceptOrchestrationPlan");
    expect((await application.get("/orchestration/task-briefs/00000000-0000-4000-8000-000000000001")).body.data.route).toBe("loadTaskBrief");
    expect((await application.get("/orchestration/dispatch-plans/00000000-0000-4000-8000-000000000001")).body.data.route).toBe("loadDispatchPlan");
    expect((await application.get("/orchestration/descriptors/00000000-0000-4000-8000-000000000001")).body.data.route).toBe("loadExecutionDescriptor");
    expect((await application.get("/orchestration/ai-ceo-authorities/00000000-0000-4000-8000-000000000001")).body.data.route).toBe("loadAiCeoExecutionAuthority");
    expect((await application.post("/orchestration/synthesis-contexts")).body.data.route).toBe("loadSynthesisContext");
    expect((await application.post("/orchestration/results")).body.data.route).toBe("acceptOrchestrationResult");
    expect((await application.post("/orchestration/collaborations")).body.data.route).toBe("mediateOrchestrationCollaboration");
    expect((await application.post("/orchestration/reports")).body.data.route).toBe("acceptExecutiveReport");

    await buildWorkload(true, false).post("/orchestration/plans").expect(401);
    await buildWorkload(false, true)
      .get("/workflow-runs/00000000-0000-4000-8000-000000000001/plan").expect(401);
  });

  it("marks private orchestration reads as non-cacheable", async () => {
    const app = express();
    app.use(express.json());
    const orchestration = {
      loadTaskBrief: vi.fn().mockResolvedValue({ taskId: "task", digest: "a".repeat(64) }),
      loadAiCeoExecutionAuthority: vi.fn().mockResolvedValue({ authority: { id: "authority" }, payload: {} }),
    };
    const controller = new AgenticWorkloadController({} as never, {} as never, orchestration as never);
    const workerAuth: RequestHandler = (_request, response, next) => {
      response.locals.workloadPrincipal = { subject: "worker", clientId: "opendx-agentic-worker", workload: "agentic_worker" };
      next();
    };
    app.use(createAgenticWorkloadRouter(controller, workerAuth, workerAuth));
    app.use(agenticErrorMiddleware, createErrorHandler());

    const response = await request(app)
      .get("/orchestration/task-briefs/00000000-0000-4000-8000-000000000001").expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(response.body)).not.toContain("authorization");
    const authority = await request(app)
      .get("/orchestration/ai-ceo-authorities/00000000-0000-4000-8000-000000000001")
      .set("x-opendx-authority-digest", "a".repeat(64)).expect(200);
    expect(authority.headers["cache-control"]).toBe("no-store");
  });
});

function build(role: StaffRole | undefined, appendDenied: () => Promise<void>) {
  const app = express();
  app.use(express.json());
  const authenticate: RequestHandler = (_request, response, next) => {
    if (role !== undefined) response.locals.staffPrincipal = { subject: "user", displayName: "User", roles: [role] };
    response.locals.correlationId = "corr";
    next();
  };
  const handler = (route: string): RequestHandler => (_request, response) => response.json({ success: true, data: { route } });
  const controller = {
    createTask: handler("createTask"), listTasks: handler("listTasks"), getTask: handler("getTask"), updateTask: handler("updateTask"), readyTask: handler("readyTask"), cancelTask: handler("cancelTask"),
    listApprovals: handler("listApprovals"), getApproval: handler("getApproval"), decideApproval: handler("decideApproval"),
    listEmployees: handler("listEmployees"), getEmployee: handler("getEmployee"),
    createRevision: handler("createRevision"), updateRevision: handler("updateRevision"), submitRevision: handler("submitRevision"), activateRevision: handler("activateRevision"), getRevisionDiff: handler("getRevisionDiff"), decideRevision: handler("decideRevision"),
    createRevocation: handler("createRevocation"), listAudit: handler("listAudit"),
    uploadFile: handler("uploadFile"), getFile: handler("getFile"), previewFile: handler("previewFile"),
    approveFile: handler("approveFile"), rejectFile: handler("rejectFile"), deleteFile: handler("deleteFile"),
    startWorkflow: handler("startWorkflow"), getWorkflow: handler("getWorkflow"),
    cancelWorkflow: handler("cancelWorkflow"),
  };
  app.use(createAgenticRouter(controller, controller, authenticate, appendDenied));
  app.use(createErrorHandler());
  return request(app);
}

const FILE_ID = "00000000-0000-4000-8000-000000000010";

function buildFiles(role: StaffRole, subject = "governance-admin", scannerUnavailable = false) {
  const app = express();
  app.use(express.json());
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.staffPrincipal = { subject, displayName: "Governance admin", roles: [role] };
    response.locals.correlationId = "corr";
    next();
  };
  const files = {
    upload: vi.fn(async (input: { originalFilename: string; mediaType: string }) => {
      const extension = input.originalFilename.slice(input.originalFilename.lastIndexOf(".") + 1);
      if ((extension === "csv" && input.mediaType !== "text/csv") || (extension === "txt" && input.mediaType !== "text/plain") || !["csv", "txt"].includes(extension)) {
        throw new AgenticApplicationError("FILE_TYPE_NOT_ALLOWED", "Only CSV and plain-text file intake is allowed");
      }
      return { file: { ...fileMetadata(), status: "uploaded" as const, version: 1 } };
    }),
    get: vi.fn(async (_fileId: string, principal: { subject: string }) => {
      if (principal.subject !== "governance-admin") throw new AgenticApplicationError("FORBIDDEN", "Agentic file access is limited to its governance owner");
      return fileMetadata();
    }),
    scanAndPreview: vi.fn(async () => {
      if (scannerUnavailable) throw new AgenticApplicationError("FILE_SCAN_FAILED", "Scanner is unavailable");
      return preview();
    }),
    approvePreview: vi.fn(async (input: { idempotencyKey: string }) => {
      if (input.idempotencyKey === "duplicate-key") throw new AgenticApplicationError("IDEMPOTENCY_CONFLICT", "Idempotency key is already bound");
      return { id: "00000000-0000-4000-8000-000000000011", state: "draft" as const, createdBy: "governance-admin", goal: "Review intake file: people.csv", instructions: "Review the approved file preview.", version: 1, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" };
    }),
    reject: vi.fn(async () => ({ ...fileMetadata(), status: "rejected" as const, version: 3 })),
    delete: vi.fn(async () => ({ ...fileMetadata(), status: "deleted" as const, version: 4 })),
  };
  const controller = new AgenticController({} as never, {} as never, {} as never, {} as never, {} as never, files);
  const workflow = {
    startWorkflow: (_request: express.Request, response: express.Response) => response.json({ success: true }),
    getWorkflow: (_request: express.Request, response: express.Response) => response.json({ success: true }),
    cancelWorkflow: (_request: express.Request, response: express.Response) => response.json({ success: true }),
  };
  app.use(createAgenticRouter(controller, workflow, authenticate, vi.fn(async () => undefined)));
  app.use(agenticErrorMiddleware, createErrorHandler());
  return request(app);
}

function fileMetadata() {
  return { id: FILE_ID, objectKey: "agentic-intake/private", originalFilename: "people.csv", format: "csv" as const, mediaType: "text/csv" as const, byteSize: 9, payloadDigest: "a".repeat(64), status: "previewed" as const, createdBy: "governance-admin", version: 2, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" };
}

function preview() {
  return { fileId: FILE_ID, previewVersion: 1, parserVersion: "bounded-csv-txt-v1", payloadDigest: "a".repeat(64), previewDigest: "b".repeat(64), format: "csv" as const, rowCount: 2, columnCount: 1, samples: ["name", "Ada"], sourceReferences: [{ fileId: FILE_ID, line: 1 }] };
}

function buildWorkload(workerAuthenticated: boolean, agentAuthenticated: boolean) {
  const app = express();
  app.use(express.json());
  const authenticate: RequestHandler = (_request, response, next) => {
    if (!workerAuthenticated) {
      response.status(401).json({ errorCode: "UNAUTHORIZED" });
      return;
    }
    response.locals.workloadPrincipal = {
      subject: "service-account-opendx-agentic-worker",
      clientId: "opendx-agentic-worker",
      workload: "agentic_worker",
    };
    next();
  };
  const authenticateAgent: RequestHandler = (_request, response, next) => {
    if (!agentAuthenticated) {
      response.status(401).json({ errorCode: "UNAUTHORIZED" });
      return;
    }
    response.locals.agentServicePrincipal = {
      subject: "service-account-agent-ai-ceo",
      clientId: "agent-ai-ceo",
      agentKind: "ai_ceo",
    };
    next();
  };
  const handler = (route: string): RequestHandler => (_request, response) => response.json({ success: true, data: { route } });
  app.use(createAgenticWorkloadRouter({
    loadPlan: handler("loadPlan"), projectState: handler("projectState"),
    reserveActivity: handler("reserveActivity"), completeActivity: handler("completeActivity"),
    failActivity: handler("failActivity"),
    reserveModelRun: handler("reserveModelRun"), startModelRun: handler("startModelRun"),
    completeModelRun: handler("completeModelRun"), failModelRun: handler("failModelRun"),
    acceptOrchestrationPlan: handler("acceptOrchestrationPlan"),
    loadTaskBrief: handler("loadTaskBrief"), loadDispatchPlan: handler("loadDispatchPlan"),
    loadExecutionDescriptor: handler("loadExecutionDescriptor"),
    loadAiCeoExecutionAuthority: handler("loadAiCeoExecutionAuthority"),
    loadSynthesisContext: handler("loadSynthesisContext"),
    acceptOrchestrationResult: handler("acceptOrchestrationResult"),
    mediateOrchestrationCollaboration: handler("mediateOrchestrationCollaboration"),
    acceptExecutiveReport: handler("acceptExecutiveReport"),
  }, authenticate, authenticateAgent));
  app.use(createErrorHandler());
  return request(app);
}
