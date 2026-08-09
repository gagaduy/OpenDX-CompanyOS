// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
export type SupportApplicationErrorCode = "FORBIDDEN"|"TICKET_NOT_FOUND"|"CUSTOMER_NOT_FOUND"|"ORDER_NOT_FOUND"|"STALE_VERSION"|"ALREADY_CLAIMED";
export class SupportApplicationError extends Error { constructor(readonly code: SupportApplicationErrorCode, message:string) { super(message); this.name="SupportApplicationError"; } }
