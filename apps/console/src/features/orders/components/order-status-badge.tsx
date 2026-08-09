// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { OrderStatus } from "../types/order.types";
import { orderStatusLabel } from "../mappers/order.mapper";

export function OrderStatusBadge({ status }: { readonly status: OrderStatus }) {
  return <span className={`operationStatus order-${status}`}>{orderStatusLabel(status)}</span>;
}
