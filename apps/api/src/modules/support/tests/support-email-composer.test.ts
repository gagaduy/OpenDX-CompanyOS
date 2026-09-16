// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SupportEmailComposer } from "../application/services/implementations/support-email-composer";
import type {
  CampaignPromotionDetails,
  FeaturedProductItem,
} from "../domain/entities/email-campaign.entity";

describe("SupportEmailComposer", () => {
  const composer = new SupportEmailComposer();

  const mockProducts: FeaturedProductItem[] = [
    {
      productId: "prod-1",
      name: "Bàn Phím Cơ Không Dây RGB",
      sku: "TECH-KB-01",
      regularPriceVnd: 1590000,
      salePriceVnd: 1290000,
      imageUrl: "http://localhost:9000/catalog-media/keyboard.jpg",
      categoryName: "Phụ kiện công nghệ",
      storefrontUrl: "/products/ban-phim-co-rgb",
    },
  ];

  const mockPromo: CampaignPromotionDetails = {
    campaignId: "promo-1",
    campaignName: "Flash Sale Cuối Tuần 20%",
    discountPercent: 20,
    voucherCode: "WEEKEND20",
    description: "Giảm giá đặc biệt 20% cho toàn bộ sản phẩm công nghệ",
  };

  it("renders new product announcement HTML with products and store link", () => {
    const html = composer.renderNewProductAnnouncement({
      recipientName: "Nguyễn Văn A",
      emailSubject: "Bộ sưu tập công nghệ mới",
      products: mockProducts,
      storefrontUrl: "http://localhost:3100",
    });

    expect(html).toContain("Nguyễn Văn A");
    expect(html).toContain("Bàn Phím Cơ Không Dây RGB");
    expect(html).toContain("1.590.000 đ");
    expect(html).toContain("1.290.000 đ");
    expect(html).toContain("http://localhost:9000/catalog-media/keyboard.jpg");
    expect(html).toContain("http://localhost:3100/products/ban-phim-co-rgb");
    expect(html).toContain("Xem chi tiết & Mua ngay");
  });

  it("renders promotion announcement HTML with voucher code and discount percent", () => {
    const html = composer.renderPromotionAnnouncement({
      recipientName: "Trần Thị B",
      emailSubject: "Siêu ưu đãi Flash Sale 20%",
      promotion: mockPromo,
      products: mockProducts,
      storefrontUrl: "http://localhost:3100",
    });

    expect(html).toContain("Trần Thị B");
    expect(html).toContain("Flash Sale Cuối Tuần 20%");
    expect(html).toContain("WEEKEND20");
    expect(html).toContain("Giảm 20%");
    expect(html).toContain("Bàn Phím Cơ Không Dây RGB");
    expect(html).toContain('<table role="presentation"');
    expect(html).toContain('width="60" height="60"');
    expect(html).toContain(">Xem</a>");
  });
});
