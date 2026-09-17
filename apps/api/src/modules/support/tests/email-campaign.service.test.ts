// apps/api/src/modules/support/tests/email-campaign.service.test.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { EmailCampaignService } from "../application/services/implementations/email-campaign.service";
import { CustomerSegmentationService } from "../application/services/implementations/customer-segmentation.service";
import { SupportEmailComposer } from "../application/services/implementations/support-email-composer";
import { PostgresEmailCampaignProposalRepository } from "../infrastructure/repositories/implementations/postgres-email-campaign-proposal.repository";
import type { CatalogQueryPort } from "../application/ports/catalog-query.port";
import type { PromotionQueryPort } from "../application/ports/promotion-query.port";
import type { CustomerSegmentQueryPort } from "../application/ports/customer-segment-query.port";
import type { EmailDispatcherPort } from "../application/ports/email-dispatcher.port";

describe("EmailCampaignService", () => {
  const mockCatalogQuery: CatalogQueryPort = {
    getLatestProducts: vi.fn().mockResolvedValue([
      {
        productId: "prod-1",
        name: "Bàn phím cơ Không dây Nova Mech Pro",
        sku: "PROD-KB-001",
        regularPriceVnd: 1500000,
        imageUrl: "https://minio.novacommerce.vn/products/mech-kb.jpg",
        categoryName: "Phụ kiện",
        storefrontUrl: "https://novacommerce.vn/products/prod-1",
      },
    ]),
    getProductsByIds: vi.fn().mockResolvedValue([
      {
        productId: "prod-1",
        name: "Bàn phím cơ Không dây Nova Mech Pro",
        sku: "PROD-KB-001",
        regularPriceVnd: 1500000,
        imageUrl: "https://minio.novacommerce.vn/products/mech-kb.jpg",
        categoryName: "Phụ kiện",
        storefrontUrl: "https://novacommerce.vn/products/prod-1",
      },
    ]),
  };

  const mockPromotionQuery: PromotionQueryPort = {
    getActiveAndUpcomingCampaigns: vi.fn().mockResolvedValue([
      {
        campaignId: "promo-1",
        campaignName: "Flash Sale Giữa Tháng",
        voucherCode: "MIDMONTH20",
        discountPercent: 20,
        startTime: "2026-09-15T00:00:00Z",
        endTime: "2026-09-20T23:59:59Z",
        description: "Giảm 20% toàn bộ phụ kiện",
      },
    ]),
    getCampaignById: vi.fn().mockResolvedValue(null),
  };

  const mockCustomerSegmentQuery: CustomerSegmentQueryPort = {
    getCustomersBySegment: vi.fn().mockImplementation(async (segment) => {
      if (segment === "vip_customers") {
        return [
          {
            customerId: "cust-1",
            fullName: "Nguyễn Văn A",
            email: "nguyenvana@gmail.com",
            totalSpentVnd: 12000000,
            orderCount: 5,
            isSelected: true,
          },
        ];
      }
      if (segment === "recent_buyers") {
        return [
          {
            customerId: "cust-2",
            fullName: "Trần Thị B",
            email: "tranthib@gmail.com",
            totalSpentVnd: 4500000,
            orderCount: 2,
            isSelected: true,
          },
        ];
      }
      return [
        {
          customerId: "cust-1",
          fullName: "Nguyễn Văn A",
          email: "nguyenvana@gmail.com",
          totalSpentVnd: 12000000,
          orderCount: 5,
          isSelected: true,
        },
        {
          customerId: "cust-2",
          fullName: "Trần Thị B",
          email: "tranthib@gmail.com",
          totalSpentVnd: 4500000,
          orderCount: 2,
          isSelected: true,
        },
      ];
    }),
    getCustomerCountBySegment: vi.fn().mockResolvedValue(2),
  };

  const mockEmailDispatcher: EmailDispatcherPort = {
    sendSupportResolutionEmail: vi.fn().mockResolvedValue({
      messageId: "msg-123",
      delivered: true,
      provider: "simulated",
      timestamp: "2026-09-15T23:00:00Z",
    }),
    sendCampaignEmail: vi.fn().mockResolvedValue({
      messageId: "msg-camp-123",
      delivered: true,
      provider: "simulated",
      timestamp: "2026-09-15T23:00:00Z",
    }),
  };

  function createService() {
    const segmentation = new CustomerSegmentationService(mockCustomerSegmentQuery);
    const composer = new SupportEmailComposer();
    const repo = new PostgresEmailCampaignProposalRepository(); // In-memory
    let idCounter = 1;

    return new EmailCampaignService(
      mockCatalogQuery,
      mockPromotionQuery,
      segmentation,
      composer,
      repo,
      mockEmailDispatcher,
      () => `proposal-test-${idCounter++}`,
      () => "2026-09-15T23:00:00.000Z",
    );
  }

  it("creates a new product announcement proposal successfully", async () => {
    const service = createService();
    const proposal = await service.createProposal({
      type: "new_product_announcement",
      targetSegment: "recent_buyers",
    });

    expect(proposal.id).toBe("proposal-test-1");
    expect(proposal.type).toBe("new_product_announcement");
    expect(proposal.status).toBe("pending_approval");
    expect(proposal.featuredProducts).toHaveLength(1);
    expect(proposal.featuredProducts[0].name).toContain("Nova Mech Pro");
    expect(proposal.recipients).toHaveLength(1);
    expect(proposal.recipients[0].email).toBe("tranthib@gmail.com");
    expect(proposal.htmlContent).toContain("NovaCommerce");
    expect(proposal.docxFilename).toBe("ke_hoach_email_proposal.docx");
  });

  it("creates a promotion announcement proposal successfully", async () => {
    vi.mocked(mockPromotionQuery.getActiveAndUpcomingCampaigns).mockResolvedValueOnce([
      {
        campaignId: "promo-1",
        campaignName: "Flash Sale Giữa Tháng",
        voucherCode: "MIDMONTH20",
        discountPercent: 20,
        startTime: "2026-09-15T00:00:00Z",
        endTime: "2026-09-20T23:59:59Z",
        description: "Giảm 20% toàn bộ phụ kiện",
        productIds: ["prod-1"],
      } as any,
    ]);
    const service = createService();
    const proposal = await service.createProposal({
      type: "promotion_announcement",
      targetSegment: "vip_customers",
    });

    expect(proposal.type).toBe("promotion_announcement");
    expect(proposal.promotionDetails?.voucherCode).toBe("MIDMONTH20");
    expect(proposal.promotionDetails?.discountPercent).toBe(20);
    expect(proposal.recipients[0].email).toBe("nguyenvana@gmail.com");
    expect(mockCatalogQuery.getProductsByIds).toHaveBeenCalledWith(["prod-1"]);
  });

  it("refuses to invent a promotion email when no active campaign exists", async () => {
    vi.mocked(mockPromotionQuery.getActiveAndUpcomingCampaigns).mockResolvedValueOnce([]);
    const service = createService();

    await expect(
      service.createProposal({
        type: "promotion_announcement",
        targetSegment: "all_active_customers",
      }),
    ).rejects.toMatchObject({ errorCode: "NO_ACTIVE_PROMOTION" });
  });

  it("refuses a promotion email when the active campaign has no assigned products", async () => {
    vi.mocked(mockPromotionQuery.getActiveAndUpcomingCampaigns).mockResolvedValueOnce([
      {
        campaignId: "promo-without-products",
        campaignName: "Flash Sale chưa cấu hình sản phẩm",
        discountPercent: 20,
        productIds: [],
      },
    ]);
    const service = createService();

    await expect(
      service.createProposal({
        type: "promotion_announcement",
        targetSegment: "all_active_customers",
      }),
    ).rejects.toMatchObject({ errorCode: "PROMOTION_HAS_NO_PRODUCTS" });
  });

  it("applies and dispatches a proposal to selected recipients", async () => {
    const service = createService();
    const proposal = await service.createProposal({
      type: "new_product_announcement",
      targetSegment: "recent_buyers",
    });

    const result = await service.applyProposal(proposal.id, "staff-admin-01");
    expect(result.status).toBe("sent");
    expect(result.totalDispatched).toBe(1);
    expect(result.successfulDispatches).toBe(1);
    expect(mockEmailDispatcher.sendCampaignEmail).toHaveBeenCalled();

    const updated = await service.getProposal(proposal.id);
    expect(updated.status).toBe("sent");
    expect(updated.sentAt).toBeDefined();
    expect(updated.executionSummary?.successfulDispatches).toBe(1);
  });

  it("cancels a pending proposal", async () => {
    const service = createService();
    const proposal = await service.createProposal({
      type: "customer_care_vip",
      targetSegment: "vip_customers",
    });

    const canceled = await service.cancelProposal(proposal.id, "staff-admin-01");
    expect(canceled.status).toBe("rejected");

    const fetched = await service.getProposal(proposal.id);
    expect(fetched.status).toBe("rejected");
  });

  it("generates a Word deliverable for the campaign proposal", async () => {
    const service = createService();
    const proposal = await service.createProposal({
      type: "new_product_announcement",
      targetSegment: "recent_buyers",
    });

    const deliverable = await service.getDocxDeliverable(proposal.id);
    expect(deliverable.buffer).toBeInstanceOf(Buffer);
    expect(deliverable.buffer.length).toBeGreaterThan(0);
    expect(deliverable.filename).toContain(".docx");
    expect(deliverable.mediaType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});
