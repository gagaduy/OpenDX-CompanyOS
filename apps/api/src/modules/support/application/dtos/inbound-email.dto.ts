// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface InboundEmailRequestDto {
  readonly from: string;
  readonly name?: string;
  readonly subject: string;
  readonly body: string;
  readonly orderId?: string;
}

export interface InboundEmailResultDto {
  readonly ticketId: string;
  readonly customerId: string;
  readonly customerEmail: string;
  readonly subject: string;
  readonly priority: string;
  readonly status: string;
  readonly proposalId?: string;
}
