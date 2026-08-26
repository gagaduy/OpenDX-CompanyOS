// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgenticApi } from "../api/agentic-api";
import { AgenticAuditPage } from "../pages/agentic-audit-page";

describe("AgenticAuditPage", () => {
  it("keeps strict filters in the URL and opens safe event metadata", async () => {
    const api = fakeApi(); const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/agentic/audit?actorId=actor-a"]}><AgenticAuditPage api={api} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Agentic Audit" })).toBeVisible();
    expect(api.listAudit).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 25, actorId: "actor-a" }), expect.any(AbortSignal));
    await user.selectOptions(screen.getByLabelText("Outcome"), "denied");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(api.listAudit).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "denied" }), expect.any(AbortSignal)));
    await user.click(screen.getByRole("button", { name: /view configuration.activate/i }));
    expect(screen.getByRole("heading", { name: "Audit metadata" })).toHaveFocus();
    expect(screen.getByText("corr-1")).toBeVisible();
    expect(screen.getAllByText("configuration_revision · 00000000-0000-4000-8000-000000000099").find((element) => element.closest("td") !== null)?.closest("td")).toHaveAttribute("data-label", "Resource");
    expect(document.body.textContent).not.toMatch(/raw prompt|provider body|secret/i);
  });

  it("renders a bounded empty state", async () => {
    const api = fakeApi(); vi.mocked(api.listAudit).mockResolvedValueOnce({ items: [], totalItems: 0, refreshedAt: "2026-08-25T00:00:00.000Z" });
    render(<MemoryRouter><AgenticAuditPage api={api} /></MemoryRouter>);
    expect(await screen.findByText("No audit events match these filters.")).toBeVisible();
  });

  it("renders a safe load error without stale metadata", async () => {
    const api = fakeApi(); vi.mocked(api.listAudit).mockRejectedValueOnce(new Error("private database body"));
    render(<MemoryRouter><AgenticAuditPage api={api} /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Agentic audit could not be loaded.");
    expect(document.body.textContent).not.toContain("private database body");
  });
});

function fakeApi(): AgenticApi {
  return {
    overview: vi.fn(), listTasks: vi.fn(), createTask: vi.fn(), uploadFile: vi.fn(), loadFile: vi.fn(), previewFile: vi.fn(), approveFile: vi.fn(), rejectFile: vi.fn(), loadOperations: vi.fn(), cancelWorkflow: vi.fn(), listApprovals: vi.fn(), loadApproval: vi.fn(), decideApproval: vi.fn(), listEmployees: vi.fn(), loadEmployee: vi.fn(),
    listAudit: vi.fn(async () => ({ items: [{ id: "00000000-0000-4000-8000-000000000095", actorId: "actor-a", actorType: "staff" as const, action: "configuration.activate", resourceType: "configuration_revision", resourceId: "00000000-0000-4000-8000-000000000099", outcome: "denied" as const, correlationId: "corr-1", parametersDigest: "a".repeat(64), occurredAt: "2026-08-25T00:00:00.000Z" }], totalItems: 1, refreshedAt: "2026-08-25T00:00:00.000Z" })),
  };
}
