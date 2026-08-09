// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

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
}
