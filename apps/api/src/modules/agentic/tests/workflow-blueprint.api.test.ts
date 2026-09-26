// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import type { WorkflowBlueprintRepository } from "../application/repositories/interfaces/workflow-blueprint.repository";
import { WorkflowBlueprintController } from "../presentation/controllers/workflow-blueprint.controller";
import { createAgenticRouter } from "../presentation/routes/agentic.routes";

describe("WorkflowBlueprint API endpoints", () => {
  const mockBlueprint = {
    id: "wf-customer-recovery-v1",
    code: "WF-CSKH-RECOVERY",
    name: "Cứu Khách Hàng Khiếu Nại & Bồi Thường",
    category: "customer_recovery",
    description: "Tự động phân loại bức xúc của khách hàng",
    targetOutcome: "Xoa dịu khách hàng trong vòng 5 phút",
    version: "v1.0",
    status: "published" as const,
    nodes: [{ id: "node-1", type: "event" }],
    edges: [{ id: "e1-2", source: "node-1", target: "node-2" }],
    policyRules: { auto_approval_threshold: 200000 },
    publishedAt: "2026-09-25T09:00:00.000Z",
    createdAt: "2026-09-25T09:00:00.000Z",
    updatedAt: "2026-09-25T09:00:00.000Z",
  };

  const mockRepo: WorkflowBlueprintRepository = {
    listBlueprints: vi.fn().mockResolvedValue([mockBlueprint]),
    findById: vi.fn().mockImplementation(async (id: string) =>
      id === mockBlueprint.id ? mockBlueprint : null,
    ),
    findByCode: vi.fn().mockImplementation(async (code: string) =>
      code === mockBlueprint.code ? mockBlueprint : null,
    ),
    saveDraft: vi.fn().mockImplementation(async (id: string, draft: any) => ({
      ...mockBlueprint,
      ...draft,
      status: "draft",
    })),
    publish: vi.fn().mockImplementation(async (id: string, pub: any) => ({
      ...mockBlueprint,
      ...pub,
      status: "published",
      version: pub.version ?? "v1.1",
    })),
  };

  const createTestApp = (role = "administrator") => {
    const app = express();
    app.use(express.json());

    const authenticate: express.RequestHandler = (_req, res, next) => {
      res.locals.staffPrincipal = {
        id: "staff-1",
        roles: [role],
        name: "Test Staff",
      };
      next();
    };

    const appendDenied = vi.fn().mockResolvedValue(undefined);
    const handler = (route: string): express.RequestHandler => (_request, response) =>
      response.json({ success: true, data: { route } });
    const mockController: any = new Proxy({}, { get: (_, prop) => handler(String(prop)) });
    const mockWorkflows: any = new Proxy({}, { get: (_, prop) => handler(String(prop)) });
    const blueprintController = new WorkflowBlueprintController(mockRepo);

    const router = createAgenticRouter(
      mockController,
      mockWorkflows,
      authenticate,
      appendDenied,
      blueprintController,
    );

    app.use("/api/v1/agentic", router);
    app.use(createErrorHandler());
    return app;
  };

  it("GET /api/v1/agentic/workflows returns list of blueprints", async () => {
    const app = createTestApp();
    const res = await request(app).get("/api/v1/agentic/workflows");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].code).toBe("WF-CSKH-RECOVERY");
  });

  it("GET /api/v1/agentic/workflows/:id returns single blueprint", async () => {
    const app = createTestApp();
    const res = await request(app).get("/api/v1/agentic/workflows/wf-customer-recovery-v1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Cứu Khách Hàng Khiếu Nại & Bồi Thường");
  });

  it("GET /api/v1/agentic/workflows/:id returns 404 for unknown blueprint", async () => {
    const app = createTestApp();
    const res = await request(app).get("/api/v1/agentic/workflows/unknown-id");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("PUT /api/v1/agentic/workflows/:id/draft saves draft changes", async () => {
    const app = createTestApp();
    const res = await request(app)
      .put("/api/v1/agentic/workflows/wf-customer-recovery-v1/draft")
      .send({
        policyRules: { auto_approval_threshold: 500000 },
        description: "Updated description",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRepo.saveDraft).toHaveBeenCalledWith(
      "wf-customer-recovery-v1",
      expect.objectContaining({
        policyRules: { auto_approval_threshold: 500000 },
        description: "Updated description",
      }),
    );
  });

  it("POST /api/v1/agentic/workflows/:id/publish publishes and increments version", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/api/v1/agentic/workflows/wf-customer-recovery-v1/publish")
      .send({
        nodes: [{ id: "node-1", type: "event" }],
        edges: [{ id: "e1-2", source: "node-1", target: "node-2" }],
        version: "v1.1",
        policyRules: { auto_approval_threshold: 500000 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRepo.publish).toHaveBeenCalledWith(
      "wf-customer-recovery-v1",
      expect.objectContaining({
        version: "v1.1",
        policyRules: { auto_approval_threshold: 500000 },
      }),
    );
  });
});
