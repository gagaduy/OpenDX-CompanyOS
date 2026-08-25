// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgenticApi } from "../api/agentic-api";
import type { AgenticTaskOperations } from "../types/agentic.types";
import { AgenticTaskDetailPage } from "../pages/agentic-task-detail-page";

const taskId = "00000000-0000-4000-8000-000000000001";

afterEach(() => { vi.useRealTimers(); });

describe("AgenticTaskDetailPage", () => {
  it("polls active operations every five seconds and stops at a terminal projection", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = fakeApi(activeOperations());
    vi.mocked(api.loadOperations).mockResolvedValueOnce(activeOperations()).mockResolvedValueOnce(completedOperations());
    render(<MemoryRouter><AgenticTaskDetailPage api={api} taskId={taskId} roles={["agentic_operator"]} /></MemoryRouter>);

    expect(await screen.findByRole("list", { name: "Execution timeline" })).toBeVisible();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(api.loadOperations).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.loadOperations).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Completed")).toBeVisible();
  });

  it("shows dependencies, costs, partial disclosure, and refreshes after cancel", async () => {
    const api = fakeApi(activeOperations());
    vi.mocked(api.loadOperations).mockResolvedValueOnce(activeOperations()).mockResolvedValueOnce(partialOperations());
    const user = userEvent.setup();
    render(<MemoryRouter><AgenticTaskDetailPage api={api} taskId={taskId} roles={["agentic_operator"]} /></MemoryRouter>);

    expect(await screen.findByText("Catalog → Inventory")).toBeVisible();
    expect(screen.getByText("125 µcredits settled")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel workflow" }));
    await waitFor(() => expect(api.cancelWorkflow).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000010", 2, "CANCELED_BY_STAFF",
    ));
    expect(await screen.findByText("Inventory: RETRY_EXHAUSTED")).toBeVisible();
  });

  it("aborts the active request when the page unmounts", async () => {
    const api = fakeApi(activeOperations());
    let signal: AbortSignal | undefined;
    vi.mocked(api.loadOperations).mockImplementation((_taskId, requestSignal) => {
      signal = requestSignal;
      return new Promise(() => undefined);
    });
    const view = render(<MemoryRouter><AgenticTaskDetailPage api={api} taskId={taskId} roles={["agentic_operator"]} /></MemoryRouter>);
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("backs off failures for fifteen seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = fakeApi(activeOperations());
    vi.mocked(api.loadOperations).mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce(activeOperations());
    render(<MemoryRouter><AgenticTaskDetailPage api={api} taskId={taskId} roles={["agentic_operator"]} /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("alert")).toHaveTextContent("could not be refreshed");
    await vi.advanceTimersByTimeAsync(14_999);
    expect(api.loadOperations).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.loadOperations).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden and resumes immediately when visible", async () => {
    const original = Object.getOwnPropertyDescriptor(document, "hidden");
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const api = fakeApi(activeOperations());
    render(<MemoryRouter><AgenticTaskDetailPage api={api} taskId={taskId} roles={["agentic_operator"]} /></MemoryRouter>);
    expect(api.loadOperations).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(api.loadOperations).toHaveBeenCalledOnce());
    if (original !== undefined) Object.defineProperty(document, "hidden", original);
  });
});

function fakeApi(operations: AgenticTaskOperations): AgenticApi {
  return {
    overview: vi.fn(), listTasks: vi.fn(), createTask: vi.fn(), uploadFile: vi.fn(), loadFile: vi.fn(), previewFile: vi.fn(), approveFile: vi.fn(), rejectFile: vi.fn(),
    loadOperations: vi.fn(async () => operations), cancelWorkflow: vi.fn(async () => undefined),
    listApprovals: vi.fn(), loadApproval: vi.fn(), decideApproval: vi.fn(),
  };
}

function activeOperations(): AgenticTaskOperations {
  return {
    task: { id: taskId, goal: "Review Store Health", state: "department_analysis", version: 2 },
    workflow: { id: "00000000-0000-4000-8000-000000000010", state: "department_analysis", stage: "department_analysis", version: 2, updatedAt: "2026-08-25T00:00:05.000Z" },
    timeline: [{ id: "event-1", kind: "workflow", state: "department_analysis", occurredAt: "2026-08-25T00:00:05.000Z" }],
    branches: [
      { id: "catalog", owner: "catalog", state: "completed", dependencies: [], toolNames: ["catalog.product_completeness"], dataClasses: ["internal"] },
      { id: "inventory", owner: "inventory", state: "reserved", dependencies: ["catalog"], toolNames: ["inventory.availability"], dataClasses: ["internal"] },
    ],
    costs: { reservedMicros: 200, settledMicros: 125 }, approvals: [], provenance: [],
    refreshedAt: "2026-08-25T00:00:05.000Z",
  };
}

function completedOperations(): AgenticTaskOperations {
  return { ...activeOperations(), task: { ...activeOperations().task, state: "completed" }, workflow: { ...activeOperations().workflow!, state: "completed", stage: "completed", version: 3 } };
}

function partialOperations(): AgenticTaskOperations {
  return { ...activeOperations(), task: { ...activeOperations().task, state: "partially_completed" }, workflow: { ...activeOperations().workflow!, state: "partially_completed", stage: "partially_completed", version: 3 }, report: { completionState: "partial", summary: "Inventory unavailable", conclusions: [], risks: [], recommendedActions: [], conflicts: [], unavailableBranches: [{ subtaskId: "inventory", reasonCode: "RETRY_EXHAUSTED" }] } };
}
