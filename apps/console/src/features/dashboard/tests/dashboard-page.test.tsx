// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardApiError, type DashboardApi } from "../api/dashboard-api";
import { DashboardPage } from "../pages/dashboard-page";
import type { DashboardView } from "../types/dashboard.types";

const view: DashboardView = {
  range: { start: "2026-07-11", end: "2026-08-10", timezone: "Asia/Ho_Chi_Minh" },
  refreshedAt: "2026-08-10T00:00:00.000Z",
  commerce: {
    grossPaidRevenueVnd: 64000000,
    paidOrderCount: 2,
    averageOrderValueVnd: 32000000,
    conversionRateBasisPoints: 1250,
    comparison: {
      previousGrossPaidRevenueVnd: 48000000,
      previousPaidOrderCount: 1,
      previousAverageOrderValueVnd: 48000000,
      grossPaidRevenueChangeBasisPoints: 3333,
      paidOrderCountChangeBasisPoints: 10000,
      averageOrderValueChangeBasisPoints: -3333,
    },
    daily: [
      { date: "2026-08-07", grossPaidRevenueVnd: 0, paidOrderCount: 0 },
      { date: "2026-08-08", grossPaidRevenueVnd: 32000000, paidOrderCount: 1 },
      { date: "2026-08-09", grossPaidRevenueVnd: 32000000, paidOrderCount: 1 },
    ],
    paymentStatuses: [{ status: "paid", count: 2 }],
  },
  products: { items: [{ sku: "LAPTOP-001", productTitle: "Laptop kỹ thuật tổng hợp", quantitySold: 2, paidRevenueVnd: 64000000 }], inventory: { onHand: 10, reserved: 1, available: 9, soldOutCount: 0 } },
  customers: {
    totalRegisteredCustomers: 100,
    repeatCustomers: 12,
    lifetimeValueVnd: 64000000,
    lifetimeValueBuckets: [{ bucket: "high", count: 2 }],
    newCustomersInRange: 12,
    previousNewCustomersInRange: 8,
    newCustomersChangeBasisPoints: 5000,
    dailyNewCustomers: [
      { date: "2026-08-07", newCustomerCount: 2 },
      { date: "2026-08-08", newCustomerCount: 4 },
      { date: "2026-08-09", newCustomerCount: 6 },
    ],
  },
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
    expect(api.load).toHaveBeenCalledWith({ start: "2026-07-12", end: "2026-08-11" }, expect.any(AbortSignal));
    expect(screen.getAllByText((text) => text.includes("64.000.000")).length).toBeGreaterThan(0);
    expect(screen.getByText("12,5%")).toBeVisible();
    expect(screen.getByText("Laptop kỹ thuật tổng hợp")).toBeVisible();
    expect(screen.getByText("Open tickets")).toBeVisible();
    expect(screen.getByText("Gross paid revenue")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Paid orders" })).toBeVisible();
    expect(screen.getByText("Registered customers")).toBeVisible();
    const executive = screen.getByRole("region", { name: "Executive metrics" });
    expect(within(executive).getByText("Gross paid revenue")).toBeVisible();
    expect(within(executive).getByText("Registered customers")).toBeVisible();
    expect(screen.getByRole("region", { name: "Operational focus" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Operational focus" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Performance overview" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Revenue trend" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Paid order volume" })).toBeVisible();
    expect(screen.getByRole("table", { name: "Revenue trend data" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Paid order volume data" })).toBeInTheDocument();
    expect(screen.getByText("+33,33%")).toBeVisible();
    expect(screen.getByText("-33,33%")).toBeVisible();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
    expect(screen.queryByText("Order volume by channel")).not.toBeInTheDocument();
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

  it("renders undefined growth and zero paid activity honestly", async () => {
    const emptyView: DashboardView = {
      ...view,
      commerce: {
        ...view.commerce,
        grossPaidRevenueVnd: 0,
        paidOrderCount: 0,
        averageOrderValueVnd: 0,
        comparison: {
          ...view.commerce.comparison,
          grossPaidRevenueChangeBasisPoints: null,
          paidOrderCountChangeBasisPoints: null,
          averageOrderValueChangeBasisPoints: 0,
        },
        daily: view.commerce.daily.map((point) => ({ ...point, grossPaidRevenueVnd: 0, paidOrderCount: 0 })),
      },
    };
    render(<MemoryRouter><DashboardPage api={fixture({ load: vi.fn(async () => emptyView) })} /></MemoryRouter>);

    expect((await screen.findAllByText("New in period")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("No paid activity in this range")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Revenue trend" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Paid order volume" })).toBeInTheDocument();
  });
});

function fixture(overrides: Partial<DashboardApi> = {}): DashboardApi {
  return { load: vi.fn(async () => view), ...overrides };
}
