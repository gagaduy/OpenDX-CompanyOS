// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { orderDetailSchema, orderListEnvelopeSchema } from "../schemas/order-api.schema";
import type { OrderDetailView, OrderPageView, OrderStatus, OrderSummaryView } from "../types/order.types";

const labels: Record<OrderStatus, string> = {
  pending_payment: "Pending payment", paid: "Paid", processing: "Processing",
  ready_for_fulfillment: "Ready for completion", completed: "Completed",
  canceled: "Canceled", expired: "Expired",
};
export const orderStatusLabel = (status: OrderStatus): string => labels[status];
export const mapOrderSummary = (value: z.infer<typeof orderListEnvelopeSchema>["data"]["items"][number]): OrderSummaryView => ({ ...value, statusLabel: labels[value.status] });
export const mapOrderPage = (value: z.infer<typeof orderListEnvelopeSchema>["data"]): OrderPageView => ({ ...value, items: value.items.map(mapOrderSummary) });
export const mapOrderDetail = (value: z.infer<typeof orderDetailSchema>): OrderDetailView => ({ ...value, customerEmail: value.contactSnapshot.email, statusLabel: labels[value.status] });
