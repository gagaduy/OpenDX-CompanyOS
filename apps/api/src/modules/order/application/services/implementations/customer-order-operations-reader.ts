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
}
