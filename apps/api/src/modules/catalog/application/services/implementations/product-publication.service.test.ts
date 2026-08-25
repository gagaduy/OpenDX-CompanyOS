// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { InventoryAvailabilityReader } from "../../../../inventory";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Product } from "../../../domain/entities/product";
import type { CatalogAuditEntry, CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { ProductRepository } from "../../repositories/interfaces/product.repository";
import type { PublicCatalogRepository } from "../../repositories/interfaces/public-catalog.repository";
import { ProductPublicationService } from "./product-publication.service";

const NOW = "2026-08-05T00:00:00.000Z";
const PRODUCT_ID = "c1000000-0000-4000-8000-000000000001";
const VARIANT_ID = "c2000000-0000-4000-8000-000000000001";
const session: DatabaseSession = { query: vi.fn() };
const product: Product = {
  id: PRODUCT_ID,
  categoryId: "c3000000-0000-4000-8000-000000000001",
  name: "Phone X",
  slug: "phone-x",
  description: "Technology phone",
  attributes: {},
  status: "draft",
  createdAt: NOW,
  updatedAt: NOW,
  version: 2,
};
const context = {
  actorId: "staff-catalog",
  roles: ["catalog_manager"] as const,
  correlationId: "corr-publish",
};

function dependencies(
  readiness = {
    categoryActive: true,
    primaryImageCount: 1,
    activeVariants: [{ variantId: VARIANT_ID, hasCurrentPrice: true }],
  },
  availability = new Map([
    [
      VARIANT_ID,
      { initialized: true, onHand: 0, reserved: 0, available: 0 },
    ],
  ]),
) {
  const products: ProductRepository = {
    list: vi.fn(async () => ({ items: [], totalItems: 0 })),
    findById: vi.fn(async () => product),
    findBySlug: vi.fn(async () => product),
    create: vi.fn(),
    update: vi.fn(async () => true),
  };
  const publicCatalog = {
    inspectPublicationReadiness: vi.fn(async () => readiness),
  } as unknown as PublicCatalogRepository;
  const inventory: InventoryAvailabilityReader = {
    getByVariantIds: vi.fn(async () => availability),
  };
  const auditEntries: CatalogAuditEntry[] = [];
  const audit: CatalogAuditRepository = {
    async append(_session, entry) {
      auditEntries.push(entry);
    },
    listByResource: vi.fn(async () => []),
  };
  const transactions: TransactionRunner = {
    run: (work) => work(session),
    runReadOnly: (work) => work(session),
  };
  const service = new ProductPublicationService(
    products,
    publicCatalog,
    inventory,
    audit,
    transactions,
    () => "generated-id",
    () => NOW,
  );
  return { auditEntries, products, service };
}

describe("ProductPublicationService", () => {
  it("returns every missing publication requirement", async () => {
    const { service } = dependencies(
      {
        categoryActive: false,
        primaryImageCount: 0,
        activeVariants: [{ variantId: VARIANT_ID, hasCurrentPrice: false }],
      },
      new Map(),
    );

    await expect(service.checkReadiness(PRODUCT_ID)).resolves.toEqual({
      ready: false,
      missing: [
        "ACTIVE_CATEGORY",
        "CURRENT_PRICE",
        "PRIMARY_IMAGE",
        "INVENTORY_ITEM",
      ],
    });
  });

  it("publishes an initialized product even when available stock is zero", async () => {
    const { auditEntries, products, service } = dependencies();

    await expect(
      service.publish(PRODUCT_ID, { version: 2 }, context),
    ).resolves.toMatchObject({ status: "published", version: 3 });
    expect(products.update).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ status: "published", version: 3 }),
      2,
    );
    expect(auditEntries).toEqual([
      expect.objectContaining({ action: "catalog.product.published" }),
    ]);
  });

  it("enforces publication authorization inside the application service", async () => {
    const { products, service } = dependencies();
    await expect(
      service.publish(PRODUCT_ID, { version: 2 }, { ...context, roles: ["inventory_manager"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(products.update).not.toHaveBeenCalled();
  });
});
