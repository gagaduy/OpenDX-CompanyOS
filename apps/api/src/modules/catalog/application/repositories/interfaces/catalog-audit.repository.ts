// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface CatalogAuditEntry {
  readonly id: string;
  readonly actorId: string;
  readonly action: string;
  readonly resourceType: "category" | "product" | "variant" | "price" | "media";
  readonly resourceId: string;
  readonly outcome: "success" | "failure" | "denied";
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface CatalogAuditRepository {
  append(session: DatabaseSession, entry: CatalogAuditEntry): Promise<void>;
  listByResource(
    session: DatabaseSession,
    resourceType: CatalogAuditEntry["resourceType"],
    resourceId: string,
  ): Promise<readonly CatalogAuditEntry[]>;
}
