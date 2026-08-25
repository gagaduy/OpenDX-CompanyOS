// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface InventoryAuditEntry {
  readonly id: string;
  readonly actorType: "staff" | "system";
  readonly actorId: string;
  readonly action: string;
  readonly resourceType: "inventory_item" | "inventory_reservation";
  readonly resourceId: string;
  readonly outcome: "success" | "failure" | "denied";
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface InventoryAuditRepository {
  append(session: DatabaseSession, entry: InventoryAuditEntry): Promise<void>;
}
