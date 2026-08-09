// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type { orderDetailSchema, orderListEnvelopeSchema, orderStatusSchema } from "../schemas/order-api.schema";

export type OrderStatus = z.infer<typeof orderStatusSchema>;
type OrderSummaryDto = z.infer<typeof orderListEnvelopeSchema>["data"]["items"][number];
type OrderDetailDto = z.infer<typeof orderDetailSchema>;
export type OrderSummaryView = OrderSummaryDto & { readonly statusLabel: string };
export type OrderDetailView = OrderDetailDto & { readonly customerEmail: string; readonly statusLabel: string };
export interface OrderPageView { readonly items: readonly OrderSummaryView[]; readonly page: number; readonly pageSize: number; readonly totalItems: number; readonly totalPages: number; }
export interface OrderQuery { readonly status?: OrderStatus; readonly page: number; readonly pageSize: number; }
export interface OrderTransitionInput { readonly targetStatus: Extract<OrderStatus, "canceled" | "processing" | "ready_for_fulfillment" | "completed">; readonly reasonCode: string; readonly version: number; }
