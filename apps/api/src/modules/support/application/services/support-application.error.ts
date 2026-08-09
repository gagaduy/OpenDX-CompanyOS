// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
export type SupportApplicationErrorCode = "FORBIDDEN"|"TICKET_NOT_FOUND"|"TICKET_NOT_OWNED"|"CUSTOMER_NOT_FOUND"|"ORDER_NOT_OWNED_BY_CUSTOMER"|"STALE_VERSION"|"ALREADY_CLAIMED"|"TICKET_CLOSED";
export class SupportApplicationError extends Error { constructor(readonly code: SupportApplicationErrorCode, message:string) { super(message); this.name="SupportApplicationError"; } }
