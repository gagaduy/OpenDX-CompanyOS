// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Product } from "../../../domain/entities/product";
import { assertAttributes, assertProductMutable } from "../../../domain/services/catalog-rules";
import { normalizeSlug } from "../../../domain/value-objects/slug";
import type {
  CreateProductRequestDto,
  ProductListQuery,
  UpdateProductRequestDto,
} from "../../dtos/requests/product-request.dto";
import type { PaginatedProductsDto, ProductResponseDto } from "../../dtos/responses/product-response.dto";
import { mapProductResponse } from "../../mappers/product.mapper";
import type { CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { CategoryRepository } from "../../repositories/interfaces/category.repository";
import type { ProductRepository } from "../../repositories/interfaces/product.repository";
import { CatalogApplicationError } from "../catalog-application.error";
import type { CatalogCommandContext } from "../interfaces/category.service";
import type { ProductServiceContract } from "../interfaces/product.service";

export class ProductService implements ProductServiceContract {
  constructor(
    private readonly repository: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly audit: CatalogAuditRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async list(query: ProductListQuery): Promise<PaginatedProductsDto> {
    return this.transactions.runReadOnly(async (session) => {
      const result = await this.repository.list(session, query);
      return {
        items: result.items,
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      };
    });
  }

  async get(id: string): Promise<ProductResponseDto> {
    return this.transactions.runReadOnly(async (session) =>
      mapProductResponse(await this.requireProduct(session, id)),
    );
  }

  async create(
    request: CreateProductRequestDto,
    context: CatalogCommandContext,
  ): Promise<ProductResponseDto> {
    assertAttributes(request.attributes);
    return this.transactions.run(async (session) => {
      await this.requireActiveCategory(session, request.categoryId);
      const slug = normalizeSlug(request.slug ?? request.name);
      if ((await this.repository.findBySlug(session, slug)) !== undefined) {
        throw conflict("Product slug already exists");
      }
      const timestamp = this.now();
      const product: Product = {
        id: this.generateId(),
        categoryId: request.categoryId,
        name: request.name.trim(),
        slug,
        ...(request.brand === undefined ? {} : { brand: request.brand.trim() }),
        description: request.description.trim(),
        attributes: structuredClone(request.attributes),
        status: "draft",
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
      };
      await this.repository.create(session, product);
      await this.appendAudit(session, product, "catalog.product.created", context);
      return mapProductResponse(product);
    });
  }

  async update(
    id: string,
    request: UpdateProductRequestDto,
    context: CatalogCommandContext,
  ): Promise<ProductResponseDto> {
    return this.transactions.run(async (session) => {
      const current = await this.requireProduct(session, id);
      assertProductMutable(current.status);
      const categoryId = request.categoryId ?? current.categoryId;
      await this.requireActiveCategory(session, categoryId);
      const slug = normalizeSlug(request.slug ?? current.slug);
      const duplicate = await this.repository.findBySlug(session, slug);
      if (duplicate !== undefined && duplicate.id !== id) throw conflict("Product slug already exists");
      const attributes = request.attributes ?? current.attributes;
      assertAttributes(attributes);
      const updated: Product = {
        ...current,
        categoryId,
        name: request.name?.trim() ?? current.name,
        slug,
        brand: request.brand === undefined ? current.brand : request.brand?.trim() || undefined,
        description: request.description?.trim() ?? current.description,
        attributes: structuredClone(attributes),
        updatedAt: this.now(),
        version: current.version + 1,
      };
      if (!(await this.repository.update(session, updated, request.version))) {
        throw new CatalogApplicationError("STALE_VERSION", "Product version is stale");
      }
      await this.appendAudit(session, updated, "catalog.product.updated", context);
      return mapProductResponse(updated);
    });
  }

  async archive(
    id: string,
    version: number,
    context: CatalogCommandContext,
  ): Promise<ProductResponseDto> {
    return this.transactions.run(async (session) => {
      const current = await this.requireProduct(session, id);
      assertProductMutable(current.status);
      const archived: Product = {
        ...current,
        status: "archived",
        updatedAt: this.now(),
        version: current.version + 1,
      };
      if (!(await this.repository.update(session, archived, version))) {
        throw new CatalogApplicationError("STALE_VERSION", "Product version is stale");
      }
      await this.appendAudit(session, archived, "catalog.product.archived", context);
      return mapProductResponse(archived);
    });
  }

  private async requireProduct(session: DatabaseSession, id: string): Promise<Product> {
    const product = await this.repository.findById(session, id);
    if (product === undefined) throw new CatalogApplicationError("NOT_FOUND", "Product not found");
    return product;
  }

  private async requireActiveCategory(session: DatabaseSession, id: string): Promise<void> {
    const category = await this.categories.findById(session, id);
    if (category === undefined) throw new CatalogApplicationError("NOT_FOUND", "Category not found");
    if (category.status === "archived") throw conflict("Archived category cannot receive products");
  }

  private async appendAudit(
    session: DatabaseSession,
    product: Product,
    action: string,
    context: CatalogCommandContext,
  ): Promise<void> {
    await this.audit.append(session, {
      id: this.generateId(),
      actorId: context.actorId,
      action,
      resourceType: "product",
      resourceId: product.id,
      outcome: "success",
      correlationId: context.correlationId,
      metadata: { version: product.version },
      occurredAt: this.now(),
    });
  }
}

function conflict(message: string): CatalogApplicationError {
  return new CatalogApplicationError("CONFLICT", message);
}
