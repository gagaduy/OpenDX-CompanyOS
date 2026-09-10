// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StorefrontContentProvider } from "../context/storefront-content-provider";
import {
  ServiceAssurancePanel,
  ServiceMetricStrip,
} from "./service-assurance-panel";

const content = {
  assurances: [{
    code: "delivery-from-db",
    iconKey: "truck" as const,
    title: "Giao hàng từ Catalog",
    description: "Nội dung từ PostgreSQL",
  }],
  metrics: [{
    code: "metric-from-db",
    displayValue: "88+",
    label: "Chỉ số từ Catalog",
  }],
};

function Surface({ api }: { readonly api: { content(): Promise<typeof content> } }) {
  return (
    <StorefrontContentProvider api={api}>
      <ServiceAssurancePanel />
      <ServiceMetricStrip />
    </StorefrontContentProvider>
  );
}

describe("Storefront service content", () => {
  it("shows bounded loading states before content resolves", () => {
    const api = { content: vi.fn(() => new Promise<typeof content>(() => undefined)) };

    render(<Surface api={api} />);

    expect(screen.getByRole("status", { name: "Đang tải cam kết dịch vụ" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Đang tải chỉ số cửa hàng" })).toBeVisible();
  });

  it("renders assurance and metric values supplied by Catalog", async () => {
    render(<Surface api={{ content: vi.fn(async () => content) }} />);

    expect(await screen.findByText("Giao hàng từ Catalog")).toBeVisible();
    expect(screen.getByText("Nội dung từ PostgreSQL")).toBeVisible();
    expect(screen.getByText("88+")).toBeVisible();
    expect(screen.getByText("Chỉ số từ Catalog")).toBeVisible();
  });

  it("omits both surfaces when Catalog content is empty", async () => {
    const api = {
      content: vi.fn(async () => ({ assurances: [], metrics: [] })),
    };

    render(<Surface api={api as unknown as { content(): Promise<typeof content> }} />);

    await waitFor(() => {
      expect(
        screen.queryByRole("status", { name: "Đang tải cam kết dịch vụ" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("complementary", { name: "Cam kết dịch vụ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Năng lực NovaCommerce" })).not.toBeInTheDocument();
  });

  it("shows one recoverable assurance error while keeping metrics omitted", async () => {
    const user = userEvent.setup();
    const api = {
      content: vi.fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(content),
    };

    render(<Surface api={api} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể tải cam kết dịch vụ.",
    );
    expect(screen.queryByRole("region", { name: "Năng lực NovaCommerce" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Giao hàng từ Catalog")).toBeVisible();
    expect(api.content).toHaveBeenCalledTimes(2);
  });
});
