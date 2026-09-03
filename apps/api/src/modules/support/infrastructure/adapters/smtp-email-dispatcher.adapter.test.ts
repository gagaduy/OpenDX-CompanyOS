// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { SmtpEmailDispatcherAdapter } from "./smtp-email-dispatcher.adapter";
import { SimulatedEmailDispatcherAdapter } from "./simulated-email-dispatcher.adapter";

describe("EmailDispatcherAdapters", () => {
  it("SimulatedEmailDispatcherAdapter records dispatched emails in-memory", async () => {
    const adapter = new SimulatedEmailDispatcherAdapter();
    const result = await adapter.sendSupportResolutionEmail({
      to: "customer@example.com",
      toName: "Customer A",
      subject: "Test Subject",
      textBody: "Hello",
      htmlBody: "<p>Hello</p>",
      ticketId: "tick-1",
      voucherCode: "CSKH10-1234",
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe("simulated");
    expect(adapter.getSentEmails()).toHaveLength(1);
    expect(adapter.getSentEmails()[0].to).toBe("customer@example.com");
  });

  it("SmtpEmailDispatcherAdapter sends mail via transport and returns messageId", async () => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: "<msg-999@test>" });
    const mockTransport = { sendMail: mockSendMail } as any;

    const adapter = new SmtpEmailDispatcherAdapter({
      transport: mockTransport,
      fromAddress: "NovaCommerce <support@example.com>",
    });

    const result = await adapter.sendSupportResolutionEmail({
      to: "client@example.com",
      toName: "Client B",
      subject: "Resolution",
      textBody: "Resolved",
      htmlBody: "<p>Resolved</p>",
      ticketId: "tick-2",
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe("smtp");
    expect(result.messageId).toBe("<msg-999@test>");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        from: "NovaCommerce <support@example.com>",
        subject: "Resolution",
      }),
    );
  });
});
