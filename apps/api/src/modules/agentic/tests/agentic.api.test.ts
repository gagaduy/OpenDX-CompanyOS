// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { StaffRole } from "../../../shared/auth/staff-principal";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { createAgenticRouter } from "../presentation/routes/agentic.routes";
import { parseCreateTask, parseDecision, parsePage } from "../presentation/validators/agentic.validator";

describe("Agentic validators", () => {
  it("rejects unknown fields, invalid UUID/version, bounds, and unsafe budgets", () => {
    expect(() => parseCreateTask({ goal: "g", instructions: "i", subtasks: [], dependencies: [], extra: true })).toThrow();
    expect(() => parseCreateTask({ goal: "x".repeat(501), instructions: "i", subtasks: [], dependencies: [] })).toThrow();
    expect(() => parseDecision({ expectedVersion: 0, decision: "approved", reason: "ok" })).toThrow();
    expect(() => parsePage({ page: "1", pageSize: "101" })).toThrow();
  });

  it("normalizes strict valid task and decision input", () => {
    expect(parseCreateTask({ goal: "  Review  ", instructions: "Evidence", subtasks: [], dependencies: [] }).goal).toBe("Review");
    expect(parseDecision({ expectedVersion: 1, decision: "approved", reason: "Valid" }))
      .toEqual({ expectedVersion: 1, decision: "approved", reason: "Valid" });
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

  it("keeps static action segments distinct from resource ids", async () => {
    const application = build("agentic_operator", vi.fn(async () => undefined));
    expect((await application.post("/tasks/00000000-0000-4000-8000-000000000001/ready").send({ expectedVersion: 1 })).body.data.route).toBe("readyTask");
    expect((await application.post("/tasks/00000000-0000-4000-8000-000000000001/cancel").send({ expectedVersion: 1 })).body.data.route).toBe("cancelTask");
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
  };
  app.use(createAgenticRouter(controller, authenticate, appendDenied));
  app.use(createErrorHandler());
  return request(app);
}
