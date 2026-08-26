// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessTokenProvider } from "../../../../shared/auth/client-credentials-token-provider";
import {
  HttpWorkflowGateway,
  WorkflowGatewayTransportError,
} from "./http-workflow.gateway";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) =>
  new Promise<void>((resolve) => server.close(() => resolve())))));

describe("HttpWorkflowGateway", () => {
  it("maps every fixed endpoint with bearer, correlation, and idempotency headers", async () => {
    const received: Array<{ method?: string; url?: string; headers: IncomingMessage["headers"]; body: unknown }> = [];
    const baseUrl = await listen(async (request, response) => {
      received.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: await readJson(request),
      });
      if (request.url === "/ready") return json(response, 200, { status: "ready" });
      if (request.url === "/internal/agentic/workflow-runs/start") {
        return json(response, 200, { temporalRunId: "temporal-run-1", duplicate: false });
      }
      if (request.method === "GET") return json(response, 200, { status: "running", temporalRunId: "temporal-run-1" });
      response.writeHead(204).end();
    });
    const gateway = createGateway(baseUrl);

    await gateway.probe();
    await expect(gateway.start({
      workflowRunId: "run-1", temporalWorkflowId: "store-health-v1:run-1",
      taskId: "task-1", workflowVersion: 1, planRevision: 2, executionProfile: "advanced_live",
    })).resolves.toEqual({ temporalRunId: "temporal-run-1", duplicate: false });
    await gateway.signalApproval({
      temporalWorkflowId: "store-health-v1:run-1", idempotencyKey: "receipt-1",
      approvalId: "approval-1", payloadDigest: "a".repeat(64), decision: "approved",
      applicationDecisionVersion: 2,
    });
    await gateway.signalCancellation({
      temporalWorkflowId: "store-health-v1:run-1", idempotencyKey: "receipt-2",
      payloadDigest: "b".repeat(64), reasonCode: "CANCELED_BY_OPERATOR",
    });
    await expect(gateway.describe("store-health-v1:run-1"))
      .resolves.toEqual({ status: "running", temporalRunId: "temporal-run-1" });

    expect(received[1]).toMatchObject({
      method: "POST",
      url: "/internal/agentic/workflow-runs/start",
      body: {
        workflowRunId: "run-1", temporalWorkflowId: "store-health-v1:run-1",
        taskId: "task-1", workflowVersion: 1, planRevision: 2, executionProfile: "advanced_live",
      },
    });
    expect(received[1]?.headers.authorization).toBe("Bearer control-token");
    expect(received[1]?.headers["x-correlation-id"]).toBe("run-1");
    expect(received[2]?.headers["idempotency-key"]).toBe("receipt-1");
    expect(received[3]?.headers["idempotency-key"]).toBe("receipt-2");
  });

  it("classifies timeout and 5xx as retryable and 4xx as non-retryable", async () => {
    const timeoutUrl = await listen(async (_request, response) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      json(response, 200, { status: "ready" });
    });
    await expect(createGateway(timeoutUrl, 10).probe()).rejects.toMatchObject({ retryable: true });

    for (const [status, retryable] of [[503, true], [400, false]] as const) {
      const baseUrl = await listen((_request, response) => json(response, status, { secret: "sensitive-body" }));
      const error = await createGateway(baseUrl).probe().catch((value: unknown) => value);
      expect(error).toBeInstanceOf(WorkflowGatewayTransportError);
      expect(error).toMatchObject({ retryable, statusCode: status });
      expect(String(error)).not.toContain("sensitive-body");
    }
  });

  it("rejects oversized and malformed responses without logging their body", async () => {
    const onError = vi.fn();
    const baseUrl = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ temporalRunId: "x".repeat(2_000), duplicate: false }));
    });
    const gateway = createGateway(baseUrl, 1_000, onError, 1_024);
    const error = await gateway.start({
      workflowRunId: "run-1", temporalWorkflowId: "store-health-v1:run-1",
      taskId: "task-1", workflowVersion: 1, planRevision: 2, executionProfile: "advanced_live",
    }).catch((value: unknown) => value);
    expect(error).toMatchObject({ retryable: false });
    expect(String(error)).not.toContain("xxxx");
    expect(onError).toHaveBeenCalled();
  });
});

function createGateway(baseUrl: string, timeoutMs = 1_000, onError = vi.fn(), maximumResponseBytes = 16_384) {
  const tokens: AccessTokenProvider = { getToken: vi.fn(async () => "control-token") };
  return new HttpWorkflowGateway({
    baseUrl, tokens, fetch: globalThis.fetch, timeoutMs, maximumResponseBytes, onError,
  });
}

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>): Promise<string> {
  const server = createServer((request, response) => { void handler(request, response); });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Test server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length === 0 ? undefined : JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
