// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PaymentApi } from "../api/payment-api";
import { PaymentReturnPage } from "../pages/payment-return-page";
import type { PaymentStatus } from "../types/payment.types";

const pendingCheckout: PaymentStatus = {
  id: "checkout-1",
  orderId: "order-1",
  status: "order_created",
};

function renderReturn(status: PaymentStatus["status"], outcome = "success") {
  localStorage.setItem("novacommerce.pending-checkout", pendingCheckout.id);
  const api = {
    getCheckoutStatus: vi.fn(async () => ({ ...pendingCheckout, status })),
  } as unknown as PaymentApi;
  return render(
    <MemoryRouter initialEntries={[`/payment/return?outcome=${outcome}`]}>
      <PaymentReturnPage api={api} />
    </MemoryRouter>,
  );
}

describe("payment return", () => {
  it("keeps a successful browser return pending until backend confirmation", async () => {
    renderReturn("order_created");
    expect(
      await screen.findByRole("heading", { name: "Đang xác minh thanh toán" }),
    ).toBeVisible();
    expect(screen.queryByText("Thanh toán đã xác nhận")).not.toBeInTheDocument();
  });

  it("shows paid only after the backend reports completion", async () => {
    renderReturn("completed", "error");
    expect(
      await screen.findByRole("heading", { name: "Thanh toán đã xác nhận" }),
    ).toBeVisible();
    expect(localStorage.getItem("novacommerce.pending-checkout")).toBeNull();
  });

  it("shows a terminal state for an expired checkout", async () => {
    renderReturn("expired");
    expect(
      await screen.findByRole("heading", { name: "Checkout đã kết thúc" }),
    ).toBeVisible();
  });

  it("stops polling after the bounded number of attempts", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(
        "novacommerce.pending-checkout",
        pendingCheckout.id,
      );
      const getCheckoutStatus = vi.fn(async () => pendingCheckout);
      const api = { getCheckoutStatus } as unknown as PaymentApi;
      render(
        <MemoryRouter initialEntries={["/payment/return?outcome=success"]}>
          <PaymentReturnPage api={api} />
        </MemoryRouter>,
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(getCheckoutStatus).toHaveBeenCalledTimes(10);
      expect(screen.queryByText("Đang đồng bộ với SePay...")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
