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
});
