// apps/api/src/modules/support/tests/support-email-campaign.api.test.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { SupportController } from "../presentation/controllers/support.controller";
import { createSupportRouter } from "../presentation/routes/support.routes";
import type { EmailCampaignService } from "../application/services/implementations/email-campaign.service";
import type { SupportEmailCampaignProposal } from "../domain/entities/email-campaign.entity";

describe("Support Email Campaign API Endpoints", () => {
  const sampleProposal: SupportEmailCampaignProposal = {
    id: "proposal-camp-001",
    type: "new_product_announcement",
    title: "Thông báo Sản phẩm Mới",
    emailSubject: "Sản phẩm công nghệ mới nhất",
    targetSegment: "recent_buyers",
    recipients: [
      {
        customerId: "cust-1",
        email: "customer1@example.com",
        fullName: "Nguyễn Văn A",
        totalSpentVnd: 5000000,
        orderCount: 3,
        isSelected: true,
      },
    ],
    totalRecipients: 1,
    selectedCount: 1,
    featuredProducts: [],
    htmlContent: "<html><body>NovaCommerce</body></html>",
    docxFilename: "ke_hoach_email_proposal.docx",
    status: "pending_approval",
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };

  function setupApp() {
    const mockEmailCampaignService: Partial<EmailCampaignService> = {
      createProposal: vi.fn().mockResolvedValue(sampleProposal),
      getProposal: vi.fn().mockResolvedValue(sampleProposal),
      listProposals: vi.fn().mockResolvedValue([sampleProposal]),
      applyProposal: vi.fn().mockResolvedValue({
        proposalId: sampleProposal.id,
        status: "sent",
        totalDispatched: 1,
        successfulDispatches: 1,
        failedDispatches: 0,
        dispatchedAt: "2026-09-15T01:00:00.000Z",
      }),
      cancelProposal: vi.fn().mockResolvedValue({
        ...sampleProposal,
        status: "rejected",
      }),
      getDocxDeliverable: vi.fn().mockResolvedValue({
        buffer: Buffer.from("mock-docx-content"),
        filename: sampleProposal.docxFilename,
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    };

    const controller = new SupportController(
      {} as never,
      undefined,
      undefined,
      mockEmailCampaignService as EmailCampaignService,
    );

    const authenticate: RequestHandler = (_request, response, next) => {
      response.locals.staffPrincipal = {
        subject: "staff-admin-01",
        displayName: "Admin Staff",
        roles: ["administrator"],
      };
      next();
    };

    const app = express();
    app.use(express.json());
    app.use(
      "/v1/admin/support/tickets",
      createSupportRouter(controller, authenticate, vi.fn(async () => undefined)),
    );
    app.use(createErrorHandler());

    return { app, mockEmailCampaignService };
  }

  it("POST /email-campaigns/proposals creates a proposal", async () => {
    const { app, mockEmailCampaignService } = setupApp();

    const res = await request(app)
      .post("/v1/admin/support/tickets/email-campaigns/proposals")
      .send({
        type: "new_product_announcement",
        targetSegment: "recent_buyers",
      })
      .expect(201);

    expect(res.body.data.id).toBe("proposal-camp-001");
    expect(mockEmailCampaignService.createProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "new_product_announcement",
        targetSegment: "recent_buyers",
      }),
    );
  });

  it("GET /email-campaigns/proposals lists proposals", async () => {
    const { app, mockEmailCampaignService } = setupApp();

    const res = await request(app)
      .get("/v1/admin/support/tickets/email-campaigns/proposals")
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(mockEmailCampaignService.listProposals).toHaveBeenCalled();
  });

  it("GET /email-campaigns/proposals/:proposalId returns single proposal", async () => {
    const { app, mockEmailCampaignService } = setupApp();

    const res = await request(app)
      .get("/v1/admin/support/tickets/email-campaigns/proposals/proposal-camp-001")
      .expect(200);

    expect(res.body.data.id).toBe("proposal-camp-001");
    expect(mockEmailCampaignService.getProposal).toHaveBeenCalledWith("proposal-camp-001");
  });

  it("POST /email-campaigns/proposals/:proposalId/apply applies proposal", async () => {
    const { app, mockEmailCampaignService } = setupApp();

    const res = await request(app)
      .post("/v1/admin/support/tickets/email-campaigns/proposals/proposal-camp-001/apply")
      .send({ selectedRecipientIds: ["cust-1"] })
      .expect(200);

    expect(res.body.data.status).toBe("sent");
    expect(mockEmailCampaignService.applyProposal).toHaveBeenCalledWith(
      "proposal-camp-001",
      "staff-admin-01",
      ["cust-1"],
    );
  });

  it("POST /email-campaigns/proposals/:proposalId/cancel cancels proposal", async () => {
    const { app, mockEmailCampaignService } = setupApp();

    const res = await request(app)
      .post("/v1/admin/support/tickets/email-campaigns/proposals/proposal-camp-001/cancel")
      .expect(200);

    expect(res.body.data.status).toBe("rejected");
    expect(mockEmailCampaignService.cancelProposal).toHaveBeenCalledWith(
      "proposal-camp-001",
      "staff-admin-01",
    );
  });

  it("GET /email-campaigns/proposals/:proposalId/docx downloads Word deliverable", async () => {
    const { app, mockEmailCampaignService } = setupApp();

    const res = await request(app)
      .get("/v1/admin/support/tickets/email-campaigns/proposals/proposal-camp-001/docx")
      .expect(200);

    expect(res.headers["content-disposition"]).toContain(".docx");
    expect(mockEmailCampaignService.getDocxDeliverable).toHaveBeenCalledWith("proposal-camp-001");
  });
});
