// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AccessTokenProvider } from "../../../../shared/auth/client-credentials-token-provider";
import type {
  ApprovalWorkflowSignal,
  CancellationWorkflowSignal,
  StartWorkflowCommand,
  WorkflowGateway,
  WorkflowGatewayDescription,
  WorkflowGatewayStartResult,
} from "../../application/workflows/interfaces/workflow-gateway";

export interface HttpWorkflowGatewayOptions {
  readonly baseUrl: string;
  readonly tokens: AccessTokenProvider;
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs: number;
  readonly maximumResponseBytes: number;
  readonly onError: (error: unknown) => void;
}

export class WorkflowGatewayTransportError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly statusCode?: number,
    code = "WORKFLOW_GATEWAY_FAILED",
  ) {
    super(code);
    this.name = "WorkflowGatewayTransportError";
  }
}

export class HttpWorkflowGateway implements WorkflowGateway {
  private readonly baseUrl: string;

  constructor(private readonly options: HttpWorkflowGatewayOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) {
      throw new RangeError("Workflow gateway timeout is invalid");
    }
    if (!Number.isSafeInteger(options.maximumResponseBytes) || options.maximumResponseBytes < 1) {
      throw new RangeError("Workflow gateway response limit is invalid");
    }
  }

  async probe(): Promise<void> {
    await this.request("/ready", { method: "GET" }, "readiness");
  }

  async start(input: StartWorkflowCommand): Promise<WorkflowGatewayStartResult> {
    const value = await this.request(
      "/internal/agentic/workflow-runs/start",
      { method: "POST", body: JSON.stringify(input) },
      input.workflowRunId,
    );
    if (!isStartResult(value)) throw this.report(new WorkflowGatewayTransportError(false, undefined, "WORKFLOW_GATEWAY_RESPONSE_INVALID"));
    return value;
  }

  async signalApproval(input: ApprovalWorkflowSignal): Promise<void> {
    const { temporalWorkflowId, ...body } = input;
    await this.request(
      `/internal/agentic/workflow-runs/${encodeURIComponent(temporalWorkflowId)}/signals/approval`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "idempotency-key": input.idempotencyKey },
      },
      input.idempotencyKey,
    );
  }

  async signalCancellation(input: CancellationWorkflowSignal): Promise<void> {
    const { temporalWorkflowId, ...body } = input;
    await this.request(
      `/internal/agentic/workflow-runs/${encodeURIComponent(temporalWorkflowId)}/signals/cancellation`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "idempotency-key": input.idempotencyKey },
      },
      input.idempotencyKey,
    );
  }

  async describe(temporalWorkflowId: string): Promise<WorkflowGatewayDescription> {
    const value = await this.request(
      `/internal/agentic/workflow-runs/${encodeURIComponent(temporalWorkflowId)}`,
      { method: "GET" },
      temporalWorkflowId,
    );
    if (!isDescription(value)) throw this.report(new WorkflowGatewayTransportError(false, undefined, "WORKFLOW_GATEWAY_RESPONSE_INVALID"));
    return value;
  }

  private async request(
    path: string,
    init: RequestInit,
    correlationId: string,
  ): Promise<unknown> {
    try {
      const token = await this.options.tokens.getToken();
      const response = await this.options.fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(this.options.timeoutMs),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-correlation-id": correlationId,
          ...init.headers,
        },
      });
      if (!response.ok) {
        throw new WorkflowGatewayTransportError(
          response.status === 408 || response.status === 429 || response.status >= 500,
          response.status,
        );
      }
      const raw = await readBounded(response, this.options.maximumResponseBytes);
      if (raw === "") return undefined;
      try { return JSON.parse(raw); }
      catch { throw new WorkflowGatewayTransportError(false, response.status, "WORKFLOW_GATEWAY_RESPONSE_INVALID"); }
    } catch (error) {
      if (error instanceof WorkflowGatewayTransportError) throw this.report(error);
      throw this.report(new WorkflowGatewayTransportError(true));
    }
  }

  private report<T extends WorkflowGatewayTransportError>(error: T): T {
    this.options.onError(error);
    return error;
  }
}

async function readBounded(response: Response, maximumBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new WorkflowGatewayTransportError(false, response.status, "WORKFLOW_GATEWAY_RESPONSE_TOO_LARGE");
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new WorkflowGatewayTransportError(false, response.status, "WORKFLOW_GATEWAY_RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function isStartResult(value: unknown): value is WorkflowGatewayStartResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  return typeof result.temporalRunId === "string"
    && result.temporalRunId.length > 0
    && result.temporalRunId.length <= 255
    && typeof result.duplicate === "boolean";
}

function isDescription(value: unknown): value is WorkflowGatewayDescription {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  return ["running", "completed", "failed", "canceled"].includes(String(result.status))
    && (result.temporalRunId === undefined
      || (typeof result.temporalRunId === "string" && result.temporalRunId.length <= 255));
}
