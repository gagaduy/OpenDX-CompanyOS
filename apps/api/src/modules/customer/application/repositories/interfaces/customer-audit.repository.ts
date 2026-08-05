// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import type { DatabaseSession } from "../../../../../shared/database/transaction";
export interface CustomerAuditRepository {
  append(
    s: DatabaseSession,
    event: {
      readonly id: string;
      readonly actorId: string;
      readonly action: string;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly outcome: "success" | "denied";
      readonly correlationId: string;
      readonly occurredAt: string;
    },
  ): Promise<void>;
}
