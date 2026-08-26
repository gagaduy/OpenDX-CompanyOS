// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgenticApi } from "../api/agentic-api";
import { AgenticTasksPage } from "../pages/agentic-tasks-page";

describe("AgenticTasksPage", () => {
  it("loads URL-filtered task data and Digital Workforce metrics", async () => {
    const api = fakeApi();
    render(<MemoryRouter initialEntries={["/agentic/tasks?state=ready"]}>
      <AgenticTasksPage api={api} roles={["agentic_operator"]} />
    </MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Digital Workforce" })).toBeVisible();
    expect(api.listTasks).toHaveBeenCalledWith(expect.objectContaining({ state: "ready" }), expect.any(AbortSignal));
    expect(screen.getByText("Waiting approvals")).toBeVisible();
    expect(screen.getByRole("link", { name: "New task" })).toHaveAttribute("href", "/agentic/tasks/new");
    expect(screen.getByRole("link", { name: "Review Store Health" })).toHaveAttribute("href", "/agentic/tasks/00000000-0000-4000-8000-000000000001");
  });

  it("shows a recoverable invalid-response state", async () => {
    const api = fakeApi();
    vi.mocked(api.listTasks).mockRejectedValueOnce(new Error("INVALID_RESPONSE"));
    render(<MemoryRouter><AgenticTasksPage api={api} roles={["agentic_operator"]} /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Tasks could not be loaded");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });
});

function fakeApi(): AgenticApi {
  return {
    overview: vi.fn(async () => ({ counts: { running: 1, waiting: 2, failed: 0, completed: 4, canceled: 0 }, pendingApprovals: 1, settledCostMicros: 25, refreshedAt: "2026-08-25T00:00:00.000Z" })),
    listTasks: vi.fn(async () => ({ items: [{ id: "00000000-0000-4000-8000-000000000001", state: "ready" as const, createdBy: "operator-a", goal: "Review Store Health", version: 1, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" }], totalItems: 1, refreshedAt: "2026-08-25T00:00:00.000Z" })),
    createTask: vi.fn(),
    uploadFile: vi.fn(), loadFile: vi.fn(), previewFile: vi.fn(), approveFile: vi.fn(), rejectFile: vi.fn(),
    loadOperations: vi.fn(), cancelWorkflow: vi.fn(),
    listApprovals: vi.fn(), loadApproval: vi.fn(), decideApproval: vi.fn(), listEmployees: vi.fn(), loadEmployee: vi.fn(), listAudit: vi.fn(),
  };
}
