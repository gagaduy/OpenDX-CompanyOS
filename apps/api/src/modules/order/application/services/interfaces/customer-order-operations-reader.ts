// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type PaidCustomerSegmentId =
  | "new_customer"
  | "first_time_buyer"
  | "repeat_customer"
  | "high_value"
  | "inactive_90d";

export interface PaidCustomerFacts {
  readonly paidOrderCount: number;
  readonly lifetimePaidVnd: number;
  readonly latestPaidAt?: string;
}

export interface PaidSegmentCustomerFacts extends PaidCustomerFacts {
  readonly customerId: string;
}

export interface CustomerOrderOperationsReader {
  listByCustomer(customerId: string, limit: number): Promise<readonly {
    readonly id: string;
    readonly publicNumber: string;
    readonly status: string;
    readonly totalVnd: number;
    readonly createdAt: string;
    readonly paidAt?: string;
  }[]>;
  getOwned(customerId: string, orderId: string): Promise<{
    readonly id: string;
    readonly publicNumber: string;
    readonly status: string;
    readonly totalVnd: number;
    readonly createdAt: string;
  } | undefined>;
  getPaidCustomerFacts(customerId: string): Promise<PaidCustomerFacts>;
  listPaidSegmentCustomers(query: {
    readonly segmentId: PaidCustomerSegmentId;
    readonly asOf: string;
    readonly page: number;
    readonly pageSize: number;
  }): Promise<{
    readonly items: readonly PaidSegmentCustomerFacts[];
    readonly totalItems: number;
  }>;
}
