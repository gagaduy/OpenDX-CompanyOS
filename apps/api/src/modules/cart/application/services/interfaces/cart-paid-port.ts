// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { DatabaseSession } from "../../../../../shared/database/transaction";
export interface CartPaidPort { finalizePaidCheckout(session: DatabaseSession, cartId: string, customerId: string, now: string): Promise<void>; }
