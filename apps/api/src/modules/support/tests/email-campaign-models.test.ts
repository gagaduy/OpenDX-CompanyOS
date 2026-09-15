// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  type SupportEmailCampaignProposal,
  validateEmailCampaignProposal,
} from "../domain/entities/email-campaign.entity";

describe("Email Campaign Domain Models & Validation", () => {
  const validProposal: SupportEmailCampaignProposal = {
    id: "prop-email-1",
    type: "new_product_announcement",
    title: "Kế hoạch Email: Ra mắt 3 sản phẩm mới",
    emailSubject: "[NovaCommerce] Khám phá bộ sưu tập sản phẩm mới",
    targetSegment: "all_active_customers",
    recipients: [
      {
        customerId: "cust-1",
        email: "khach1@example.com",
        fullName: "Nguyễn Văn A",
        totalSpentVnd: 5000000,
        orderCount: 3,
        isSelected: true,
      },
    ],
    totalRecipients: 1,
    selectedCount: 1,
    featuredProducts: [
      {
        productId: "prod-1",
        name: "Tai nghe Bluetooth Pro",
        sku: "TECH-HEAD-01",
        regularPriceVnd: 1200000,
        salePriceVnd: 990000,
        imageUrl: "http://localhost:9000/products/tech-head.jpg",
        categoryName: "Công nghệ",
        storefrontUrl: "/products/tech-head-01",
      },
    ],
    htmlContent: "<html><body>Chào bạn Nguyễn Văn A</body></html>",
    docxFilename: "bao_cao_ke_hoach_email_prop-email-1.docx",
    status: "pending_approval",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("accepts a valid support email campaign proposal", () => {
    expect(() => validateEmailCampaignProposal(validProposal)).not.toThrow();
  });

  it("throws an error if recipients list is empty", () => {
    const invalid = {
      ...validProposal,
      recipients: [],
      totalRecipients: 0,
      selectedCount: 0,
    };
    expect(() => validateEmailCampaignProposal(invalid)).toThrow(
      "Chiến dịch email phải có ít nhất 1 người nhận.",
    );
  });

  it("throws an error if emailSubject or htmlContent is missing", () => {
    const invalidSubject = { ...validProposal, emailSubject: "" };
    expect(() => validateEmailCampaignProposal(invalidSubject)).toThrow(
      "Tiêu đề email không được để trống.",
    );

    const invalidHtml = { ...validProposal, htmlContent: "" };
    expect(() => validateEmailCampaignProposal(invalidHtml)).toThrow(
      "Nội dung email HTML không được để trống.",
    );
  });

  it("throws an error if new_product_announcement has no featured products", () => {
    const invalid = { ...validProposal, featuredProducts: [] };
    expect(() => validateEmailCampaignProposal(invalid)).toThrow(
      "Chiến dịch quảng bá sản phẩm mới phải có ít nhất 1 sản phẩm nổi bật.",
    );
  });
});
