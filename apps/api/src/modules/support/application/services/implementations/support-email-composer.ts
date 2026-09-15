// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CampaignPromotionDetails,
  FeaturedProductItem,
} from "../../../domain/entities/email-campaign.entity";

export interface RenderNewProductAnnouncementInput {
  readonly recipientName: string;
  readonly emailSubject: string;
  readonly products: readonly FeaturedProductItem[];
  readonly storefrontUrl?: string;
  readonly brandName?: string;
}

export interface RenderPromotionAnnouncementInput {
  readonly recipientName: string;
  readonly emailSubject: string;
  readonly promotion: CampaignPromotionDetails;
  readonly products?: readonly FeaturedProductItem[];
  readonly storefrontUrl?: string;
  readonly brandName?: string;
}

export class SupportEmailComposer {
  renderNewProductAnnouncement(input: RenderNewProductAnnouncementInput): string {
    const brand = input.brandName || process.env.APP_NAME || "NovaCommerce";
    const shopUrl = input.storefrontUrl || process.env.STOREFRONT_URL || "http://localhost:3100";

    const productCardsHtml = input.products
      .map((p) => {
        const fullProductUrl = p.storefrontUrl.startsWith("http")
          ? p.storefrontUrl
          : `${shopUrl}${p.storefrontUrl.startsWith("/") ? "" : "/"}${p.storefrontUrl}`;
        const salePrice = p.salePriceVnd
          ? `<span style="font-size: 16px; font-weight: 700; color: #dc2626; margin-right: 8px;">${p.salePriceVnd.toLocaleString("vi-VN")} đ</span><span style="font-size: 13px; color: #94a3b8; text-decoration: line-through;">${p.regularPriceVnd.toLocaleString("vi-VN")} đ</span>`
          : `<span style="font-size: 16px; font-weight: 700; color: #0f172a;">${p.regularPriceVnd.toLocaleString("vi-VN")} đ</span>`;

        return `
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="text-align: center; background: #f8fafc; padding: 12px;">
              <img src="${p.imageUrl}" alt="${p.name}" style="max-width: 100%; height: 200px; object-fit: cover; border-radius: 6px;" />
            </div>
            <div style="padding: 16px;">
              <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">${p.categoryName || "Sản phẩm"} • ${p.sku}</div>
              <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.4;">${p.name}</h3>
              <div style="margin-bottom: 14px;">${salePrice}</div>
              <a href="${fullProductUrl}" style="display: block; text-align: center; background: #5e6ad2; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 600; font-size: 13px;">
                Xem chi tiết & Mua ngay →
              </a>
            </div>
          </div>
        `;
      })
      .join("\n");

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${input.emailSubject}</title>
      </head>
      <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #334155;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <!-- Header -->
          <div style="background: #010102; padding: 24px; text-align: center;">
            <div style="color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: 0.05em;">${brand}</div>
            <div style="color: #94a3b8; font-size: 12px; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.1em;">Bộ Sưu Tập Mới • New Arrivals</div>
          </div>
          <!-- Body -->
          <div style="padding: 24px;">
            <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
              Xin chào <strong>${input.recipientName}</strong>,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              ${brand} trân trọng giới thiệu đến bạn những sản phẩm vừa mới cập bến với chất lượng vượt trội và thiết kế ấn tượng:
            </p>

            <div style="margin: 24px 0;">
              ${productCardsHtml}
            </div>

            <div style="background: #eff6ff; border: 1px dashed #3b82f6; border-radius: 8px; padding: 16px; text-align: center; margin-top: 24px;">
              <div style="font-size: 14px; font-weight: 600; color: #1e40af;">Giao hàng siêu tốc & Bảo hành chính hãng 100%</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Khám phá toàn bộ danh mục sản phẩm tại cửa hàng trực tuyến của chúng tôi.</div>
            </div>
          </div>
          <!-- Footer -->
          <div style="background: #f8fafc; padding: 18px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
            <div>© 2026 ${brand}. Tất cả các quyền được bảo lưu.</div>
            <div style="margin-top: 6px;">Email này được gửi tự động từ Trung tâm CSKH & Trải nghiệm khách hàng ${brand}.</div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  renderPromotionAnnouncement(input: RenderPromotionAnnouncementInput): string {
    const brand = input.brandName || process.env.APP_NAME || "NovaCommerce";
    const shopUrl = input.storefrontUrl || process.env.STOREFRONT_URL || "http://localhost:3100";
    const promo = input.promotion;

    const discountBadge = promo.discountPercent
      ? `<div style="display: inline-block; background: #dc2626; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; margin-bottom: 10px;">Giảm ${promo.discountPercent}%</div>`
      : "";

    const voucherBlock = promo.voucherCode
      ? `
        <div style="margin: 20px 0; padding: 20px; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px dashed #ef4444; border-radius: 10px; text-align: center;">
          <div style="font-size: 12px; font-weight: 700; color: #b91c1c; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
            Mã Ưu Đãi Dành Riêng Cho Bạn:
          </div>
          <div style="display: inline-block; padding: 8px 20px; background: #ffffff; border: 2px solid #ef4444; border-radius: 8px; font-size: 20px; font-family: monospace; font-weight: 800; color: #b91c1c; letter-spacing: 2px;">
            ${promo.voucherCode}
          </div>
          <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
            *Nhập mã tại bước thanh toán trên hệ thống ${brand} để áp dụng ngay.
          </div>
        </div>
      `
      : "";

    const productsHtml = (input.products || [])
      .map((p) => {
        const fullProductUrl = p.storefrontUrl.startsWith("http")
          ? p.storefrontUrl
          : `${shopUrl}${p.storefrontUrl.startsWith("/") ? "" : "/"}${p.storefrontUrl}`;
        const salePrice = p.salePriceVnd
          ? `<span style="font-weight: 700; color: #dc2626;">${p.salePriceVnd.toLocaleString("vi-VN")} đ</span> <span style="font-size: 12px; color: #94a3b8; text-decoration: line-through;">${p.regularPriceVnd.toLocaleString("vi-VN")} đ</span>`
          : `<span style="font-weight: 700; color: #0f172a;">${p.regularPriceVnd.toLocaleString("vi-VN")} đ</span>`;

        return `
          <div style="display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px;">
            <img src="${p.imageUrl}" alt="${p.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;" />
            <div style="flex: 1;">
              <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${p.name}</div>
              <div style="font-size: 13px; margin-top: 2px;">${salePrice}</div>
            </div>
            <a href="${fullProductUrl}" style="background: #5e6ad2; color: #ffffff; text-decoration: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 600;">Xem</a>
          </div>
        `;
      })
      .join("\n");

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${input.emailSubject}</title>
      </head>
      <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #334155;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 26px 24px; text-align: center;">
            ${discountBadge}
            <div style="color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: 0.05em;">${promo.campaignName}</div>
            <div style="color: #c7d2fe; font-size: 13px; margin-top: 6px;">${promo.description || "Ưu đãi có hạn dành riêng cho khách hàng thân thiết"}</div>
          </div>
          <!-- Body -->
          <div style="padding: 24px;">
            <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
              Thân gửi <strong>${input.recipientName}</strong>,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              Chúng tôi vui mừng thông báo chương trình khuyến mãi đặc quyền sắp/đang diễn ra tại ${brand}:
            </p>

            ${voucherBlock}

            ${productsHtml ? `<div style="margin-top: 20px;"><div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 10px;">Sản phẩm nổi bật áp dụng ưu đãi:</div>${productsHtml}</div>` : ""}

            <div style="text-align: center; margin-top: 28px;">
              <a href="${shopUrl}" style="display: inline-block; background: #5e6ad2; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 700; font-size: 14px; box-shadow: 0 2px 4px rgba(94,106,210,0.3);">
                Mua sắm ngay trên Storefront →
              </a>
            </div>
          </div>
          <!-- Footer -->
          <div style="background: #f8fafc; padding: 18px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
            <div>© 2026 ${brand}. Tất cả các quyền được bảo lưu.</div>
            <div style="margin-top: 6px;">Email thông báo từ Bộ phận CSKH & Quan hệ Khách hàng ${brand}.</div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  composeEmail(options: {
    type: import("../../../domain/entities/email-campaign.entity").EmailCampaignType;
    recipientName: string;
    emailSubject: string;
    featuredProducts: readonly import("../../../domain/entities/email-campaign.entity").FeaturedProductItem[];
    promotionDetails?: import("../../../domain/entities/email-campaign.entity").CampaignPromotionDetails;
    storefrontUrl?: string;
    brandName?: string;
  }): string {
    if (options.type === "promotion_announcement" && options.promotionDetails) {
      return this.renderPromotionAnnouncement({
        recipientName: options.recipientName,
        emailSubject: options.emailSubject,
        promotion: options.promotionDetails,
        products: options.featuredProducts,
        storefrontUrl: options.storefrontUrl,
        brandName: options.brandName,
      });
    }

    return this.renderNewProductAnnouncement({
      recipientName: options.recipientName,
      emailSubject: options.emailSubject,
      products: options.featuredProducts,
      storefrontUrl: options.storefrontUrl,
      brandName: options.brandName,
    });
  }
}
