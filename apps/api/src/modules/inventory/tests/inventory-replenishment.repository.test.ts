// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { PostgresqlInventoryReplenishmentRepository } from "../infrastructure/repositories/implementations/postgresql-inventory-replenishment.repository";

describe("PostgresqlInventoryReplenishmentRepository", () => {
  it("creates and retrieves pending replenishment proposals", async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("INSERT INTO inventory_replenishment_proposals")) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes("WHERE status = 'pending_review'")) {
          return Promise.resolve({
            rows: [
              {
                id: "prop-1",
                trigger_source: "scheduled_cron",
                status: "pending_review",
                summary: "Phát hiện 2 SKU cạn kiệt",
                risk_assessment: "Nguy cơ đứt gãy",
                items: JSON.stringify([
                  { sku: "SKU-1", variantId: "v-1", recommendedRestockQuantity: 20 },
                ]),
                total_budget_vnd: "13000000",
                docx_report_key: "report.docx",
                created_at: new Date("2026-09-10T10:00:00Z"),
                updated_at: new Date("2026-09-10T10:00:00Z"),
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const repo = new PostgresqlInventoryReplenishmentRepository(mockClient as any);
    await repo.create({
      id: "prop-1",
      triggerSource: "scheduled_cron",
      status: "pending_review",
      summary: "Phát hiện 2 SKU cạn kiệt",
      riskAssessment: "Nguy cơ đứt gãy",
      items: [
        {
          sku: "SKU-1",
          variantId: "v-1",
          productId: "p-1",
          productName: "Sản phẩm 1",
          categoryName: "Linh kiện",
          onHand: 2,
          reserved: 0,
          availableQuantity: 2,
          recentUnitsSold7d: 14,
          recommendedRestockQuantity: 20,
          estimatedUnitCostVnd: 650000,
          estimatedLineCostVnd: 13000000,
          actionRationale: "Bán 14 cái trong 7 ngày",
        },
      ],
      totalBudgetVnd: 13000000,
      docxReportKey: "report.docx",
    });

    const pending = await repo.findLatestPending();
    expect(pending).toBeDefined();
    expect(pending?.id).toBe("prop-1");
    expect(pending?.items[0].sku).toBe("SKU-1");
  });

  it("updates proposal status with reviewer note", async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = new PostgresqlInventoryReplenishmentRepository(mockClient as any);
    await repo.updateStatus("prop-1", "approved", "admin-1");
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE inventory_replenishment_proposals"),
      ["approved", "admin-1", "prop-1"],
    );
  });
});
