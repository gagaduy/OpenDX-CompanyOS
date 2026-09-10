// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { extractCleanReplyText, extractTicketReference } from "./imap-email-receiver.adapter";
import { SimulatedEmailReceiverAdapter } from "./simulated-email-receiver.adapter";

describe("extractCleanReplyText", () => {
  it("extracts customer reply and strips quote headers in Vietnamese and English", () => {
    const rawVietnamese = `Tôi không cần tôi cần đền bù cái mới

Vào Thứ 5, 3 thg 9, 2026 lúc 18:43 Phuong Nguyen <nguyenphuongdmx2450@gmail.com> đã viết:
> Kính chào quý khách Phương Nguyễn...
> Đội ngũ Chăm sóc Khách hàng NovaCommerce...`;

    const cleaned = extractCleanReplyText(rawVietnamese);
    expect(cleaned).toBe("Tôi không cần tôi cần đền bù cái mới");
  });

  it("strips lines starting with > even without header", () => {
    const raw = `Please replace the device immediately.
> Previous message snippet
> Another quote line`;

    const cleaned = extractCleanReplyText(raw);
    expect(cleaned).toBe("Please replace the device immediately.");
  });
});

describe("extractTicketReference", () => {
  it("extracts ticket UUID or prefix accurately", () => {
    expect(extractTicketReference("Re: [NovaCommerce] Phản hồi yêu cầu #62ffbc9e")).toBe("62ffbc9e");
    expect(extractTicketReference("Ticket a35adc47-eae5-4239-b2ea-046f53ac9a20 updated")).toBe("a35adc47-eae5-4239-b2ea-046f53ac9a20");
    expect(extractTicketReference("Hello shop without any id")).toBeNull();
  });
});

describe("SimulatedEmailReceiverAdapter", () => {
  it("enqueues and fetches unread emails, and marks them as read", async () => {
    const adapter = new SimulatedEmailReceiverAdapter();
    adapter.enqueue({
      messageUid: "msg-101",
      fromEmail: "customer@example.com",
      fromName: "Customer Name",
      subject: "Re: #62ffbc9e",
      bodyText: "Tôi muốn đổi mới",
      ticketId: "62ffbc9e",
      receivedAt: new Date(),
    });

    const unread = await adapter.fetchUnreadReplies();
    expect(unread).toHaveLength(1);
    expect(unread[0].bodyText).toBe("Tôi muốn đổi mới");

    await adapter.markAsRead("msg-101");
    const afterRead = await adapter.fetchUnreadReplies();
    expect(afterRead).toHaveLength(0);
  });
});
