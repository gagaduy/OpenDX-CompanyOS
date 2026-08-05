// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CartStatus = "active" | "superseded" | "checkout_ready";
export interface Cart { readonly id: string; readonly guestSessionId?: string; readonly customerId?: string; readonly status: CartStatus; readonly version: number; readonly expiresAt: string; readonly createdAt: string; readonly updatedAt: string }
