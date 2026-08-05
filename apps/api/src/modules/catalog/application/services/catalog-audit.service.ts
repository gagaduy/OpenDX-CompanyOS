// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../shared/database/transaction";
import { CatalogDomainError } from "../../domain/exceptions/catalog-domain.error";
import type {
  CatalogAuditEntry,
  CatalogAuditRepository,
} from "../repositories/interfaces/catalog-audit.repository";

const SENSITIVE_KEY = /(password|token|secret|authorization|credential)/i;

export class CatalogAuditService {
  constructor(private readonly repository: CatalogAuditRepository) {}

  async record(
    session: DatabaseSession,
    entry: CatalogAuditEntry,
  ): Promise<void> {
    if (containsSensitiveMetadata(entry.metadata)) {
      throw new CatalogDomainError("Audit entry contains sensitive metadata");
    }
    await this.repository.append(session, entry);
  }
}

function containsSensitiveMetadata(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveMetadata);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(
    ([key, nested]) => SENSITIVE_KEY.test(key) || containsSensitiveMetadata(nested),
  );
}
