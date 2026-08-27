// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  StorefrontContentProvider,
  useStorefrontContent,
} from "./storefront-content-provider";

const content = {
  assurances: [{
    code: "free-delivery",
    iconKey: "truck" as const,
    title: "Miễn phí vận chuyển",
    description: "Cho đơn hàng đủ điều kiện",
  }],
  metrics: [{
    code: "authentic-products",
    displayValue: "100%",
    label: "Sản phẩm chính hãng",
  }],
};

function StateProbe() {
  const state = useStorefrontContent();
  return (
    <div>
      <span>{state.status}</span>
      {state.status === "ready" ? <span>{state.content.assurances[0]?.title}</span> : null}
      <button type="button" aria-label="retry-probe" onClick={state.retry}>Retry</button>
    </div>
  );
}

describe("StorefrontContentProvider", () => {
  it("loads content once and exposes the ready state", async () => {
    const api = { content: vi.fn(async () => content) };

    render(
      <StorefrontContentProvider api={api}>
        <StateProbe />
      </StorefrontContentProvider>,
    );

    expect(screen.getByText("loading")).toBeVisible();
    expect(await screen.findByText("Miễn phí vận chuyển")).toBeVisible();
    expect(api.content).toHaveBeenCalledTimes(1);
  });

  it("keeps empty content distinct from a failed request", async () => {
    const api = {
      content: vi.fn(async () => ({ assurances: [], metrics: [] })),
    };

    render(
      <StorefrontContentProvider api={api}>
        <StateProbe />
      </StorefrontContentProvider>,
    );

    expect(await screen.findByText("empty")).toBeVisible();
  });

  it("recovers from an error when retry is requested", async () => {
    const user = userEvent.setup();
    const api = {
      content: vi.fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(content),
    };

    render(
      <StorefrontContentProvider api={api}>
        <StateProbe />
      </StorefrontContentProvider>,
    );

    expect(await screen.findByText("error")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "retry-probe" }));
    expect(await screen.findByText("Miễn phí vận chuyển")).toBeVisible();
    expect(api.content).toHaveBeenCalledTimes(2);
  });
});
