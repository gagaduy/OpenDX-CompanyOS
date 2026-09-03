// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface SupportResolutionEmailTemplateInput {
  readonly customerName: string;
  readonly ticketId: string;
  readonly subject: string;
  readonly responseMessage: string;
  readonly voucherCode?: string;
}

export function renderSupportResolutionEmailHtml(input: SupportResolutionEmailTemplateInput): string {
  const voucherBlock = input.voucherCode
    ? `
      <div style="margin: 24px 0; padding: 20px; background: #f0fdf4; border: 1px dashed #16a34a; border-radius: 8px; text-align: center;">
        <div style="font-size: 13px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
          🎁 Mã Voucher Đền Bù Dành Riêng Cho Quý Khách
        </div>
        <div style="display: inline-block; padding: 8px 16px; background: #ffffff; border: 2px solid #16a34a; border-radius: 6px; font-size: 20px; font-family: monospace; font-weight: 800; color: #16a34a; letter-spacing: 2px;">
          ${input.voucherCode}
        </div>
        <div style="font-size: 12px; color: #4b5563; margin-top: 8px;">
          *Áp dụng trực tiếp tại bước thanh toán cho đơn hàng kế tiếp trên hệ thống NovaCommerce.
        </div>
      </div>
    `
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${input.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #38bdf8;">NovaCommerce</span>
                    <span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">| Trung Tâm CSKH 5 Sao</span>
                  </td>
                  <td align="right">
                    <span style="font-size: 12px; color: #94a3b8; font-family: monospace;">#${input.ticketId.slice(0, 8)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #0f172a;">
                Kính chào quý khách ${input.customerName},
              </h2>
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Đội ngũ Chăm sóc Khách hàng NovaCommerce xin chân thành cảm ơn quý khách đã gửi phản hồi về vấn đề: <strong>"${input.subject}"</strong>.
              </p>
              
              <div style="margin: 20px 0; padding: 16px 20px; background: #f1f5f9; border-left: 4px solid #0284c7; border-radius: 4px; font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">
${input.responseMessage}
              </div>

              ${voucherBlock}

              <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
                Nếu quý khách cần thêm sự trợ giúp hoặc có câu hỏi nào khác, xin vui lòng phản hồi trực tiếp qua email này hoặc liên hệ Hotline hỗ trợ 24/7 của chúng tôi.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
              <div>NovaCommerce Co., Ltd. • Trao trọn niềm tin, trọn vẹn trải nghiệm</div>
              <div style="margin-top: 4px;">Email: support@novacommerce.vn | Hotline: 1900 6868</div>
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
