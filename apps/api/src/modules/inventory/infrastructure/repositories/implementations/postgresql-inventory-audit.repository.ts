// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { InventoryAuditRepository } from "../../../application/repositories/interfaces/inventory-audit.repository";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

export class PostgresqlInventoryAuditRepository
  implements InventoryAuditRepository
{
  async append(
    session: DatabaseSession,
    entry: Parameters<InventoryAuditRepository["append"]>[1],
  ): Promise<void> {
    await session.query(
      `INSERT INTO audit_events
        (id, actor_type, actor_id, action, resource_type, resource_id,
         outcome, correlation_id, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
      [
        entry.id,
        entry.actorType,
        entry.actorId,
        entry.action,
        entry.resourceType,
        entry.resourceId,
        entry.outcome,
        entry.correlationId,
        JSON.stringify(entry.metadata),
        entry.occurredAt,
      ],
    );
  }
}
