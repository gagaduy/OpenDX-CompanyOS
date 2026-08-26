// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgenticApi } from "../api/agentic-api";
import { AgenticEmployeesPage } from "../pages/agentic-employees-page";
import { AgenticEmployeeDetailPage } from "../pages/agentic-employee-detail-page";

describe("AgenticEmployeesPage", () => {
  it("shows seven read-only profiles and opens evidence-backed governance detail", async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<MemoryRouter><AgenticEmployeesPage api={api} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Digital Employees" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /view/i })).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: /view inventory/i }));
    expect(await screen.findByRole("heading", { name: "Inventory governance" })).toBeVisible();
    expect(screen.getByText("Recent runs")).toBeVisible();
    expect(screen.getByText("openai/inventory-primary")).toBeVisible();
    expect(screen.getAllByText("Inventory").find((element) => element.closest("td")?.dataset.label === "Department")?.closest("td")).toHaveAttribute("data-label", "Department");
    expect(screen.queryByRole("button", { name: /edit|chat|change model|change tool|change budget/i })).not.toBeInTheDocument();
  });

  it("loads a deep-linked employee without list state", async () => {
    const api = fakeApi();
    render(<MemoryRouter><AgenticEmployeeDetailPage api={api} agentKind="inventory" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Inventory governance" })).toBeVisible();
    expect(api.loadEmployee).toHaveBeenCalledWith("inventory", expect.any(AbortSignal));
  });
});

function fakeApi(): AgenticApi {
  const kinds = ["ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support"] as const;
  return {
    overview: vi.fn(), listTasks: vi.fn(), createTask: vi.fn(), uploadFile: vi.fn(), loadFile: vi.fn(), previewFile: vi.fn(), approveFile: vi.fn(), rejectFile: vi.fn(), loadOperations: vi.fn(), cancelWorkflow: vi.fn(), listApprovals: vi.fn(), loadApproval: vi.fn(), decideApproval: vi.fn(),
    listEmployees: vi.fn(async () => kinds.map((kind) => ({ kind, department: department(kind), active: true }))), listAudit: vi.fn(),
    loadEmployee: vi.fn(async (kind) => ({ kind, department: department(kind), governance: { active: true, revoked: false, configurationVersion: 3 }, models: { primary: `openai/${kind}-primary`, fallbacks: [`openai/${kind}-fallback`] }, tools: [], budgets: { taskCostMicros: 10_000, dailyCostMicros: 100_000, monthlyCostMicros: 1_000_000 }, executionHealth: { state: "available" as const, basis: "recent_runs", freshness: "2026-08-25T00:00:00.000Z" }, recentRuns: [{ taskId: "00000000-0000-4000-8000-000000000001", state: "completed", settledCostMicros: 125, completedAt: "2026-08-25T00:00:00.000Z" }] })),
  };
}

function department(kind: string): string { return kind === "ai_ceo" ? "Executive" : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`; }
