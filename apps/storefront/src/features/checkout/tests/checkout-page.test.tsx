// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { StorefrontApiError } from "../../../shared/http/api-client";
import type { CustomerAccountApi } from "../../customer-account/api/customer-account-api";
import type { CheckoutApi } from "../api/checkout-api";
import { CheckoutPage } from "../pages/checkout-page";
import type { CheckoutCreation } from "../types/checkout.types";

const addresses = [
  {
    id: "address-default",
    customerId: "customer-1",
    recipientName: "Duy Duong",
    phoneNumber: "0901000001",
    addressLine: "1 Nguyen Hue",
    ward: "Ben Nghe",
    provinceOrCity: "Ho Chi Minh",
    isDefault: true,
    version: 1,
    createdAt: "2026-08-06T08:00:00.000Z",
    updatedAt: "2026-08-06T08:00:00.000Z",
  },
  {
    id: "address-second",
    customerId: "customer-1",
    recipientName: "Duy Nguyen",
    phoneNumber: "0901000002",
    addressLine: "2 Trang Tien",
    ward: "Trang Tien",
    provinceOrCity: "Ha Noi",
    isDefault: false,
    version: 1,
    createdAt: "2026-08-06T08:00:00.000Z",
    updatedAt: "2026-08-06T08:00:00.000Z",
  },
] as const;

const checkout: CheckoutCreation = {
  id: "checkout-1",
  orderId: "order-1",
  status: "order_created",
  subtotalVnd: 20_000_000,
  discountVnd: 2_000_000,
  totalVnd: 18_000_000,
  currency: "VND",
  expiresAt: "2026-08-06T09:00:00.000Z",
  promotionCode: "NOVA10",
  lines: [
    {
      sku: "NOVA-001",
      productTitle: "Nova Laptop Pro",
      variantLabel: "16 GB / 512 GB",
      quantity: 1,
      unitPriceVnd: 20_000_000,
      lineSubtotalVnd: 20_000_000,
    },
  ],
  payment: {
    actionUrl: "https://pay.sepay.vn/v1/checkout",
    method: "POST",
    fields: [
      { name: "merchant", value: "novacommerce" },
      { name: "invoice", value: "NVC-001" },
      { name: "amount", value: "18000000" },
    ],
  },
};

function accountApi(): CustomerAccountApi {
  return {
    profile: vi.fn(async () => ({
      id: "customer-1",
      email: "duy@example.com",
      fullName: "Duy Duong",
      version: 1,
    })),
    addresses: vi.fn(async () => [...addresses]),
  } as unknown as CustomerAccountApi;
}

function renderCheckout(api: CheckoutApi) {
  return render(
    <MemoryRouter>
      <CheckoutPage api={api} accountApi={accountApi()} />
    </MemoryRouter>,
  );
}

describe("storefront checkout", () => {
  it("selects an address, applies a promotion, locks submit, and renders the immutable review", async () => {
    let resolveCheckout: ((value: CheckoutCreation) => void) | undefined;
    const create = vi.fn(
      () =>
        new Promise<CheckoutCreation>((resolve) => {
          resolveCheckout = resolve;
        }),
    );
    renderCheckout({ create } as unknown as CheckoutApi);

    await screen.findByText("Duy Duong");
    await userEvent.click(screen.getByText("Duy Nguyen"));
    await userEvent.type(screen.getByLabelText("Mã ưu đãi"), "nova10");
    const submit = screen.getByRole("button", { name: "Tiếp tục thanh toán" });
    await userEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(create).toHaveBeenCalledWith(
      { addressId: "address-second", promotionCode: "NOVA10" },
      expect.any(String),
    );

    resolveCheckout?.(checkout);
    expect(await screen.findByText("Nova Laptop Pro")).toBeVisible();
    expect(screen.getByText(/18\.000\.000/)).toBeVisible();
    expect(screen.getByLabelText("Mã ưu đãi")).toBeDisabled();
    expect(screen.getAllByRole("radio").every((radio) => radio.hasAttribute("disabled"))).toBe(true);

    const form = screen.getByRole("button", { name: "Thanh toán qua SePay" }).closest("form");
    expect(form).toHaveAttribute("action", checkout.payment.actionUrl);
    expect(form).toHaveAttribute("method", "POST");
    expect(
      [...within(form as HTMLFormElement).getAllByDisplayValue(/.+/)].map(
        (input) => [input.getAttribute("name"), input.getAttribute("value")],
      ),
    ).toEqual([
      ["merchant", "novacommerce"],
      ["invoice", "NVC-001"],
      ["amount", "18000000"],
    ]);
  });

  it.each([
    ["PRODUCT_CHANGED", "Thông tin sản phẩm đã thay đổi"],
    ["INSUFFICIENT_STOCK", "Số lượng sản phẩm trong kho không còn đủ"],
    ["PROMOTION_NOT_ELIGIBLE", "Đơn hàng này chưa đủ điều kiện nhận ưu đãi"],
    ["PAYMENT_PROVIDER_NOT_CONFIGURED", "Thanh toán qua SePay đang tạm thời chưa sẵn sàng"],
  ])("shows a recoverable %s error", async (errorCode, message) => {
    const create = vi.fn(async () => {
      throw new StorefrontApiError(errorCode, "provider message", 409);
    });
    renderCheckout({ create } as unknown as CheckoutApi);
    await screen.findByText("Duy Duong");
    await userEvent.click(
      screen.getByRole("button", { name: "Tiếp tục thanh toán" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(
      screen.getByRole("button", { name: "Tiếp tục thanh toán" }),
    ).toBeEnabled();
  });
});
