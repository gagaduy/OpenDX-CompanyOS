// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { Category } from "../../../domain/entities/category";
import { normalizeSlug } from "../../../domain/value-objects/slug";
import type {
  CreateCategoryRequestDto,
  UpdateCategoryRequestDto,
} from "../../dtos/requests/category-request.dto";
import type { CategoryResponseDto } from "../../dtos/responses/category-response.dto";
import { mapCategoryResponse } from "../../mappers/category.mapper";
import type { CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { CategoryRepository } from "../../repositories/interfaces/category.repository";
import { CatalogApplicationError } from "../catalog-application.error";
import type {
  CatalogCommandContext,
  CategoryServiceContract,
} from "../interfaces/category.service";

export class CategoryService implements CategoryServiceContract {
  constructor(
    private readonly repository: CategoryRepository,
    private readonly audit: CatalogAuditRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async list(): Promise<readonly CategoryResponseDto[]> {
    return this.transactions.runReadOnly(async (session) =>
      (await this.repository.list(session)).map(mapCategoryResponse),
    );
  }

  async create(
    request: CreateCategoryRequestDto,
    context: CatalogCommandContext,
  ): Promise<CategoryResponseDto> {
    return this.transactions.run(async (session) => {
      const slug = normalizeSlug(request.slug ?? request.name);
      if ((await this.repository.findBySlug(session, slug)) !== undefined) {
        throw conflict("Category slug already exists");
      }
      if (request.parentId !== undefined) {
        await this.assertEligibleParent(session, request.parentId);
      }
      const timestamp = this.now();
      const category: Category = {
        id: this.generateId(),
        ...(request.parentId === undefined ? {} : { parentId: request.parentId }),
        name: request.name.trim(),
        slug,
        ...(request.description === undefined
          ? {}
          : { description: request.description.trim() }),
        sortOrder: request.sortOrder ?? 0,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
      };
      await this.repository.create(session, category);
      await this.appendAudit(session, category, "catalog.category.created", context);
      return mapCategoryResponse(category);
    });
  }

  async update(
    id: string,
    request: UpdateCategoryRequestDto,
    context: CatalogCommandContext,
  ): Promise<CategoryResponseDto> {
    return this.transactions.run(async (session) => {
      const current = await this.requireCategory(session, id);
      if (current.status === "archived") throw conflict("Archived category cannot be changed");
      const parentId = request.parentId === undefined
        ? current.parentId
        : request.parentId ?? undefined;
      if (parentId !== undefined) {
        await this.assertEligibleParent(session, parentId);
        if (parentId === id || await this.repository.wouldCreateCycle(session, id, parentId)) {
          throw conflict("Category hierarchy cycle is not allowed");
        }
      }
      const slug = normalizeSlug(request.slug ?? current.slug);
      const duplicate = await this.repository.findBySlug(session, slug);
      if (duplicate !== undefined && duplicate.id !== id) {
        throw conflict("Category slug already exists");
      }
      const updated: Category = {
        ...current,
        ...(parentId === undefined ? { parentId: undefined } : { parentId }),
        name: request.name?.trim() ?? current.name,
        slug,
        description:
          request.description === undefined
            ? current.description
            : request.description?.trim() || undefined,
        sortOrder: request.sortOrder ?? current.sortOrder,
        updatedAt: this.now(),
        version: current.version + 1,
      };
      if (!(await this.repository.update(session, updated, request.version))) {
        throw conflict("Category version is stale");
      }
      await this.appendAudit(session, updated, "catalog.category.updated", context);
      return mapCategoryResponse(updated);
    });
  }

  async archive(
    id: string,
    version: number,
    context: CatalogCommandContext,
  ): Promise<CategoryResponseDto> {
    return this.transactions.run(async (session) => {
      const current = await this.requireCategory(session, id);
      if (await this.repository.hasActiveProducts(session, id)) {
        throw conflict("Category with active products cannot be archived");
      }
      const archived: Category = {
        ...current,
        status: "archived",
        updatedAt: this.now(),
        version: current.version + 1,
      };
      if (!(await this.repository.update(session, archived, version))) {
        throw conflict("Category version is stale");
      }
      await this.appendAudit(session, archived, "catalog.category.archived", context);
      return mapCategoryResponse(archived);
    });
  }

  private async requireCategory(
    session: Parameters<CategoryRepository["findById"]>[0],
    id: string,
  ): Promise<Category> {
    const category = await this.repository.findById(session, id);
    if (category === undefined) throw new CatalogApplicationError("NOT_FOUND", "Category not found");
    return category;
  }

  private async assertEligibleParent(
    session: Parameters<CategoryRepository["findById"]>[0],
    parentId: string,
  ): Promise<void> {
    const parent = await this.repository.findById(session, parentId);
    if (parent === undefined) throw new CatalogApplicationError("NOT_FOUND", "Parent category not found");
    if (parent.status === "archived") throw conflict("Archived category cannot be a parent");
  }

  private async appendAudit(
    session: Parameters<CatalogAuditRepository["append"]>[0],
    category: Category,
    action: string,
    context: CatalogCommandContext,
  ): Promise<void> {
    await this.audit.append(session, {
      id: this.generateId(),
      actorId: context.actorId,
      action,
      resourceType: "category",
      resourceId: category.id,
      outcome: "success",
      correlationId: context.correlationId,
      metadata: { version: category.version },
      occurredAt: this.now(),
    });
  }
}

function conflict(message: string): CatalogApplicationError {
  return new CatalogApplicationError("CONFLICT", message);
}
