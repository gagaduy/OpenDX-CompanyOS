// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CheckoutLine } from "../entities/checkout-line";
import { CheckoutDomainError } from "../exceptions/checkout-domain.error";

export function calculateSubtotal(lines: readonly Pick<CheckoutLine, "quantity" | "unitPriceVnd">[]): number {
  if (lines.length === 0) invalid("Checkout requires at least one line");
  let subtotal = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.unitPriceVnd) || line.unitPriceVnd <= 0) invalid("Checkout line is invalid");
    const lineSubtotal = line.quantity * line.unitPriceVnd;
    if (!Number.isSafeInteger(lineSubtotal) || !Number.isSafeInteger(subtotal + lineSubtotal)) throw new CheckoutDomainError("MONEY_OVERFLOW", "Checkout total exceeds the supported range");
    subtotal += lineSubtotal;
  }
  return subtotal;
}

export function allocateOrderDiscount(lineSubtotals: readonly number[], discountVnd: number): readonly number[] {
  const subtotal = lineSubtotals.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(subtotal) || lineSubtotals.some((value) => !Number.isSafeInteger(value) || value < 0)) invalid("Checkout subtotal is invalid");
  if (!Number.isSafeInteger(discountVnd) || discountVnd < 0 || discountVnd > subtotal || subtotal <= 0) invalid("Checkout discount is invalid");
  let allocated = 0;
  return lineSubtotals.map((lineSubtotal, index) => {
    const amount = index === lineSubtotals.length - 1
      ? discountVnd - allocated
      : Number(
          (BigInt(discountVnd) * BigInt(lineSubtotal)) / BigInt(subtotal),
        );
    allocated += amount;
    return amount;
  });
}

function invalid(message: string): never { throw new CheckoutDomainError("INVALID_CHECKOUT", message); }
