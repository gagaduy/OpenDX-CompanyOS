// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgenticApi } from "../api/agentic-api";
import { AgenticTaskIntakePage } from "../pages/agentic-task-intake-page";

describe("AgenticTaskIntakePage", () => {
  it("defaults to Store Health and suppresses rapid duplicate submission", async () => {
    let resolve!: () => void;
    const api = fakeApi();
    vi.mocked(api.createTask).mockImplementation(() => new Promise((done) => { resolve = () => done({ task: { id: "00000000-0000-4000-8000-000000000001", state: "draft", createdBy: "operator-a", goal: "Review Store Health", version: 1, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" }, subtasks: [], dependencies: [] }); }));
    const user = userEvent.setup();
    render(<MemoryRouter><AgenticTaskIntakePage api={api} /></MemoryRouter>);

    expect(screen.getByRole("radio", { name: "Store Health review" })).toBeChecked();
    await user.type(screen.getByLabelText("Goal"), "Review Store Health");
    await user.type(screen.getByLabelText("Instructions"), "Use approved aggregate evidence only.");
    await user.type(screen.getByLabelText("Review start"), "2026-08-18");
    await user.type(screen.getByLabelText("Review end"), "2026-08-25");
    const submit = screen.getByRole("button", { name: "Create task" });
    await user.dblClick(submit);

    expect(api.createTask).toHaveBeenCalledOnce();
    expect(api.createTask).toHaveBeenCalledWith(expect.objectContaining({ mode: "store_health_review" }), expect.stringMatching(/^console:task:/));
    resolve();
  });
});

function fakeApi(): AgenticApi {
  return {
    overview: vi.fn(), listTasks: vi.fn(), createTask: vi.fn(),
    uploadFile: vi.fn(), loadFile: vi.fn(), previewFile: vi.fn(), approveFile: vi.fn(), rejectFile: vi.fn(),
    loadOperations: vi.fn(), cancelWorkflow: vi.fn(),
    listApprovals: vi.fn(), loadApproval: vi.fn(), decideApproval: vi.fn(), listEmployees: vi.fn(), loadEmployee: vi.fn(),
  };
}
