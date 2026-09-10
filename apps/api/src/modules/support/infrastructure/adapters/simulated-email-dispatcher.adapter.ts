// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type {
  EmailDispatcherPort,
  SendEmailInput,
  SendEmailResult,
} from "../../application/ports/email-dispatcher.port";

export class SimulatedEmailDispatcherAdapter implements EmailDispatcherPort {
  private readonly sentEmails: SendEmailInput[] = [];

  async sendSupportResolutionEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.sentEmails.push(input);
    return {
      messageId: `simulated-${randomUUID()}`,
      delivered: true,
      provider: "simulated",
      timestamp: new Date().toISOString(),
    };
  }

  getSentEmails(): readonly SendEmailInput[] {
    return [...this.sentEmails];
  }

  clear(): void {
    this.sentEmails.length = 0;
  }
}
