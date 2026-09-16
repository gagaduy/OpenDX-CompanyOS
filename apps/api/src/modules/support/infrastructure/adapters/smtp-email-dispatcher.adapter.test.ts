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

  it("SmtpEmailDispatcherAdapter inlines local images as CID attachments", async () => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: "<campaign-123@test>" });
    const mockTransport = { sendMail: mockSendMail } as any;

    const fakeImageBytes = Buffer.from("fake-png-data");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => fakeImageBytes.buffer,
    } as any);

    try {
      const adapter = new SmtpEmailDispatcherAdapter({
        transport: mockTransport,
        fromAddress: "NovaCommerce <support@example.com>",
      });

      const result = await adapter.sendCampaignEmail({
        to: "recipient@example.com",
        recipientName: "Recipient A",
        subject: "New Products",
        htmlBody: `
          <div>
            <img src="http://localhost:4000/v1/storefront/media-content?key=products%2Ftest.png" alt="Product" />
          </div>
        `,
      });

      expect(result.delivered).toBe(true);
      expect(mockSendMail).toHaveBeenCalled();
      const sendMailArgs = mockSendMail.mock.calls[0][0];
      expect(sendMailArgs.html).toContain('src="cid:img_1_');
      expect(sendMailArgs.attachments).toHaveLength(1);
      expect(sendMailArgs.attachments[0].cid).toMatch(/^img_1_/);
      expect(sendMailArgs.attachments[0].contentType).toBe("image/png");
      expect(sendMailArgs.attachments[0].contentDisposition).toBe("inline");
      expect(sendMailArgs.attachments[0].filename).toBe("test.png");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
