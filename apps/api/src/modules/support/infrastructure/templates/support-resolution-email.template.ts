// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface SupportResolutionEmailTemplateInput {
  readonly customerName: string;
  readonly ticketId: string;
  readonly subject: string;
  readonly responseMessage: string;
  readonly voucherCode?: string;
  readonly voucherDiscountText?: string;
  readonly actionSteps?: readonly string[];
  readonly storefrontUrl?: string;
  readonly supportHotline?: string;
  readonly supportEmail?: string;
  readonly brandName?: string;
}

export function renderSupportResolutionEmailHtml(input: SupportResolutionEmailTemplateInput): string {
  const brand = input.brandName || process.env.APP_NAME || "NovaCommerce";
  const hotline = input.supportHotline || process.env.SUPPORT_HOTLINE || "1900 6868";
  const email = input.supportEmail || process.env.SUPPORT_EMAIL || "support@novacommerce.vn";
  const shopUrl = input.storefrontUrl || process.env.STOREFRONT_URL || "http://localhost:3100";
  const shortTicketId = input.ticketId.length > 8 ? input.ticketId.slice(0, 8) : input.ticketId;

  const voucherDiscountLabel = input.voucherDiscountText
    ? `<div style="font-size: 14px; font-weight: 600; color: #166534; margin-top: 6px;">${input.voucherDiscountText}</div>`
    : "";

  const voucherBlock = input.voucherCode
    ? `
      <div style="margin: 28px 0; padding: 24px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px dashed #16a34a; border-radius: 10px; text-align: center;">
        <div style="font-size: 12px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
          🎁 Ưu Đãi Đền Bù & Tri Ân Dành Riêng Cho Quý Khách
        </div>
        <div style="display: inline-block; padding: 10px 24px; background: #ffffff; border: 2px solid #16a34a; border-radius: 8px; font-size: 22px; font-family: 'Courier New', Courier, monospace; font-weight: 800; color: #15803d; letter-spacing: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          ${input.voucherCode}
        </div>
        ${voucherDiscountLabel}
        <div style="font-size: 12px; color: #4b5563; margin-top: 10px; line-height: 1.5;">
          *Quý khách vui lòng nhập mã này tại bước thanh toán trên hệ thống ${brand} để được áp dụng ngay.
        </div>
      </div>
    `
    : "";

  const actionStepsBlock = input.actionSteps && input.actionSteps.length > 0
    ? `
      <div style="margin: 24px 0 20px 0; padding: 18px 22px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
          📋 Kế hoạch & Các bước tiếp theo:
        </div>
        <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.7; color: #334155;">
          ${input.actionSteps.map((step) => `<li style="margin-bottom: 6px;">${step}</li>`).join("")}
        </ol>
      </div>
    `
    : "";

  const ctaBlock = `
    <div style="margin: 28px 0 20px 0; text-align: center;">
      <a href="${shopUrl}" style="display: inline-block; padding: 12px 28px; background: #0284c7; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.2);">
        Truy Cập Cửa Hàng & Theo Dõi Tiến Độ
      </a>
    </div>
  `;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${input.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #38bdf8;">${brand}</span>
                    <span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">| Trung Tâm CSKH 5 Sao</span>
                  </td>
                  <td align="right">
                    <span style="font-size: 12px; color: #94a3b8; font-family: monospace; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px;">#${shortTicketId}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #0f172a; font-weight: 700;">
                Kính chào Quý khách ${input.customerName},
              </h2>
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Đội ngũ Chăm sóc Khách hàng ${brand} xin chân thành cảm ơn Quý khách đã liên hệ về vấn đề: <strong>"${input.subject}"</strong>.
              </p>
              
              <div style="margin: 20px 0; padding: 20px 24px; background: #f8fafc; border-left: 4px solid #0284c7; border-radius: 4px; font-size: 14px; line-height: 1.7; color: #1e293b; white-space: pre-wrap;">
${input.responseMessage}
              </div>

              ${actionStepsBlock}

              ${voucherBlock}

              ${ctaBlock}

              <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.6; color: #64748b;">
                💡 <em>Quý khách có thể bấm <strong>Trả lời (Reply)</strong> trực tiếp vào email này nếu cần giải đáp thêm bất kỳ thông tin nào, chuyên viên phụ trách sẽ hỗ trợ ngay lập tức.</em>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; line-height: 1.6;">
              <div style="font-weight: 600; color: #334155;">${brand} Co., Ltd. • Trao trọn niềm tin, trọn vẹn trải nghiệm</div>
              <div style="margin-top: 4px;">Email: <a href="mailto:${email}" style="color: #0284c7; text-decoration: none;">${email}</a> | Hotline: <strong style="color: #0f172a;">${hotline}</strong> (24/7)</div>
              <div style="margin-top: 4px; color: #94a3b8; font-size: 11px;">Mã định danh yêu cầu: #${input.ticketId}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
