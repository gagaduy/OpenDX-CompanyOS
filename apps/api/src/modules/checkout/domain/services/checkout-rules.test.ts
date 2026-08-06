// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { allocateOrderDiscount, calculateSubtotal } from "./checkout-rules";

describe("checkout rules", () => {
  it("calculates integer VND totals and allocates every discount unit", () => {
    expect(calculateSubtotal([{ quantity: 2, unitPriceVnd: 100_000 }, { quantity: 1, unitPriceVnd: 50_000 }])).toBe(250_000);
    const allocation = allocateOrderDiscount([200_000, 50_000], 33_333);
    expect(allocation).toEqual([26_666, 6_667]);
    expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(33_333);
  });

  it("rejects unsafe monetary multiplication", () => {
    expect(() => calculateSubtotal([{ quantity: 2, unitPriceVnd: Number.MAX_SAFE_INTEGER }])).toThrowError(expect.objectContaining({ code: "MONEY_OVERFLOW" }));
  });
});
