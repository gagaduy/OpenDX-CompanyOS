// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface SendEmailInput {
  readonly to: string;
  readonly toName?: string;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
  readonly ticketId: string;
  readonly voucherCode?: string;
}

export interface SendEmailResult {
  readonly messageId: string;
  readonly delivered: boolean;
  readonly provider: "smtp" | "simulated";
  readonly timestamp: string;
}

export interface EmailDispatcherPort {
  sendSupportResolutionEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
