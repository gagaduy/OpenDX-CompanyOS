// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgenticOperationsApi } from "../api/agentic-api";
import type { AgenticTaskOperations, AgenticWorkflowRun } from "../types/agentic.types";
import { AgenticTaskDetailPage } from "../pages/agentic-task-detail-page";

const taskId = "00000000-0000-4000-8000-000000000001";

afterEach(() => { vi.useRealTimers(); });

describe("AgenticTaskDetailPage", () => {
  it("lets an operator mark a draft ready and then start its versioned workflow", async () => {
    const api = fakeApi(draftOperations());
    vi.mocked(api.loadOperations)
      .mockResolvedValueOnce(draftOperations())
      .mockResolvedValueOnce(readyOperations())
      .mockResolvedValueOnce(receivedOperations());
    const user = userEvent.setup();
    render(<MemoryRouter><AgenticTaskDetailPage api={api} taskId={taskId} roles={["agentic_operator"]} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Mark ready" }));
    await waitFor(() => expect(api.readyTask).toHaveBeenCalledWith(taskId, 1));
    expect(await screen.findByText("Ready")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mark ready" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start task" }));
    await waitFor(() => expect(api.startTask).toHaveBeenCalledWith(taskId, 2, 1));
    expect(await screen.findByText("Received")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start task" })).not.toBeInTheDocument();
  });

  it("does not expose task transition controls to an approver", async () => {
    const api = fakeApi(draftOperations());
    render(<MemoryRouter><AgenticTaskDetailPage api={api} taskId={taskId} roles={["agentic_approver"]} /></MemoryRouter>);

    expect(await screen.findByText("Draft")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mark ready" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start task" })).not.toBeInTheDocument();
  });

  it("suppresses duplicate ready commands while the transition is in flight", async () => {
    let resolve!: () => void;
    const api = fakeApi(draftOperations());
    vi.mocked(api.readyTask).mockImplementation(() => new Promise((done) => { resolve = () => done(readyDetail()); }));
    const user = userEvent.setup();
    render(<MemoryRouter><AgenticTaskDetailPage api={api} taskId={taskId} roles={["agentic_operator"]} /></MemoryRouter>);

    const button = await screen.findByRole("button", { name: "Mark ready" });
    await user.dblClick(button);

    expect(api.readyTask).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Marking ready…" })).toBeDisabled();
    resolve();
  });

  it("preserves a safe transition error after refreshing authoritative state", async () => {
    const api = fakeApi(draftOperations());
    vi.mocked(api.readyTask).mockRejectedValueOnce(new Error("private backend detail"));
    const user = userEvent.setup();
    render(<MemoryRouter><AgenticTaskDetailPage api={api} taskId={taskId} roles={["agentic_operator"]} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Mark ready" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Task readiness outcome is uncertain; authoritative state was refreshed.");
    expect(screen.getByRole("button", { name: "Mark ready" })).toBeEnabled();
  });

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
    vi.useFakeTimers();
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

function fakeApi(operations: AgenticTaskOperations): AgenticOperationsApi {
  return {
    overview: vi.fn(), listTasks: vi.fn(), createTask: vi.fn(), uploadFile: vi.fn(), loadFile: vi.fn(), previewFile: vi.fn(), approveFile: vi.fn(), rejectFile: vi.fn(),
    readyTask: vi.fn(async () => readyDetail()),
    startTask: vi.fn(async () => startedRun()),
    loadOperations: vi.fn(async () => operations), cancelWorkflow: vi.fn(async () => undefined),
    listApprovals: vi.fn(), loadApproval: vi.fn(), decideApproval: vi.fn(), listEmployees: vi.fn(), loadEmployee: vi.fn(), listAudit: vi.fn(),
  };
}

function startedRun(): AgenticWorkflowRun {
  return {
    id: "00000000-0000-4000-8000-000000000010", taskId,
    workflowName: "StoreHealthReviewWorkflowV1", workflowVersion: 1, planRevision: 1,
    temporalWorkflowId: "store-health-v1:00000000-0000-4000-8000-000000000010",
    state: "received", projectionSequence: 0, version: 1,
    createdAt: "2026-08-25T00:00:01.000Z", updatedAt: "2026-08-25T00:00:01.000Z",
  };
}

function readyDetail() {
  return {
    task: {
      id: taskId, state: "ready" as const, createdBy: "operator-a", goal: "Review Store Health", version: 2,
      createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:01.000Z",
    },
    subtasks: [], dependencies: [],
  };
}

function draftOperations(): AgenticTaskOperations {
  return {
    task: { id: taskId, goal: "Review Store Health", state: "draft", version: 1 },
    timeline: [{ id: "event-intake", kind: "agentic_task.intake", state: "allowed", occurredAt: "2026-08-25T00:00:00.000Z" }],
    branches: [], costs: { reservedMicros: 0, settledMicros: 0 }, approvals: [], provenance: [],
    refreshedAt: "2026-08-25T00:00:00.000Z",
  };
}

function readyOperations(): AgenticTaskOperations {
  return { ...draftOperations(), task: { ...draftOperations().task, state: "ready", version: 2 } };
}

function receivedOperations(): AgenticTaskOperations {
  return {
    ...readyOperations(),
    task: { ...readyOperations().task, state: "received", version: 3 },
    workflow: { id: "00000000-0000-4000-8000-000000000010", state: "received", stage: "received", version: 1, updatedAt: "2026-08-25T00:00:01.000Z" },
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
