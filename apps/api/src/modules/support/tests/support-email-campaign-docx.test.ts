// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { generateSupportEmailCampaignDocx } from "../infrastructure/generators/support-email-campaign-docx.generator";
import type { SupportEmailCampaignProposal } from "../domain/entities/email-campaign.entity";

describe("SupportEmailCampaignDocxGenerator", () => {
  const mockProposal: SupportEmailCampaignProposal = {
    id: "prop-docx-1",
    type: "new_product_announcement",
    title: "Kế hoạch Email: Ra mắt sản phẩm công nghệ mới",
    emailSubject: "[NovaCommerce] Bộ sưu tập mới nhất",
    targetSegment: "vip_customers",
    recipients: [
      {
        customerId: "c1",
        email: "vip@example.com",
        fullName: "Lê VIP",
        totalSpentVnd: 20000000,
        orderCount: 10,
        isSelected: true,
      },
    ],
    totalRecipients: 1,
    selectedCount: 1,
    featuredProducts: [
      {
        productId: "p1",
        name: "Chuột Gaming Không Dây",
        sku: "TECH-MOUSE-01",
        regularPriceVnd: 850000,
        salePriceVnd: 690000,
        imageUrl: "http://localhost:9000/catalog-media/mouse.jpg",
        categoryName: "Chuột & Bàn phím",
        storefrontUrl: "/products/chuot-gaming-01",
      },
    ],
    htmlContent: "<html><body>Chào bạn Lê VIP</body></html>",
    docxFilename: "bao_cao_ke_hoach_email_prop-docx-1.docx",
    status: "pending_approval",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("generates a valid Word docx file buffer", () => {
    const result = generateSupportEmailCampaignDocx(mockProposal);
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(500);
    expect(result.filename).toBe("bao_cao_ke_hoach_email_prop-docx-1.docx");
    expect(result.mediaType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});
