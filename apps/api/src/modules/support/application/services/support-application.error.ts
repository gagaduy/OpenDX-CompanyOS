// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
export type SupportApplicationErrorCode = "FORBIDDEN"|"VALIDATION_ERROR"|"TICKET_NOT_FOUND"|"TICKET_NOT_OWNED"|"CUSTOMER_NOT_FOUND"|"ORDER_NOT_OWNED_BY_CUSTOMER"|"STALE_VERSION"|"ALREADY_CLAIMED"|"TICKET_CLOSED"|"ATTACHMENT_NOT_FOUND"|"ATTACHMENT_TYPE_NOT_ALLOWED"|"ATTACHMENT_TOO_LARGE"|"ATTACHMENT_LIMIT_EXCEEDED"|"ATTACHMENT_QUARANTINED"|"ATTACHMENT_SCAN_FAILED";
export class SupportApplicationError extends Error { constructor(readonly code: SupportApplicationErrorCode, message:string) { super(message); this.name="SupportApplicationError"; } }
