// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CatalogAuditEntry,
  CatalogAuditRepository,
} from "../../../application/repositories/interfaces/catalog-audit.repository";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

interface CatalogAuditRow {
  id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  outcome: string;
  correlation_id: string;
  metadata: Record<string, unknown>;
  occurred_at: Date | string;
}

const RESOURCE_TYPES = ["category", "product", "variant", "price", "media"] as const;
const OUTCOMES = ["success", "failure", "denied"] as const;

export class PostgresqlCatalogAuditRepository
  implements CatalogAuditRepository
{
  async append(
    session: DatabaseSession,
    entry: CatalogAuditEntry,
  ): Promise<void> {
    await session.query(
      `INSERT INTO audit_events
        (id, actor_type, actor_id, action, resource_type, resource_id,
         outcome, correlation_id, metadata, occurred_at)
       VALUES ($1, 'user', $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        entry.id,
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

  async listByResource(
    session: DatabaseSession,
    resourceType: CatalogAuditEntry["resourceType"],
    resourceId: string,
  ): Promise<readonly CatalogAuditEntry[]> {
    const result = await session.query<CatalogAuditRow>(
      `SELECT id, actor_id, action, resource_type, resource_id, outcome,
              correlation_id, metadata, occurred_at
       FROM audit_events
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY occurred_at DESC, id ASC`,
      [resourceType, resourceId],
    );
    return result.rows.map(mapRow);
  }
}

function mapRow(row: CatalogAuditRow): CatalogAuditEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    resourceType: enumValue("resource_type", row.resource_type, RESOURCE_TYPES),
    resourceId: row.resource_id,
    outcome: enumValue("outcome", row.outcome, OUTCOMES),
    correlationId: row.correlation_id,
    metadata: structuredClone(row.metadata),
    occurredAt: (row.occurred_at instanceof Date
      ? row.occurred_at
      : new Date(row.occurred_at)
    ).toISOString(),
  };
}

function enumValue<const T extends readonly string[]>(
  field: string,
  value: string,
  allowed: T,
): T[number] {
  if (!allowed.includes(value)) throw new Error(`Invalid ${field}: ${value}`);
  return value as T[number];
}
