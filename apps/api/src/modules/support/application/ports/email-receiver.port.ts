// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface IncomingCustomerEmailDto {
  readonly messageUid: string;
  readonly fromEmail: string;
  readonly fromName: string;
  readonly subject: string;
  readonly bodyText: string;
  readonly ticketId?: string | null;
  readonly receivedAt: Date;
}

export interface EmailReceiverPort {
  fetchUnreadReplies(): Promise<IncomingCustomerEmailDto[]>;
  markAsRead(messageUid: string): Promise<void>;
}
