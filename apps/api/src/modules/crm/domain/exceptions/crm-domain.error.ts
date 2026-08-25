// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CrmDomainErrorCode =
  | "INVALID_CRM_NOTE"
  | "INVALID_FOLLOWUP"
  | "FOLLOWUP_ALREADY_ASSIGNED"
  | "FOLLOWUP_UNASSIGNED"
  | "FOLLOWUP_NOT_OPEN"
  | "STALE_VERSION";

export class CrmDomainError extends Error {
  constructor(readonly code: CrmDomainErrorCode, message: string) {
    super(message);
    this.name = "CrmDomainError";
  }
}
