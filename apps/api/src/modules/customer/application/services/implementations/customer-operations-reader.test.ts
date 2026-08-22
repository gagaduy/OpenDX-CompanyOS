// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { CustomerRepository } from "../../repositories/interfaces/customer.repository";
import { CustomerOperationsReaderService } from "./customer-operations-reader";

const session: DatabaseSession = { query: vi.fn() };
const firstCustomer = {
  id: "customer-1",
  email: "nova@example.com",
  emailVerifiedAt: "2026-08-10T00:00:00.000Z",
  fullName: "Nova Buyer",
  phoneNumber: "0901000001",
  status: "active" as const,
  version: 1,
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

describe("CustomerOperationsReaderService", () => {
  it("batch-gets only the requested customers through the public operations DTO", async () => {
    const secondCustomer = {
      ...firstCustomer,
      id: "customer-2",
      email: "second@example.com",
      fullName: undefined,
      phoneNumber: undefined,
    };
    const repository = {
      findCustomersByIds: async (_session: DatabaseSession, customerIds: readonly string[]) =>
        customerIds.join(",") === "customer-2,customer-1"
          ? [secondCustomer, firstCustomer]
          : [],
    } as unknown as CustomerRepository;
    const reader = new CustomerOperationsReaderService(repository, transactionRunner());

    await expect(reader.getMany(["customer-2", "customer-1"])).resolves.toEqual([
      {
        id: "customer-2",
        email: "second@example.com",
        status: "active",
        createdAt: "2026-08-10T00:00:00.000Z",
      },
      {
        id: "customer-1",
        email: "nova@example.com",
        fullName: "Nova Buyer",
        phoneNumber: "0901000001",
        status: "active",
        createdAt: "2026-08-10T00:00:00.000Z",
      },
    ]);
  });

  it.each([
    { page: 0, pageSize: 1 },
    { page: 1, pageSize: 0 },
    { page: 1, pageSize: 101 },
  ])("rejects an out-of-bounds customer search %#", async (query) => {
    const repository = {
      searchOperations: async () => ({ items: [], totalItems: 0 }),
    } as unknown as CustomerRepository;
    const reader = new CustomerOperationsReaderService(repository, transactionRunner());

    await expect(reader.search(query)).rejects.toBeInstanceOf(RangeError);
  });

  it("normalizes a bounded customer search across CRM lookup fields", async () => {
    const repository = {
      searchOperations: async (_session: DatabaseSession, query: {
        readonly search?: string;
        readonly page: number;
        readonly pageSize: number;
      }) => query.search === "nova buyer" && query.page === 2 && query.pageSize === 1
        ? { items: [firstCustomer], totalItems: 2 }
        : { items: [], totalItems: 0 },
    } as unknown as CustomerRepository;
    const reader = new CustomerOperationsReaderService(repository, transactionRunner());

    await expect(reader.search({ search: "  NOVA BUYER  ", page: 2, pageSize: 1 })).resolves.toEqual({
      items: [{
        id: "customer-1",
        email: "nova@example.com",
        fullName: "Nova Buyer",
        phoneNumber: "0901000001",
        status: "active",
        createdAt: "2026-08-10T00:00:00.000Z",
      }],
      totalItems: 2,
    });
  });

  it("returns support context without customer status, addresses, or creation data", async () => {
    const repository = {
      findCustomerById: async (_session: DatabaseSession, customerId: string) =>
        customerId === "customer-1" ? firstCustomer : undefined,
    } as unknown as CustomerRepository;
    const reader = new CustomerOperationsReaderService(repository, transactionRunner());

    await expect(reader.getSupportContext("customer-1")).resolves.toEqual({
      id: "customer-1",
      email: "nova@example.com",
      fullName: "Nova Buyer",
      phoneNumber: "0901000001",
    });
  });
});

function transactionRunner(): TransactionRunner {
  return {
    run: (work) => work(session),
    runReadOnly: (work) => work(session),
  };
}
