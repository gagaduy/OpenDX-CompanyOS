// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { StaffRole } from "../../../shared/auth/staff-principal";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { AgenticApplicationError } from "../application/services/agentic-application.error";
import { agenticErrorMiddleware } from "../presentation/middleware/agentic-error.middleware";
import { createAgenticRouter } from "../presentation/routes/agentic.routes";
import { createAgenticWorkloadRouter } from "../presentation/routes/agentic-workload.routes";
import {
  parseCancelWorkflow, parseCompleteActivity, parseCreateTask, parseDecision,
  parseFailActivity, parsePage, parseProjectWorkflowState, parseReserveActivity,
  parseStartWorkflow,
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
});

describe("Agentic route authorization", () => {
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

  it("mounts every workload route behind the workload authenticator", async () => {
    const unauthenticated = buildWorkload(false);
    await unauthenticated.get("/workflow-runs/00000000-0000-4000-8000-000000000001/plan").expect(401);

    const application = buildWorkload(true);
    expect((await application.get("/workflow-runs/00000000-0000-4000-8000-000000000001/plan")).body.data.route).toBe("loadPlan");
    expect((await application.post("/workflow-runs/00000000-0000-4000-8000-000000000001/state")).body.data.route).toBe("projectState");
    expect((await application.post("/activity-invocations/reserve")).body.data.route).toBe("reserveActivity");
    expect((await application.post("/activity-invocations/invocation-key/complete")).body.data.route).toBe("completeActivity");
    expect((await application.post("/activity-invocations/invocation-key/fail")).body.data.route).toBe("failActivity");
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
    createRevision: handler("createRevision"), updateRevision: handler("updateRevision"), submitRevision: handler("submitRevision"), getRevisionDiff: handler("getRevisionDiff"), decideRevision: handler("decideRevision"),
    createRevocation: handler("createRevocation"), listAudit: handler("listAudit"),
    startWorkflow: handler("startWorkflow"), getWorkflow: handler("getWorkflow"),
    cancelWorkflow: handler("cancelWorkflow"),
  };
  app.use(createAgenticRouter(controller, controller, authenticate, appendDenied));
  app.use(createErrorHandler());
  return request(app);
}

function buildWorkload(authenticated: boolean) {
  const app = express();
  app.use(express.json());
  const authenticate: RequestHandler = (_request, response, next) => {
    if (!authenticated) {
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
  const handler = (route: string): RequestHandler => (_request, response) => response.json({ success: true, data: { route } });
  app.use(createAgenticWorkloadRouter({
    loadPlan: handler("loadPlan"), projectState: handler("projectState"),
    reserveActivity: handler("reserveActivity"), completeActivity: handler("completeActivity"),
    failActivity: handler("failActivity"),
  }, authenticate));
  app.use(createErrorHandler());
  return request(app);
}
