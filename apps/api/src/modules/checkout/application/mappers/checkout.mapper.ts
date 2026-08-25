// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CheckoutDto } from "../dtos/checkout.dto";
import type { CheckoutAggregate } from "../repositories/interfaces/checkout.repository";

export function toCheckoutDto({ checkout, lines }: CheckoutAggregate): CheckoutDto {
  if (checkout.orderId === undefined || checkout.status === "created") throw new Error("Checkout is not publicly readable");
  return {
    id: checkout.id, orderId: checkout.orderId, status: checkout.status,
    subtotalVnd: checkout.subtotalVnd, discountVnd: checkout.discountVnd, totalVnd: checkout.totalVnd,
    currency: "VND", expiresAt: checkout.expiresAt,
    ...(checkout.promotionCode === undefined ? {} : { promotionCode: checkout.promotionCode }),
    lines: lines.map((line) => ({ sku: line.sku, productTitle: line.productTitle, variantLabel: line.variantLabel, quantity: line.quantity, unitPriceVnd: line.unitPriceVnd, lineSubtotalVnd: line.lineSubtotalVnd })),
  };
}
