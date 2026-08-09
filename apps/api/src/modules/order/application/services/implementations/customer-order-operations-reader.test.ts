// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { OrderRepository } from "../../repositories/interfaces/order.repository";
import { CustomerOrderOperationsReaderService } from "./customer-order-operations-reader";

const session: DatabaseSession = { query: vi.fn() };

describe("CustomerOrderOperationsReaderService", () => {
  it("returns the newest customer orders with paid timestamps", async () => {
    const repository = {
      listOperationsByCustomer: async () => [{
        id: "order-newest",
        publicNumber: "NVC-20260810-NEWEST",
        status: "paid" as const,
        totalVnd: 230_000,
        createdAt: "2026-08-10T09:00:00.000Z",
        paidAt: "2026-08-10T09:02:00.000Z",
      }],
    } as unknown as OrderRepository;
    const reader = new CustomerOrderOperationsReaderService(repository, transactionRunner());

    await expect(reader.listByCustomer("customer-a", 5)).resolves.toEqual([{
      id: "order-newest",
      publicNumber: "NVC-20260810-NEWEST",
      status: "paid",
      totalVnd: 230_000,
      createdAt: "2026-08-10T09:00:00.000Z",
      paidAt: "2026-08-10T09:02:00.000Z",
    }]);
  });

  it("does not expose an order owned by another customer", async () => {
    const repository = {
      findOperationsOwned: async (_session: DatabaseSession, customerId: string, orderId: string) =>
        customerId === "customer-a" && orderId === "order-of-a"
          ? {
              id: "order-of-a",
              publicNumber: "NVC-20260810-OWNED",
              status: "processing" as const,
              totalVnd: 125_000,
              createdAt: "2026-08-10T10:00:00.000Z",
            }
          : undefined,
    } as unknown as OrderRepository;
    const reader = new CustomerOrderOperationsReaderService(repository, transactionRunner());

    await expect(reader.getOwned("customer-a", "order-of-b")).resolves.toBeUndefined();
  });

  it("omits payment evidence from an owned-order lookup", async () => {
    const repository = {
      findOperationsOwned: async () => ({
        id: "order-of-a",
        publicNumber: "NVC-20260810-OWNED",
        status: "paid" as const,
        totalVnd: 125_000,
        createdAt: "2026-08-10T10:00:00.000Z",
        paidAt: "2026-08-10T10:02:00.000Z",
      }),
    } as unknown as OrderRepository;
    const reader = new CustomerOrderOperationsReaderService(repository, transactionRunner());

    await expect(reader.getOwned("customer-a", "order-of-a")).resolves.toEqual({
      id: "order-of-a",
      publicNumber: "NVC-20260810-OWNED",
      status: "paid",
      totalVnd: 125_000,
      createdAt: "2026-08-10T10:00:00.000Z",
    });
  });
});

function transactionRunner(): TransactionRunner {
  return {
    run: (work) => work(session),
    runReadOnly: (work) => work(session),
  };
}
