// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { Customer } from "../../../domain/entities/customer";
import type { CustomerAddress } from "../../../domain/entities/customer-address";
import type { CustomerRepository } from "../../repositories/interfaces/customer.repository";
import type {
  CustomerOperationsDetail,
  CustomerOperationsReader,
  CustomerOperationsSummary,
} from "../interfaces/customer-operations-reader";

export class CustomerOperationsReaderService implements CustomerOperationsReader {
  constructor(
    private readonly repository: CustomerRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async search(query: {
    readonly search?: string;
    readonly page: number;
    readonly pageSize: number;
  }): Promise<{
    readonly items: readonly CustomerOperationsSummary[];
    readonly totalItems: number;
  }> {
    if (
      !Number.isInteger(query.page) || query.page < 1 ||
      !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100
    ) {
      throw new RangeError("Customer search page must be at least 1 and page size must be between 1 and 100");
    }
    const search = query.search?.trim().toLowerCase();
    return this.transactions.runReadOnly(async (session) => {
      const result = await this.repository.searchOperations(session, {
        page: query.page,
        pageSize: query.pageSize,
        ...(search === undefined || search.length === 0 ? {} : { search }),
      });
      return {
        items: result.items.map(toSummary),
        totalItems: result.totalItems,
      };
    });
  }

  async get(customerId: string): Promise<CustomerOperationsDetail | undefined> {
    return this.transactions.runReadOnly(async (session) => {
      const customer = await this.repository.findCustomerById(session, customerId);
      if (customer === undefined) return undefined;
      const addresses = await this.repository.listAddresses(session, customerId);
      return {
        ...toSummary(customer),
        addresses: addresses.map(toAddress),
      };
    });
  }

  async getMany(customerIds: readonly string[]): Promise<readonly CustomerOperationsSummary[]> {
    if (customerIds.length === 0) return [];
    return this.transactions.runReadOnly(async (session) =>
      (await this.repository.findCustomersByIds(session, customerIds)).map(toSummary),
    );
  }

  async getSupportContext(customerId: string): Promise<Pick<
    CustomerOperationsSummary,
    "id" | "email" | "fullName" | "phoneNumber"
  > | undefined> {
    return this.transactions.runReadOnly(async (session) => {
      const customer = await this.repository.findCustomerById(session, customerId);
      if (customer === undefined) return undefined;
      const { id, email, fullName, phoneNumber } = toSummary(customer);
      return {
        id,
        email,
        ...(fullName === undefined ? {} : { fullName }),
        ...(phoneNumber === undefined ? {} : { phoneNumber }),
      };
    });
  }
}

function toSummary(customer: Customer): CustomerOperationsSummary {
  return {
    id: customer.id,
    email: customer.email,
    ...(customer.fullName === undefined ? {} : { fullName: customer.fullName }),
    ...(customer.phoneNumber === undefined ? {} : { phoneNumber: customer.phoneNumber }),
    status: customer.status,
    createdAt: customer.createdAt,
  };
}

function toAddress(address: CustomerAddress): CustomerOperationsDetail["addresses"][number] {
  return {
    id: address.id,
    recipientName: address.recipientName,
    phoneNumber: address.phoneNumber,
    addressLine: address.addressLine,
    ward: address.ward,
    provinceOrCity: address.provinceOrCity,
    ...(address.postalCode === undefined ? {} : { postalCode: address.postalCode }),
    isDefault: address.isDefault,
  };
}
