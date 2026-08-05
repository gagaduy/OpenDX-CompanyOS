// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession } from "../../../../shared/database/transaction";
import type {
  CatalogAuditEntry,
  CatalogAuditRepository,
} from "../repositories/interfaces/catalog-audit.repository";
import { CatalogAuditService } from "./catalog-audit.service";

const session = {} as DatabaseSession;
const entry: CatalogAuditEntry = {
  id: "audit_catalog_created",
  actorId: "user_catalog",
  action: "catalog.product.created",
  resourceType: "product",
  resourceId: "product_bottle",
  outcome: "success",
  correlationId: "corr_catalog_create",
  metadata: { changedFields: ["name", "slug"] },
  occurredAt: "2026-08-05T00:00:00.000Z",
};

describe("CatalogAuditService", () => {
  it("passes a safe immutable audit entry through the current session", async () => {
    const append = vi.fn<CatalogAuditRepository["append"]>();
    const service = new CatalogAuditService({ append, listByResource: vi.fn() });

    await service.record(session, entry);

    expect(append).toHaveBeenCalledWith(session, entry);
  });

  it.each(["password", "accessToken", "client_secret", "authorization", "credential"])(
    "rejects sensitive metadata key %s",
    async (key) => {
      const append = vi.fn<CatalogAuditRepository["append"]>();
      const service = new CatalogAuditService({ append, listByResource: vi.fn() });

      await expect(
        service.record(session, { ...entry, metadata: { [key]: "do-not-store" } }),
      ).rejects.toThrow("sensitive metadata");
      expect(append).not.toHaveBeenCalled();
    },
  );
});
