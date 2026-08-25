// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgenticApi } from "../api/agentic-api";
import type { AgenticFilePreview, AgenticTaskDetail } from "../types/agentic.types";
import { AgenticTaskIntakePage } from "../pages/agentic-task-intake-page";

describe("Agentic file intake", () => {
  it("shows file intake only to governance roles", () => {
    const api = fakeApi();
    const { rerender } = render(<MemoryRouter><AgenticTaskIntakePage api={api} roles={["agentic_operator"]} /></MemoryRouter>);
    expect(screen.queryByLabelText("CSV or TXT file")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create task" })).toBeVisible();

    rerender(<MemoryRouter><AgenticTaskIntakePage api={api} roles={["agentic_governance_admin"]} /></MemoryRouter>);
    expect(screen.getByLabelText("CSV or TXT file")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create task" })).not.toBeInTheDocument();
  });

  it("previews governed file evidence and approves it into one draft task", async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<MemoryRouter><AgenticTaskIntakePage api={api} roles={["agentic_governance_admin"]} /></MemoryRouter>);
    const file = new File(["sku,stock\nA,1"], "health.csv", { type: "text/csv" });

    await user.upload(screen.getByLabelText("CSV or TXT file"), file);
    await user.click(screen.getByRole("button", { name: "Upload and scan" }));
    expect(await screen.findByText("24 rows ready for review")).toBeVisible();
    expect(screen.getByText("Preview digest")).toBeVisible();
    expect(screen.getByText("AI CEO coordinator")).toBeVisible();
    expect(screen.getByText("catalog.product_completeness")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Proposed sources" })).toBeVisible();
    expect(screen.getByText("Line 1")).toBeVisible();
    expect(screen.getByText(/sku,stock\s+A,1/)).toBeVisible();
    expect(screen.getByText("Department dependencies are planned after task start.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Approve preview" }));
    expect(api.approveFile).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000010", expect.objectContaining({ previewVersion: 1, expectedFileVersion: 4 }), expect.stringMatching(/^console:file-approval:/));
    expect(await screen.findByRole("link", { name: "Open created task" })).toHaveAttribute("href", "/agentic/tasks/00000000-0000-4000-8000-000000000020");
  });

  it("rotates the upload key when file selection changes", async () => {
    const api = fakeApi(); const user = userEvent.setup();
    render(<MemoryRouter><AgenticTaskIntakePage api={api} roles={["administrator"]} /></MemoryRouter>);
    const input = screen.getByLabelText("CSV or TXT file");
    await user.upload(input, new File(["one"], "one.txt", { type: "text/plain" }));
    await user.click(screen.getByRole("button", { name: "Upload and scan" }));
    await user.upload(input, new File(["two"], "two.txt", { type: "text/plain" }));
    await user.click(screen.getByRole("button", { name: "Upload and scan" }));
    expect(vi.mocked(api.uploadFile).mock.calls[0]?.[1]).not.toBe(vi.mocked(api.uploadFile).mock.calls[1]?.[1]);
  });

  it("cancels before upload and presents scanner failures without leaking details", async () => {
    const api = fakeApi();
    vi.mocked(api.previewFile).mockRejectedValueOnce(new Error("private scanner host secret"));
    const user = userEvent.setup();
    render(<MemoryRouter><AgenticTaskIntakePage api={api} roles={["administrator"]} /></MemoryRouter>);
    const input = screen.getByLabelText("CSV or TXT file");

    await user.upload(input, new File(["cancel"], "cancel.txt", { type: "text/plain" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Upload and scan" })).toBeDisabled();
    expect(api.uploadFile).not.toHaveBeenCalled();

    await user.upload(input, new File(["retry"], "retry.txt", { type: "text/plain" }));
    await user.click(screen.getByRole("button", { name: "Upload and scan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("File could not be uploaded or scanned safely.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private scanner host secret");
  });
});

function fakeApi(): AgenticApi {
  const file = { id: "00000000-0000-4000-8000-000000000010", originalFilename: "health.csv", format: "csv" as const, mediaType: "text/csv" as const, byteSize: 15, payloadDigest: "a".repeat(64), status: "uploaded" as const, createdBy: "governance-a", version: 1, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" };
  return {
    overview: vi.fn(), listTasks: vi.fn(), createTask: vi.fn(),
    uploadFile: vi.fn(async () => file), loadFile: vi.fn(async () => file),
    previewFile: vi.fn(async (): Promise<AgenticFilePreview> => ({ fileId: file.id, fileVersion: 4, previewVersion: 1, parserVersion: "bounded-csv-txt-v1", payloadDigest: file.payloadDigest, previewDigest: "b".repeat(64), format: "csv", rowCount: 24, columnCount: 2, invalidRows: 0, samples: ["sku,stock", "A,1"], sourceReferences: [{ fileId: file.id, line: 1 }], governance: { coordinator: "ai_ceo", eligibleDepartments: ["catalog", "inventory", "order", "finance", "crm", "support"], allowedTools: ["catalog.product_completeness"], dataClasses: ["internal"], riskSignals: [], dependencyStatus: "planned_after_task_start", configurationRevisionId: "00000000-0000-4000-8000-000000000030", configurationVersion: 1 } })),
    approveFile: vi.fn(async (): Promise<AgenticTaskDetail> => ({ task: { id: "00000000-0000-4000-8000-000000000020", state: "draft", createdBy: "governance-a", goal: "Review file", version: 1, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" }, subtasks: [], dependencies: [] })),
    rejectFile: vi.fn(async () => ({ ...file, status: "rejected" as const, version: 2 })),
    loadOperations: vi.fn(), cancelWorkflow: vi.fn(),
  };
}
