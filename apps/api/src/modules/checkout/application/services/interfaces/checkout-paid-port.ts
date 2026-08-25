// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { DatabaseSession } from "../../../../../shared/database/transaction";
export interface CompletedCheckoutReference { readonly checkoutId: string; readonly cartId: string; readonly cartVersion: number; readonly customerId: string; }
export interface CheckoutPaidPort { completePaid(session: DatabaseSession, checkoutId: string, orderId: string, now: string): Promise<CompletedCheckoutReference>; }
