// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { OrderDetail } from "../types/order.types";

const labels: Record<OrderDetail["status"], string> = {
  pending_payment: "Chờ thanh toán",
  paid: "Đã thanh toán",
  processing: "Đang xử lý",
  ready_for_fulfillment: "Sẵn sàng hoàn tất",
  completed: "Hoàn tất",
  canceled: "Đã hủy",
  expired: "Hết hạn",
};

export function OrderStatus({ status }: { readonly status: OrderDetail["status"] }) {
  return (
    <span className={`order-status status-badge ${status}`}>
      {labels[status]}
    </span>
  );
}

export function orderStatusLabel(status: OrderDetail["status"]): string {
  return labels[status];
}
