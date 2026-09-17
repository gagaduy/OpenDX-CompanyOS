// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type SupportCampaignType =
  | "new_product_announcement"
  | "promotion_announcement"
  | "customer_care_vip";

export type SupportCustomerSegment =
  | "all_active_customers"
  | "vip_customers"
  | "recent_buyers";

export type SupportTaskIntent =
  | { readonly kind: "ticket_resolution" }
  | {
      readonly kind: "email_campaign";
      readonly campaignType: SupportCampaignType;
      readonly targetSegment: SupportCustomerSegment;
    };

export function analyzeSupportTaskIntent(prompt: string): SupportTaskIntent {
  const normalized = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  const describesCustomerIssue =
    /phản hồi|khiếu nại|thắc mắc|sản phẩm lỗi|hàng lỗi|đổi trả|bảo hành|ticket|yêu cầu hỗ trợ|cần xử lý/.test(
      normalized,
    );
  const requestsIssueResponse = /phản hồi|trả lời|reply|giải quyết|xử lý/.test(normalized);

  if (describesCustomerIssue && requestsIssueResponse) {
    return { kind: "ticket_resolution" };
  }

  const requestsEmail = /\bmail\b|email|thư điện tử/.test(normalized);
  const requestsCampaignWork = /lên ý tưởng|soạn|gửi|thông báo|quảng bá|chiến dịch/.test(normalized);
  const hasPromotionContext = /khuyến mãi|ưu đãi|flash sale|giảm giá|voucher/.test(normalized);
  const hasNewProductContext = /sản phẩm mới|bộ sưu tập|hàng mới/.test(normalized);
  const hasBroadcastAudience = /toàn bộ khách|tất cả khách|mọi khách|khách hàng vip|khách thân thiết/.test(
    normalized,
  );

  if (
    requestsEmail &&
    requestsCampaignWork &&
    (hasPromotionContext || hasNewProductContext || hasBroadcastAudience)
  ) {
    const campaignType: SupportCampaignType = hasNewProductContext
      ? "new_product_announcement"
      : hasPromotionContext
        ? "promotion_announcement"
        : "customer_care_vip";

    const targetSegment: SupportCustomerSegment = /gần đây|mới mua|vừa mua/.test(normalized)
      ? "recent_buyers"
      : /vip|thân thiết|chi tiêu cao/.test(normalized)
        ? "vip_customers"
        : "all_active_customers";

    return { kind: "email_campaign", campaignType, targetSegment };
  }

  return { kind: "ticket_resolution" };
}
