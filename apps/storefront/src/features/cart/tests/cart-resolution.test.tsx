// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CartApi } from "../api/cart-api";
import { CartResolutionDialog } from "../components/cart-resolution-dialog";
import { CartProvider, useCart } from "../hooks/cart-context";
describe("cart resolution", () => {
  it("offers every explicit resolution action", async () => {
    const onResolve = vi.fn();
    render(<CartResolutionDialog busy={false} onResolve={onResolve} />);
    for (const [label, action] of [
      ["Giữ giỏ đã lưu", "keep_saved"],
      ["Giữ giỏ hiện tại", "keep_guest"],
      ["Gộp hai giỏ", "merge"],
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(onResolve).toHaveBeenLastCalledWith(action);
    }
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
