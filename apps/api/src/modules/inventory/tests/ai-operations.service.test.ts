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

  it("resiliently generates docx report even when proposal is evicted from cache", async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            variantId: "v1",
            productId: "p1",
            productName: "Bàn phím cơ Nova (Tactile)",
            productSlug: "ban-phim-co-nova",
            sku: "NOVA-009-1",
            categoryName: "Linh kiện & Phụ kiện",
            onHand: 12,
            reserved: 0,
            priceMinor: 1500000,
          },
        ],
      }),
      connect: vi.fn(),
    } as any;

    const service = new AiOperationsService(mockDb, () => "2026-09-09T00:00:00.000Z", () => "test-id");
    const docxResult = await service.getProposalDocx("non-existent-id");

    expect(docxResult).toBeDefined();
    expect(docxResult.buffer).toBeInstanceOf(Buffer);
    expect(docxResult.buffer.length).toBeGreaterThan(1000);
    expect(docxResult.filename).toContain("bao_cao_kiem_toan_kho_van_non-exis.docx");
    expect(mockDb.query).toHaveBeenCalled();
    const querySql = mockDb.query.mock.calls[0][0];
    expect(querySql).toContain("p.status = 'published'");
  });

  it("generates replenishment analysis with 7-day sales velocity and heuristic fallback", async () => {
    const mockDb = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("units_sold_7d")) {
          return Promise.resolve({
            rows: [
              {
                variantId: "v1",
                productId: "p1",
                productName: "Chuột Gaming RGB",
                productSlug: "chuot-gaming",
                sku: "MS-RGB-01",
                categoryName: "Linh kiện",
                onHand: 3,
                reserved: 1,
                priceMinor: 500000,
                recentUnitsSold7d: 14,
              },
              {
                variantId: "v2",
                productId: "p2",
                productName: "Bàn phím cơ Silent",
                productSlug: "ban-phim-silent",
                sku: "KB-SILENT-02",
                categoryName: "Linh kiện",
                onHand: 20,
                reserved: 0,
                priceMinor: 1200000,
                recentUnitsSold7d: 2,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      connect: vi.fn(),
    } as any;

    const mockRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findLatestPending: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue(null),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AiOperationsService(
      mockDb,
      () => "2026-09-10T12:00:00.000Z",
      () => "prop-uuid-1",
      mockRepo as any,
    );

    const proposal = await service.generateReplenishmentAnalysis({
      triggerSource: "scheduled_cron",
    });

    expect(proposal).not.toBeNull();
    expect(proposal?.items).toHaveLength(1); // Only v1 is critical/low (onHand 3 - reserved 1 = 2 <= 5)
    expect(proposal?.items[0].sku).toBe("MS-RGB-01");
    expect(proposal?.items[0].availableQuantity).toBe(2);
    expect(proposal?.items[0].recentUnitsSold7d).toBe(14);
    expect(proposal?.items[0].recommendedRestockQuantity).toBeGreaterThan(0);
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
  });
});


