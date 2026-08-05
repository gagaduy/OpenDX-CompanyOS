// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { InventoryAvailabilityReader } from "../../../../inventory/application/services/interfaces/inventory-availability";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Product } from "../../../domain/entities/product";
import type { PublicationReadinessDto, PublicationRequirement } from "../../dtos/responses/public-catalog-response.dto";
import { mapProductResponse } from "../../mappers/product.mapper";
import type { CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { ProductRepository } from "../../repositories/interfaces/product.repository";
import type { PublicCatalogRepository } from "../../repositories/interfaces/public-catalog.repository";
import { CatalogApplicationError } from "../catalog-application.error";
import type {
  ProductPublicationServiceContract,
  PublicationCommandContext,
} from "../interfaces/product-publication.service";

const publicationRoles = new Set(["administrator", "catalog_manager"]);

export class ProductPublicationService
  implements ProductPublicationServiceContract
{
  constructor(
    private readonly products: ProductRepository,
    private readonly publicCatalog: PublicCatalogRepository,
    private readonly inventory: InventoryAvailabilityReader,
    private readonly audit: CatalogAuditRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async checkReadiness(productId: string): Promise<PublicationReadinessDto> {
    return this.transactions.runReadOnly((session) =>
      this.readiness(session, productId),
    );
  }

  async publish(
    productId: string,
    request: { readonly version: number },
    context: PublicationCommandContext,
  ) {
    requirePublicationRole(context);
    return this.transactions.run(async (session) => {
      const current = await this.requireProduct(session, productId);
      if (current.status === "archived") {
        throw new CatalogApplicationError(
          "PRODUCT_NOT_READY_FOR_PUBLICATION",
          "Archived product cannot be published",
        );
      }
      if (current.status === "published") return mapProductResponse(current);
      const readiness = await this.readiness(session, productId);
      if (!readiness.ready) {
        throw new CatalogApplicationError(
          "PRODUCT_NOT_READY_FOR_PUBLICATION",
          `Product is missing publication requirements: ${readiness.missing.join(", ")}`,
        );
      }
      return this.changeStatus(session, current, "published", request.version, context);
    });
  }

  async unpublish(
    productId: string,
    request: { readonly version: number },
    context: PublicationCommandContext,
  ) {
    requirePublicationRole(context);
    return this.transactions.run(async (session) => {
      const current = await this.requireProduct(session, productId);
      if (current.status === "archived") {
        throw new CatalogApplicationError("CONFLICT", "Archived product cannot be unpublished");
      }
      if (current.status === "draft") return mapProductResponse(current);
      return this.changeStatus(session, current, "draft", request.version, context);
    });
  }

  private async readiness(
    session: DatabaseSession,
    productId: string,
  ): Promise<PublicationReadinessDto> {
    const snapshot = await this.publicCatalog.inspectPublicationReadiness(
      session,
      productId,
    );
    if (snapshot === undefined) {
      throw new CatalogApplicationError("NOT_FOUND", "Product not found");
    }
    const missing: PublicationRequirement[] = [];
    if (!snapshot.categoryActive) missing.push("ACTIVE_CATEGORY");
    if (snapshot.activeVariants.length === 0) {
      missing.push("ACTIVE_VARIANT");
    } else {
      if (snapshot.activeVariants.some(({ hasCurrentPrice }) => !hasCurrentPrice)) {
        missing.push("CURRENT_PRICE");
      }
      if (snapshot.primaryImageCount !== 1) missing.push("PRIMARY_IMAGE");
      const availability = await this.inventory.getByVariantIds(
        snapshot.activeVariants.map(({ variantId }) => variantId),
      );
      if (
        snapshot.activeVariants.some(
          ({ variantId }) => availability.get(variantId)?.initialized !== true,
        )
      ) {
        missing.push("INVENTORY_ITEM");
      }
    }
    if (
      snapshot.activeVariants.length === 0 &&
      snapshot.primaryImageCount !== 1
    ) {
      missing.push("PRIMARY_IMAGE");
    }
    return { ready: missing.length === 0, missing };
  }

  private async requireProduct(
    session: DatabaseSession,
    productId: string,
  ): Promise<Product> {
    const product = await this.products.findById(session, productId);
    if (product === undefined) {
      throw new CatalogApplicationError("NOT_FOUND", "Product not found");
    }
    return product;
  }

  private async changeStatus(
    session: DatabaseSession,
    current: Product,
    status: "draft" | "published",
    expectedVersion: number,
    context: PublicationCommandContext,
  ) {
    const updated: Product = {
      ...current,
      status,
      updatedAt: this.now(),
      version: current.version + 1,
    };
    if (!(await this.products.update(session, updated, expectedVersion))) {
      throw new CatalogApplicationError("STALE_VERSION", "Product version is stale");
    }
    await this.audit.append(session, {
      id: this.generateId(),
      actorId: context.actorId,
      action:
        status === "published"
          ? "catalog.product.published"
          : "catalog.product.unpublished",
      resourceType: "product",
      resourceId: current.id,
      outcome: "success",
      correlationId: context.correlationId,
      metadata: { status, version: updated.version },
      occurredAt: this.now(),
    });
    return mapProductResponse(updated);
  }
}

function requirePublicationRole(context: PublicationCommandContext): void {
  if (!context.roles.some((role) => publicationRoles.has(role))) {
    throw new CatalogApplicationError("FORBIDDEN", "Insufficient permissions");
  }
}
