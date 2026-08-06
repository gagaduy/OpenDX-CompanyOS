// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AdminOrderDetailDto, AdminOrderSummaryDto, OrderDetailDto, OrderListQuery, OrderListResult, OrderSummaryDto, StaffOrderContext, TransitionOrderRequest } from "../../dtos/order.dto";

export interface OrderServiceContract {
  listForCustomer(customerId: string, query: OrderListQuery): Promise<OrderListResult<OrderSummaryDto>>;
  getForCustomer(customerId: string, orderId: string): Promise<OrderDetailDto>;
  listForStaff(query: OrderListQuery, context: StaffOrderContext): Promise<OrderListResult<AdminOrderSummaryDto>>;
  getForStaff(orderId: string, context: StaffOrderContext): Promise<AdminOrderDetailDto>;
  transition(orderId: string, request: TransitionOrderRequest, context: StaffOrderContext): Promise<AdminOrderDetailDto>;
}
