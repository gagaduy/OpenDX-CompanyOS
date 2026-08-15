// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../../../app";
import { createAgenticToolRouter } from "../presentation/routes/agentic-tool.routes";
import { AgenticToolController } from "../presentation/controllers/agentic-tool.controller";
import { authenticateAgentService } from "../presentation/middleware/agent-service-auth.middleware";
import { agenticErrorMiddleware } from "../presentation/middleware/agentic-error.middleware";

const valid = {
  taskId: "11111111-1111-4111-8111-111111111111",
  toolName: "catalog.product_completeness",
  toolVersion: 1,
  purpose: "store_health_review",
  dataScope: "catalog:health:read",
  dataClassification: "internal",
  modelId: "openai/gpt-5-mini",
  parameters: {},
  idempotencyKey: "invoke-1",
  correlationId: "correlation-1",
  causationId: "causation-1",
};

describe("Agentic department tool API", () => {
  it("allows only the matching active department service identity", async () => {
    const current = fixture();
    await request(current.app).post("/v1/internal/agentic/tools/invoke")
      .send(valid).expect(401);
    await request(current.app).post("/v1/internal/agentic/tools/invoke")
      .set("authorization", "Bearer staff-token").send(valid).expect(401);
    await request(current.app).post("/v1/internal/agentic/tools/invoke")
      .set("authorization", "Bearer worker-token").send(valid).expect(401);
    await request(current.app).post("/v1/internal/agentic/tools/invoke")
      .set("authorization", "Bearer wrong-audience-token").send(valid).expect(401);
    await request(current.app).post("/v1/internal/agentic/tools/invoke")
      .set("authorization", "Bearer inventory-token").send(valid).expect(403);
    await request(current.app).post("/v1/internal/agentic/tools/invoke")
      .set("authorization", "Bearer inactive-token").send(valid).expect(401);
    const response = await request(current.app).post("/v1/internal/agentic/tools/invoke")
      .set("authorization", "Bearer catalog-token").send(valid).expect(200);
    expect(response.body.data).toEqual({ output: { ok: true }, provenanceIds: [] });
    expect(current.tools.invoke).toHaveBeenCalledWith(expect.objectContaining({
      principal: {
        subject: "service-account-agent-catalog",
        clientId: "agent-catalog",
        agentKind: "catalog",
      },
    }));
  });

  it("rejects unknown fields, forged identity, and bodies above 16 KiB", async () => {
    const current = fixture();
    const send = (body: object) => request(current.app)
      .post("/v1/internal/agentic/tools/invoke")
      .set("authorization", "Bearer catalog-token").send(body);
    await send({ ...valid, agentKind: "catalog" }).expect(400);
    await send({ ...valid, unknown: true }).expect(400);
    await send({ ...valid, toolName: "catalog.query" }).expect(400);
    await send({ ...valid, toolVersion: 2 }).expect(400);
    await send({ ...valid, dataScope: "inventory:health:read" }).expect(403);
    await send({ ...valid, dataClassification: "restricted" }).expect(403);
    await send({ ...valid, parameters: { value: "x".repeat(17_000) } }).expect(413);
    expect(current.tools.invoke).not.toHaveBeenCalled();
  });
});

function fixture() {
  const tools = { authorize: vi.fn(), invoke: vi.fn(async () => ({ output: { ok: true }, provenanceIds: [] })) };
  const verifier = {
    verify: vi.fn(async (token: string) => {
      const values: Record<string, { sub: string; azp: string }> = {
        "catalog-token": { sub: "service-account-agent-catalog", azp: "agent-catalog" },
        "inventory-token": { sub: "service-account-agent-inventory", azp: "agent-inventory" },
        "inactive-token": { sub: "service-account-agent-inactive", azp: "agent-inactive" },
        "worker-token": { sub: "service-account-opendx-agentic-worker", azp: "opendx-agentic-worker" },
      };
      if (token === "wrong-audience-token") throw new Error("wrong audience");
      const value = values[token];
      if (value === undefined) throw new Error("invalid token");
      return value;
    }),
  };
  const identities = {
    resolve: vi.fn(async (clientId: string) => clientId === "agent-catalog"
      ? { agentKind: "catalog" as const, active: true }
      : clientId === "agent-inventory"
        ? { agentKind: "inventory" as const, active: true }
        : clientId === "agent-inactive"
          ? { agentKind: "catalog" as const, active: false }
          : undefined),
  };
  const router = createAgenticToolRouter(
    new AgenticToolController(tools as never),
    authenticateAgentService(verifier as never, identities),
  );
  router.use(agenticErrorMiddleware);
  return { app: createApiApp({ agenticToolRouter: router }), tools };
}
