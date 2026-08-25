// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { AgenticApiError, createAgenticApi } from "../api/agentic-api";

const taskId = "00000000-0000-4000-8000-000000000001";

afterEach(() => { vi.unstubAllGlobals(); });

describe("Agentic task transition transport", () => {
  it("posts authoritative versions to the ready and start staff routes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(readyEnvelope()))
      .mockResolvedValueOnce(response(startEnvelope()));
    vi.stubGlobal("fetch", fetchMock);
    const api = createAgenticApi("http://api.test", "staff-token");

    await expect(api.readyTask(taskId, 1)).resolves.toMatchObject({ task: { state: "ready", version: 2 } });
    await expect(api.startTask(taskId, 2, 1)).resolves.toMatchObject({ state: "received", workflowVersion: 1 });

    expect(fetchMock).toHaveBeenNthCalledWith(1, `http://api.test/v1/admin/agentic/tasks/${taskId}/ready`, expect.objectContaining({ method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `http://api.test/v1/admin/agentic/tasks/${taskId}/start`, expect.objectContaining({ method: "POST", body: JSON.stringify({ expectedVersion: 2, workflowVersion: 1 }) }));
  });

  it("rejects a malformed workflow projection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ success: true, data: { state: "received" } })));

    await expect(createAgenticApi("http://api.test", "staff-token").startTask(taskId, 2, 1))
      .rejects.toEqual(expect.objectContaining<Partial<AgenticApiError>>({ code: "INVALID_RESPONSE" }));
  });
});

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function readyEnvelope() {
  return { success: true, data: { task: { id: taskId, state: "ready", createdBy: "operator-a", goal: "Review Store Health", version: 2, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:01.000Z" }, subtasks: [], dependencies: [] } };
}

function startEnvelope() {
  return { success: true, data: { id: "00000000-0000-4000-8000-000000000010", taskId, workflowName: "StoreHealthReviewWorkflowV1", workflowVersion: 1, planRevision: 1, temporalWorkflowId: "store-health-v1:00000000-0000-4000-8000-000000000010", state: "received", projectionSequence: 0, version: 1, createdAt: "2026-08-25T00:00:01.000Z", updatedAt: "2026-08-25T00:00:01.000Z" } };
}
