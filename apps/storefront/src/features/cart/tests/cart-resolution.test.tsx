// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CustomerSessionProvider, type CustomerSessionApi } from "../../authentication";
import type { CartApi } from "../api/cart-api";
import { CartResolutionDialog } from "../components/cart-resolution-dialog";
import { CartProvider, useCart } from "../hooks/cart-context";
import { CartPage } from "../pages/cart-page";
describe("cart resolution", () => {
  it("offers every explicit resolution action", async () => {
    const onResolve = vi.fn();
    render(<CartResolutionDialog busy={false} onResolve={onResolve} />);
    expect(screen.getByRole("dialog")).toHaveClass("transaction-dialog");
    for (const [label, action] of [
      ["Giữ giỏ đã lưu", "keep_saved"],
      ["Giữ giỏ hiện tại", "keep_guest"],
      ["Gộp hai giỏ", "merge"],
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(onResolve).toHaveBeenLastCalledWith(action);
    }
  });

  it("renders a labelled cart line list with a sticky authoritative summary", async () => {
    const cart = {
      ownerKind: "customer" as const,
      version: 1,
      status: "active" as const,
      items: [{
        id: "line-1", variantId: "variant-1", productId: "product-1",
        productName: "Nova Laptop", productSlug: "nova-laptop", variantTitle: "Pro",
        sku: "NOVA-1", optionValues: {}, primaryMediaUrl: "/laptop.png",
        primaryMediaAltText: "Nova Laptop", quantity: 1, unitPriceVnd: 20_000_000,
        subtotalVnd: 20_000_000, availableQuantity: 3, purchasable: true,
        change: "unchanged" as const,
      }],
      itemCount: 1,
      totalVnd: 20_000_000,
      requiresAction: false,
    };
    const api = { get: vi.fn(async () => cart) } as unknown as CartApi;
    const sessions = {
      get: vi.fn(async () => ({
        kind: "customer" as const, customerId: "customer-1",
        email: "buyer@example.com", expiresAt: "2099-01-01",
      })),
    } as unknown as CustomerSessionApi;
    render(
      <MemoryRouter>
        <CustomerSessionProvider api={sessions}>
          <CartProvider api={api}>
            <CartPage apiBaseUrl="http://localhost:4000" />
          </CartProvider>
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Nova Laptop" })).toBeVisible();
    expect(screen.getByLabelText("Số lượng Nova Laptop")).toHaveValue(1);
    expect(screen.getByRole("region", { name: "Sản phẩm trong giỏ" })).toHaveClass(
      "transaction-list",
    );
    expect(screen.getByRole("complementary", { name: "Tóm tắt giỏ hàng" })).toHaveClass(
      "sticky-summary",
    );
  });

  it("reuses one idempotency key when a logical resolution is retried", async () => {
    const emptyCart = {
      ownerKind: "customer" as const,
      version: 0,
      status: "empty" as const,
      items: [],
      itemCount: 0,
      totalVnd: 0,
      requiresAction: false,
    };
    const resolve = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        data: { status: "resolved", resultingCart: emptyCart },
      });
    const api = {
      get: vi.fn(async () => emptyCart),
      resolve,
    } as unknown as CartApi;

    function RetryProbe() {
      const cart = useCart();
      return (
        <button
          onClick={() => void cart.resolve("merge").catch(() => undefined)}
        >
          Resolve
        </button>
      );
    }
    render(
      <CartProvider api={api}>
        <RetryProbe />
      </CartProvider>,
    );
    const button = screen.getByRole("button", { name: "Resolve" });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve.mock.calls[0]?.[1]).toBe(resolve.mock.calls[1]?.[1]);
  });
});
