// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type SupportDomainErrorCode =
  | "INVALID_SUPPORT_TICKET"
  | "INVALID_TICKET_TRANSITION"
  | "ATTACHMENT_TYPE_NOT_ALLOWED"
  | "ATTACHMENT_TOO_LARGE"
  | "ATTACHMENT_LIMIT_EXCEEDED"
  | "INVALID_ATTACHMENT_TRANSITION";

export class SupportDomainError extends Error {
  constructor(readonly code: SupportDomainErrorCode, message: string) {
    super(message);
    this.name = "SupportDomainError";
  }
}
