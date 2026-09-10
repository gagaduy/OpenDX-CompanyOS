// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { SupportEmailPollerWorker } from "./support-email-poller.worker";
import { SimulatedEmailReceiverAdapter } from "../adapters/simulated-email-receiver.adapter";

describe("SupportEmailPollerWorker", () => {
  it("fetches unread emails, ingests each, and marks them as read", async () => {
    const receiver = new SimulatedEmailReceiverAdapter();
    receiver.enqueue({
      messageUid: "msg-1",
      fromEmail: "customer@example.com",
      fromName: "Customer A",
      subject: "Re: [NovaCommerce] #62ffbc9e",
      bodyText: "Tôi không cần tôi cần đền bù cái mới",
      ticketId: "62ffbc9e",
      receivedAt: new Date(),
    });

    const mockIngestionService = {
      ingestEmail: vi.fn().mockResolvedValue({ action: "ticket_reply_appended", ticketId: "62ffbc9e" }),
    } as any;

    const worker = new SupportEmailPollerWorker(receiver, mockIngestionService, 1000);
    const count = await worker.tick();

    expect(count).toBe(1);
    expect(mockIngestionService.ingestEmail).toHaveBeenCalledWith({
      fromEmail: "customer@example.com",
      fromName: "Customer A",
      subject: "Re: [NovaCommerce] #62ffbc9e",
      bodyText: "Tôi không cần tôi cần đền bù cái mới",
      ticketId: "62ffbc9e",
      messageUid: "msg-1",
    });
    expect(receiver.readUids).toContain("msg-1");

    // Second tick has no unread emails
    const secondCount = await worker.tick();
    expect(secondCount).toBe(0);
  });

  it("handles start and stop lifecycle", () => {
    const receiver = new SimulatedEmailReceiverAdapter();
    const mockIngestionService = { ingestEmail: vi.fn() } as any;
    const worker = new SupportEmailPollerWorker(receiver, mockIngestionService, 1000);

    worker.start();
    worker.start(); // safe duplicate start
    worker.stop();
    worker.stop(); // safe duplicate stop
  });
});
