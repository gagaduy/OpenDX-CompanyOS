// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { createAiMerchandisingRouter } from "../presentation/routes/ai-merchandising.routes";
import { AiMerchandisingController } from "../presentation/controllers/ai-merchandising.controller";

describe("AI Merchandising Campaigns API Routes", () => {
  it("mounts generate, activate, revert, and active campaign endpoints", async () => {
    const mockService = {
      generateCampaignProposal: vi.fn().mockResolvedValue({ id: "camp-1", discountPercent: 20 }),
      activateCampaign: vi.fn().mockResolvedValue({ success: true }),
      revertCampaign: vi.fn().mockResolvedValue({ success: true }),
      getActiveCampaign: vi.fn().mockResolvedValue({ id: "camp-1", remainingMs: 50000 }),
    };

    const controller = new AiMerchandisingController(mockService as any);
    const authMiddleware = (req: any, res: any, next: any) => {
      res.locals.staffPrincipal = { subject: "staff-1", roles: ["administrator"] };
      next();
    };

    const app = express();
    app.use(express.json());
    app.use("/v1/admin/catalog", createAiMerchandisingRouter(controller, authMiddleware as any));

    const genRes = await request(app)
      .post("/v1/admin/catalog/ai-merchandising/campaigns/generate-proposal")
      .send({ prompt: "Giảm 20% Trung Thu" });
    expect(genRes.status).toBe(200);
    expect(genRes.body.id).toBe("camp-1");

    const activateRes = await request(app)
      .post("/v1/admin/catalog/ai-merchandising/campaigns/camp-1/activate")
      .send({});
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.success).toBe(true);

    const revertRes = await request(app)
      .post("/v1/admin/catalog/ai-merchandising/campaigns/camp-1/revert")
      .send({});
    expect(revertRes.status).toBe(200);
    expect(revertRes.body.success).toBe(true);

    const activeRes = await request(app)
      .get("/v1/admin/catalog/ai-merchandising/campaigns/active");
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.id).toBe("camp-1");
  });
});
