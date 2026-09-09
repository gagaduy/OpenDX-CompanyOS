// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { AiOperationsService } from "../application/services/implementations/ai-operations.service";

describe("AiOperationsService", () => {
  it("calculates restock quantities correctly by stock status", async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            variantId: "v1",
            productId: "p1",
            productName: "Critical Product",
            productSlug: "critical-product",
            sku: "SKU-CRITICAL",
            categoryName: "Linh kiện",
            onHand: 3,
            reserved: 1,
            priceMinor: 1000000,
          },
          {
            variantId: "v2",
            productId: "p2",
            productName: "Slow Moving Product",
            productSlug: "slow-product",
            sku: "SKU-SLOW",
            categoryName: "Phụ kiện",
            onHand: 30,
            reserved: 0,
            priceMinor: 500000,
          },
          {
            variantId: "v3",
            productId: "p3",
            productName: "Balanced Product",
            productSlug: "balanced-product",
            sku: "SKU-BALANCED",
            categoryName: "Phụ kiện",
            onHand: 15,
            reserved: 2,
            priceMinor: 800000,
          },
        ],
      }),
      connect: vi.fn(),
    } as any;

    const service = new AiOperationsService(mockDb, () => "2026-09-09T00:00:00.000Z", () => "test-id");
    const proposal = await service.generateOperationsProposal({ prompt: "Rà soát kho hàng" });

    expect(proposal.items).toHaveLength(3);

    const critical = proposal.items.find((it) => it.sku === "SKU-CRITICAL");
    expect(critical).toBeDefined();
    expect(critical?.stockStatus).toBe("critical_low");
    expect(critical?.recommendedRestockQuantity).toBeGreaterThan(0);
    expect(critical?.estimatedTotalCostVnd).toBe((critical?.recommendedRestockQuantity ?? 0) * (critical?.estimatedUnitCostVnd ?? 0));

    const slow = proposal.items.find((it) => it.sku === "SKU-SLOW");
    expect(slow).toBeDefined();
    expect(slow?.stockStatus).toBe("slow_moving");
    expect(slow?.recommendedRestockQuantity).toBe(0);
    expect(slow?.estimatedTotalCostVnd).toBe(0);

    const balanced = proposal.items.find((it) => it.sku === "SKU-BALANCED");
    expect(balanced).toBeDefined();
    expect(balanced?.stockStatus).toBe("balanced");
    expect(balanced?.recommendedRestockQuantity).toBe(0);
    expect(balanced?.estimatedTotalCostVnd).toBe(0);
  });

  it("applies restock proposal transactionally and appends stock movements", async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, sku FROM product_variants")) {
          return Promise.resolve({ rows: [{ id: "v1", sku: "SKU-CRITICAL" }] });
        }
        if (sql.includes("SELECT id, on_hand FROM inventory_items")) {
          return Promise.resolve({ rows: [{ id: "inv-1", on_hand: 5 }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };

    const mockDb = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(mockClient),
    } as any;

    const service = new AiOperationsService(mockDb, () => "2026-09-09T00:00:00.000Z", () => "test-id");
    const result = await service.applyOperationsProposal("test-proposal", {
      items: [{ variantId: "v1", restockQuantity: 20 }],
    });

    expect(result.appliedCount).toBe(1);
    expect(result.updatedItems[0]).toEqual({
      variantId: "v1",
      sku: "SKU-CRITICAL",
      previousOnHand: 5,
      newOnHand: 25,
      addedQuantity: 20,
    });
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();
  });
});

