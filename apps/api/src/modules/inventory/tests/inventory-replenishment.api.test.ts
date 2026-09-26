// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { InventoryController } from "../presentation/controllers/inventory.controller";
import { createInventoryRouter } from "../presentation/routes/inventory.routes";

describe("Inventory Replenishment API", () => {
  it("GET /replenishment/pending returns latest pending proposal", async () => {
    const mockRepo = {
      findLatestPending: vi.fn().mockResolvedValue({
        id: "prop-123",
        triggerSource: "scheduled_cron",
        status: "pending_review",
        summary: "Phát hiện 2 SKU sắp hết",
        items: [],
        totalBudgetVnd: 5000000,
        createdAt: "2026-09-10T10:00:00Z",
      }),
      findById: vi.fn(),
      updateStatus: vi.fn(),
      create: vi.fn(),
    };
    const mockMonitor = {
      triggerScan: vi.fn(),
      startHeartbeat: vi.fn(),
      stopHeartbeat: vi.fn(),
    };
    const controller = new InventoryController(
      {} as any,
      undefined,
      mockRepo as any,
      mockMonitor as any,
    );

    const app = express();
    app.use(express.json());
    app.use(
      "/v1/admin/inventory",
      createInventoryRouter(
        controller,
        (req, res, next) => {
          res.locals.staffPrincipal = { subject: "staff-1", roles: ["administrator"] };
          next();
        },
        vi.fn() as any,
      ),
    );

    const response = await request(app).get("/v1/admin/inventory/replenishment/pending");
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe("prop-123");
    expect(mockRepo.findLatestPending).toHaveBeenCalled();
  });

  it("POST /replenishment/:proposalId/dismiss marks proposal as dismissed", async () => {
    const mockRepo = {
      findLatestPending: vi.fn(),
      findById: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
    };
    const controller = new InventoryController(
      {} as any,
      undefined,
      mockRepo as any,
    );

    const app = express();
    app.use(express.json());
    app.use(
      "/v1/admin/inventory",
      createInventoryRouter(
        controller,
        (req, res, next) => {
          res.locals.staffPrincipal = { subject: "staff-1", roles: ["administrator"] };
          next();
        },
        vi.fn() as any,
      ),
    );

    const response = await request(app).post("/v1/admin/inventory/replenishment/prop-123/dismiss");
    expect(response.status).toBe(200);
    expect(mockRepo.updateStatus).toHaveBeenCalledWith("prop-123", "dismissed", "staff-1");
  });
});
