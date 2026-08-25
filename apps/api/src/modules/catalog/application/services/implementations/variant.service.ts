// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { ProductPrice } from "../../../domain/entities/product-price";
import type { ProductVariant } from "../../../domain/entities/product-variant";
import { assertProductMutable, assertVariantOptions } from "../../../domain/services/catalog-rules";
import { createMoney } from "../../../domain/value-objects/money";
import { normalizeSku } from "../../../domain/value-objects/sku";
import type {
  CreateVariantRequestDto,
  ReplacePriceRequestDto,
  UpdateVariantRequestDto,
} from "../../dtos/requests/variant-request.dto";
import type { CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { ProductRepository } from "../../repositories/interfaces/product.repository";
import type { VariantRepository } from "../../repositories/interfaces/variant.repository";
import { CatalogApplicationError } from "../catalog-application.error";
import type { CatalogCommandContext } from "../interfaces/category.service";
import type { VariantServiceContract } from "../interfaces/variant.service";

export class VariantService implements VariantServiceContract {
  constructor(
    private readonly variants: VariantRepository,
    private readonly products: ProductRepository,
    private readonly audit: CatalogAuditRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async create(productId: string, request: CreateVariantRequestDto, context: CatalogCommandContext) {
    assertVariantOptions(request.optionValues);
    return this.transactions.run(async (session) => {
      await this.requireMutableProduct(session, productId);
      const sku = normalizeSku(request.sku);
      if ((await this.variants.findBySku(session, sku)) !== undefined) throw conflict("Variant SKU already exists");
      const timestamp = this.now();
      const variant: ProductVariant = {
        id: this.generateId(),
        productId,
        sku,
        title: request.title.trim(),
        optionValues: structuredClone(request.optionValues),
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
      };
      await this.variants.create(session, variant);
      await this.appendAudit(session, "variant", variant.id, "catalog.variant.created", variant.version, context);
      return structuredClone(variant);
    });
  }

  async update(productId: string, variantId: string, request: UpdateVariantRequestDto, context: CatalogCommandContext) {
    return this.transactions.run(async (session) => {
      await this.requireMutableProduct(session, productId);
      const current = await this.requireVariant(session, productId, variantId);
      if (current.status === "archived") throw conflict("Archived variant cannot be changed");
      const sku = normalizeSku(request.sku ?? current.sku);
      const duplicate = await this.variants.findBySku(session, sku);
      if (duplicate !== undefined && duplicate.id !== variantId) throw conflict("Variant SKU already exists");
      const options = request.optionValues ?? current.optionValues;
      assertVariantOptions(options);
      const updated: ProductVariant = {
        ...current,
        sku,
        title: request.title?.trim() ?? current.title,
        optionValues: structuredClone(options),
        updatedAt: this.now(),
        version: current.version + 1,
      };
      if (!(await this.variants.update(session, updated, request.version))) {
        throw new CatalogApplicationError("STALE_VERSION", "Variant version is stale");
      }
      await this.appendAudit(session, "variant", updated.id, "catalog.variant.updated", updated.version, context);
      return structuredClone(updated);
    });
  }

  async archive(productId: string, variantId: string, version: number, context: CatalogCommandContext) {
    return this.transactions.run(async (session) => {
      await this.requireMutableProduct(session, productId);
      const current = await this.requireVariant(session, productId, variantId);
      if (current.status === "archived") throw conflict("Variant is already archived");
      const archived: ProductVariant = {
        ...current,
        status: "archived",
        updatedAt: this.now(),
        version: current.version + 1,
      };
      if (!(await this.variants.update(session, archived, version))) {
        throw new CatalogApplicationError("STALE_VERSION", "Variant version is stale");
      }
      await this.appendAudit(session, "variant", archived.id, "catalog.variant.archived", archived.version, context);
      return structuredClone(archived);
    });
  }

  async replacePrice(productId: string, variantId: string, request: ReplacePriceRequestDto, context: CatalogCommandContext) {
    const money = createMoney(request.amountMinor, request.currency);
    return this.transactions.run(async (session) => {
      await this.requireMutableProduct(session, productId);
      const variant = await this.requireVariant(session, productId, variantId);
      if (variant.status === "archived") throw conflict("Archived variant cannot receive prices");
      const timestamp = this.now();
      const price: ProductPrice = {
        id: this.generateId(),
        variantId,
        ...money,
        validFrom: timestamp,
        createdBy: context.actorId,
      };
      await this.variants.replaceCurrentPrice(session, price);
      await this.appendAudit(session, "price", price.id, "catalog.price.replaced", undefined, context);
      return structuredClone(price);
    });
  }

  private async requireMutableProduct(session: DatabaseSession, id: string): Promise<void> {
    const product = await this.products.findById(session, id);
    if (product === undefined) throw new CatalogApplicationError("NOT_FOUND", "Product not found");
    assertProductMutable(product.status);
  }

  private async requireVariant(session: DatabaseSession, productId: string, id: string): Promise<ProductVariant> {
    const variant = await this.variants.findById(session, id);
    if (variant === undefined || variant.productId !== productId) {
      throw new CatalogApplicationError("NOT_FOUND", "Variant not found");
    }
    return variant;
  }

  private async appendAudit(
    session: DatabaseSession,
    resourceType: "variant" | "price",
    resourceId: string,
    action: string,
    version: number | undefined,
    context: CatalogCommandContext,
  ): Promise<void> {
    await this.audit.append(session, {
      id: this.generateId(),
      actorId: context.actorId,
      action,
      resourceType,
      resourceId,
      outcome: "success",
      correlationId: context.correlationId,
      metadata: version === undefined ? {} : { version },
      occurredAt: this.now(),
    });
  }
}

function conflict(message: string): CatalogApplicationError {
  return new CatalogApplicationError("CONFLICT", message);
}
