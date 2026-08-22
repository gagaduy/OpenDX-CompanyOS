// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export {
  createOrderHealthReader,
  createOrderModule,
  type OrderHealthDependencies,
  type OrderModuleDependencies,
} from "./order.module";
export type { PendingOrderCancellationPort, CancelPendingOrderRequest } from "./application/services/interfaces/pending-order-cancellation-port";
export type { OrderCheckoutPort, CreatePendingOrderRequest } from "./application/services/interfaces/order-checkout-port";
export type {
  CustomerOrderOperationsReader,
  PaidCustomerFacts,
  PaidCustomerSegmentId,
  PaidSegmentCustomerFacts,
} from "./application/services/interfaces/customer-order-operations-reader";
export type {
  OrderExpiryRiskInput,
  OrderExpiryRiskResult,
  OrderHealthReader,
  OrderHealthWindow,
  OrderInvalidEvidence,
  OrderInvalidReason,
  OrderInvalidStateResult,
  OrderStalledInput,
  OrderStalledReason,
  OrderStalledResult,
  SupportOrderContext,
  SupportOrderContextReader,
} from "./application/services/interfaces/order-health-reader";
