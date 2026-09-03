// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { EmailReceiverPort, IncomingCustomerEmailDto } from "../../application/ports/email-receiver.port";

export class SimulatedEmailReceiverAdapter implements EmailReceiverPort {
  private queue: IncomingCustomerEmailDto[] = [];
  public readonly readUids: string[] = [];

  public enqueue(email: IncomingCustomerEmailDto): void {
    this.queue.push(email);
  }

  public async fetchUnreadReplies(): Promise<IncomingCustomerEmailDto[]> {
    const unread = this.queue.filter((m) => !this.readUids.includes(m.messageUid));
    return [...unread];
  }

  public async markAsRead(messageUid: string): Promise<void> {
    if (!this.readUids.includes(messageUid)) {
      this.readUids.push(messageUid);
    }
  }
}
