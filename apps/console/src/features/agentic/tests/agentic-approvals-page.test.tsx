// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgenticApi } from "../api/agentic-api";
import { AgenticApprovalsPage } from "../pages/agentic-approvals-page";

const approvalId = "00000000-0000-4000-8000-000000000040";

describe("AgenticApprovalsPage", () => {
  it("loads master-detail evidence and submits a reason-bound revision request", async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<MemoryRouter><AgenticApprovalsPage api={api} roles={["agentic_approver"]} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Approval Inbox" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /workflow execution/i }));
    expect(await screen.findByText("Parameters digest")).toBeVisible();
    expect(screen.getByText("Workflow payload digest")).toBeVisible();
    expect(screen.getByText("High risk")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Request revision" }));
    await user.type(screen.getByLabelText("Decision reason"), "Clarify the inventory window.");
    await user.click(screen.getByRole("button", { name: "Confirm request revision" }));
    await waitFor(() => expect(api.decideApproval).toHaveBeenCalledWith(approvalId, {
      expectedVersion: 1, decision: "revision_requested", reason: "Clarify the inventory window.",
    }));
  });

  it("keeps requester views read-only and marks expired pending requests", async () => {
    const api = fakeApi();
    vi.mocked(api.loadApproval).mockResolvedValueOnce({ ...detail(), approval: { ...detail().approval, expiresAt: "2020-01-01T00:00:00.000Z" } });
    render(<MemoryRouter><AgenticApprovalsPage api={api} roles={["agentic_operator"]} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: /workflow execution/i }));
    expect(await screen.findByText("Expired")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request revision" })).not.toBeInTheDocument();
  });
});

function fakeApi(): AgenticApi {
  return {
    overview: vi.fn(), listTasks: vi.fn(), createTask: vi.fn(), uploadFile: vi.fn(), loadFile: vi.fn(), previewFile: vi.fn(), approveFile: vi.fn(), rejectFile: vi.fn(), loadOperations: vi.fn(), cancelWorkflow: vi.fn(),
    listApprovals: vi.fn(async () => ({ items: [detail().approval], totalItems: 1 })),
    loadApproval: vi.fn(async () => detail()), decideApproval: vi.fn(async () => ({ ...detail().approval, state: "revision_requested" as const, version: 2 })), listEmployees: vi.fn(), loadEmployee: vi.fn(),
  };
}

function detail() {
  return {
    approval: { id: approvalId, state: "pending" as const, requesterId: "system:workflow", approverScope: "workflow_execution" as const, action: "agentic.workflow.complete", resourceType: "workflow_run", resourceId: "00000000-0000-4000-8000-000000000010", parametersDigest: "a".repeat(64), policyVersion: 1, workflowVersion: 1, configurationRevisionId: "00000000-0000-4000-8000-000000000099", expiresAt: "2030-01-01T00:00:00.000Z", version: 1, createdAt: "2026-08-25T00:00:00.000Z" },
    payloadDigest: "b".repeat(64), risk: { level: "high" as const, basis: "Workflow completion changes the durable task outcome." }, expectedEffect: "Resume the workflow with the recorded human decision.", sources: [{ sourceType: "staff_task_intake", sourceId: "operator-a", sourceDigest: "c".repeat(64) }], refreshedAt: "2026-08-25T00:00:00.000Z",
  };
}
