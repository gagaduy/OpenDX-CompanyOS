// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { OrderRepository } from "../../repositories/interfaces/order.repository";
import type { CustomerOrderOperationsReader } from "../interfaces/customer-order-operations-reader";

export class CustomerOrderOperationsReaderService implements CustomerOrderOperationsReader {
  constructor(
    private readonly repository: OrderRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async listByCustomer(customerId: string, limit: number) {
    return this.transactions.runReadOnly((session) =>
      this.repository.listOperationsByCustomer(session, customerId, limit),
    );
  }

  async getOwned(customerId: string, orderId: string) {
    const order = await this.transactions.runReadOnly((session) =>
      this.repository.findOperationsOwned(session, customerId, orderId),
    );
    if (order === undefined) return undefined;
    return {
      id: order.id,
      publicNumber: order.publicNumber,
      status: order.status,
      totalVnd: order.totalVnd,
      createdAt: order.createdAt,
    };
  }

  async getPaidCustomerFacts(customerId: string) {
    return this.transactions.runReadOnly((session) =>
      this.repository.getPaidCustomerFacts(session, customerId),
    );
  }

  async listPaidSegmentCustomers(query: Parameters<CustomerOrderOperationsReader["listPaidSegmentCustomers"]>[0]) {
    if (
      !Number.isInteger(query.page) || query.page < 1
      || !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100
    ) {
      throw new RangeError("Paid segment page must be at least 1 and page size must be between 1 and 100");
    }
    const parsed = new Date(query.asOf);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== query.asOf) {
      throw new RangeError("Paid segment calculation time must be an ISO instant");
    }
    return this.transactions.runReadOnly((session) =>
      this.repository.listPaidSegmentCustomers(session, query),
    );
  }
}
