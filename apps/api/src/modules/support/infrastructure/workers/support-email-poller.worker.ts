// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { EmailReceiverPort } from "../../application/ports/email-receiver.port";
import type { SupportEmailIngestionService } from "../../application/services/implementations/support-email-ingestion.service";

export class SupportEmailPollerWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private isTicking = false;

  constructor(
    private readonly emailReceiver: EmailReceiverPort,
    private readonly ingestionService: SupportEmailIngestionService,
    private readonly intervalMs = 15_000,
    private readonly onError: (e: unknown) => void = () => {},
  ) {}

  public start(): void {
    if (this.timer === undefined) {
      this.timer = setInterval(() => {
        void this.tick().catch(this.onError);
      }, this.intervalMs);
    }
  }

  public stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  public async tick(): Promise<number> {
    if (this.isTicking) return 0;
    this.isTicking = true;
    let processedCount = 0;

    try {
      const incomingEmails = await this.emailReceiver.fetchUnreadReplies();
      for (const email of incomingEmails) {
        try {
          await this.ingestionService.ingestEmail({
            fromEmail: email.fromEmail,
            fromName: email.fromName,
            subject: email.subject,
            bodyText: email.bodyText,
            ticketId: email.ticketId,
            messageUid: email.messageUid,
          });
          await this.emailReceiver.markAsRead(email.messageUid);
          processedCount += 1;
        } catch (itemErr) {
          this.onError(itemErr);
        }
      }
    } finally {
      this.isTicking = false;
    }

    return processedCount;
  }
}
