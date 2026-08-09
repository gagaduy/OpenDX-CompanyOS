// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export { createOrderModule, type OrderModuleDependencies } from "./order.module";
export type { PendingOrderCancellationPort, CancelPendingOrderRequest } from "./application/services/interfaces/pending-order-cancellation-port";
export type { OrderCheckoutPort, CreatePendingOrderRequest } from "./application/services/interfaces/order-checkout-port";
export type { CustomerOrderOperationsReader } from "./application/services/interfaces/customer-order-operations-reader";
