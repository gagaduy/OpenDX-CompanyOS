// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { renderSupportResolutionEmailHtml } from "./support-resolution-email.template";

describe("renderSupportResolutionEmailHtml", () => {
  it("renders customer name, ticket subject, proposed response, and voucher code", () => {
    const html = renderSupportResolutionEmailHtml({
      customerName: "Nguyễn Văn A",
      ticketId: "tick-12345678",
      subject: "Giao hàng trễ",
      responseMessage: "Chúng tôi xin lỗi vì sự bất tiện này.",
      voucherCode: "CSKH10-ABCD",
    });

    expect(html).toContain("Nguyễn Văn A");
    expect(html).toContain("Giao hàng trễ");
    expect(html).toContain("Chúng tôi xin lỗi vì sự bất tiện này.");
    expect(html).toContain("CSKH10-ABCD");
    expect(html).toContain("NovaCommerce");
  });

  it("renders cleanly when voucher code is not provided", () => {
    const html = renderSupportResolutionEmailHtml({
      customerName: "Trần Thị B",
      ticketId: "tick-45678901",
      subject: "Hỏi thông tin",
      responseMessage: "Thông tin đơn hàng đã được cập nhật.",
    });

    expect(html).toContain("Trần Thị B");
    expect(html).not.toContain("CSKH10-ABCD");
  });

  it("renders action steps and custom contact info dynamically without hardcoded values", () => {
    const html = renderSupportResolutionEmailHtml({
      customerName: "Lê Văn C",
      ticketId: "33333333-4444-5555-6666-777777777777",
      subject: "Bảo hành thiết bị",
      responseMessage: "Kỹ thuật viên đã tiếp nhận thông tin bảo hành của Quý khách.",
      voucherCode: "VIP-25PERCENT",
      voucherDiscountText: "Giảm ngay 25% cho đơn hàng kế tiếp",
      actionSteps: [
        "Đóng gói thiết bị cẩn thận kèm hóa đơn gốc.",
        "Shipper NovaCommerce sẽ qua lấy hàng tận nơi trong 24h.",
      ],
      storefrontUrl: "https://shop.example.com",
      supportHotline: "1800 9999",
      supportEmail: "cskh@example.com",
      brandName: "NovaCommerce Premium",
    });

    expect(html).toContain("Lê Văn C");
    expect(html).toContain("33333333");
    expect(html).toContain("Bảo hành thiết bị");
    expect(html).toContain("VIP-25PERCENT");
    expect(html).toContain("Giảm ngay 25% cho đơn hàng kế tiếp");
    expect(html).toContain("Đóng gói thiết bị cẩn thận kèm hóa đơn gốc.");
    expect(html).toContain("Shipper NovaCommerce sẽ qua lấy hàng tận nơi trong 24h.");
    expect(html).toContain("https://shop.example.com");
    expect(html).toContain("1800 9999");
    expect(html).toContain("cskh@example.com");
    expect(html).toContain("NovaCommerce Premium");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });
});
