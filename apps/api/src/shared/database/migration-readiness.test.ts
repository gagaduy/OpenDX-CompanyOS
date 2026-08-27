// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { assertRequiredMigrations } from "./migration-readiness";

interface ReadinessOverride {
  readonly wishlist_migration?: boolean;
  readonly wishlist_table?: boolean;
  readonly catalog?: string;
}

function completeReadinessRow(overrides: ReadinessOverride = {}) {
  return {
    catalog: "4",
    company_core: "1",
    inventory: "2",
    customer: "2",
    cart: "1",
    promotion: "1",
    checkout: "2",
    orders: "2",
    payment: "2",
    crm: "1",
    support: "3",
    reporting: "2",
    agentic: "7",
    wishlist_migration: true,
    wishlist_table: true,
    ...overrides,
  };
}

function fakePool(row: ReturnType<typeof completeReadinessRow>) {
  return {
    query: vi.fn(async () => ({ rows: [row], rowCount: 1 })),
  };
}

describe("assertRequiredMigrations", () => {
  it.each([
    [{ wishlist_migration: false }, "missing Wishlist migration ledger"],
    [{ wishlist_table: false }, "missing Wishlist table"],
    [{ catalog: "3" }, "missing latest Catalog migration"],
  ] as const)("rejects incomplete schema: %s", async (override, _case) => {
    await expect(
      assertRequiredMigrations(fakePool(completeReadinessRow(override))),
    ).rejects.toThrow("Database migrations are incomplete");
  });

  it("accepts every required migration and the Wishlist table", async () => {
    await expect(
      assertRequiredMigrations(fakePool(completeReadinessRow())),
    ).resolves.toBeUndefined();
  });
});
