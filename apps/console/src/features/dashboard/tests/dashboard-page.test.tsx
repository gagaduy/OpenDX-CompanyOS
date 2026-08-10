// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardApiError, type DashboardApi } from "../api/dashboard-api";
import { DashboardPage } from "../pages/dashboard-page";
import type { DashboardView } from "../types/dashboard.types";

const view: DashboardView = {
  range: { start: "2026-07-11", end: "2026-08-10", timezone: "Asia/Ho_Chi_Minh" },
  refreshedAt: "2026-08-10T00:00:00.000Z",
  commerce: { grossPaidRevenueVnd: 64000000, paidOrderCount: 2, averageOrderValueVnd: 32000000, conversionRateBasisPoints: 1250, paymentStatuses: [{ status: "paid", count: 2 }] },
  products: { items: [{ sku: "LAPTOP-001", productTitle: "Laptop kỹ thuật tổng hợp", quantitySold: 2, paidRevenueVnd: 64000000 }], inventory: { onHand: 10, reserved: 1, available: 9, soldOutCount: 0 } },
  customers: { totalRegisteredCustomers: 100, repeatCustomers: 12, lifetimeValueVnd: 64000000, lifetimeValueBuckets: [{ bucket: "high", count: 2 }] },
  operations: { openTickets: 3, overdueFollowups: 1, slaBreaches: 2 },
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-10T00:01:30.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("renders aggregate dashboard with default 30-day range, no PII, and stale warning", async () => {
    const api = fixture();
    render(<MemoryRouter><DashboardPage api={api} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Commerce dashboard" })).toBeVisible();
    expect(api.load).toHaveBeenCalledWith({ start: "2026-07-11", end: "2026-08-10" }, expect.any(AbortSignal));
    expect(screen.getAllByText((text) => text.includes("64.000.000")).length).toBeGreaterThan(0);
    expect(screen.getByText("12,5%")).toBeVisible();
    expect(screen.getByText("Laptop kỹ thuật tổng hợp")).toBeVisible();
    expect(screen.getByText("Open tickets")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Metrics are older than 60 seconds");
    expect(screen.queryByText(/buyer@example.com|Nguyễn Phương/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /customer/i })).not.toBeInTheDocument();
  });

  it("validates max range and recovers partial API errors", async () => {
    const api = fixture({ load: vi.fn().mockRejectedValueOnce(new DashboardApiError("UNAVAILABLE", "offline")).mockResolvedValueOnce({ ...view, products: { ...view.products, items: [] } }) });
    render(<MemoryRouter><DashboardPage api={api} /></MemoryRouter>);

    expect(await screen.findByRole("alert")).toHaveTextContent("Dashboard metrics could not be loaded");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No paid products in this range.")).toBeVisible();

    await userEvent.clear(screen.getByLabelText("Start date"));
    await userEvent.type(screen.getByLabelText("Start date"), "2025-01-01");
    await userEvent.clear(screen.getByLabelText("End date"));
    await userEvent.type(screen.getByLabelText("End date"), "2026-08-10");
    await userEvent.click(screen.getByRole("button", { name: "Apply range" }));
    expect(screen.getByText("Choose a range from 1 to 366 days.")).toBeVisible();
  });
});

function fixture(overrides: Partial<DashboardApi> = {}): DashboardApi {
  return { load: vi.fn(async () => view), ...overrides };
}
