// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Category } from "../../../domain/entities/category";
import type { CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { CategoryRepository } from "../../repositories/interfaces/category.repository";
import { CategoryService } from "./category.service";

const session = {} as DatabaseSession;
const context = { actorId: "user_catalog", correlationId: "corr_category" };
const parent: Category = {
  id: "category_parent",
  name: "Đồ gia dụng",
  slug: "do-gia-dung",
  sortOrder: 0,
  status: "active",
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  version: 1,
};

function createFixture(overrides: Partial<CategoryRepository> = {}) {
  const repository: CategoryRepository = {
    list: vi.fn(async () => []),
    findById: vi.fn(async () => undefined),
    findBySlug: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => true),
    wouldCreateCycle: vi.fn(async () => false),
    hasActiveProducts: vi.fn(async () => false),
    ...overrides,
  };
  const audit: CatalogAuditRepository = {
    append: vi.fn(async () => undefined),
    listByResource: vi.fn(async () => []),
  };
  const transactions: TransactionRunner = {
    run: (work) => work(session),
    runReadOnly: (work) => work(session),
  };
  const service = new CategoryService(
    repository,
    audit,
    transactions,
    () => "category_generated",
    () => "2026-08-05T00:00:00.000Z",
  );
  return { service, repository, audit };
}

describe("CategoryService", () => {
  it("creates a category with injected identity/time and normalized slug", async () => {
    const { service, repository, audit } = createFixture();

    const created = await service.create(
      { name: "Bình Giữ Nhiệt", description: "Reusable bottles" },
      context,
    );

    expect(created).toMatchObject({
      id: "category_generated",
      slug: "binh-giu-nhiet",
      status: "active",
      version: 1,
    });
    expect(repository.create).toHaveBeenCalledWith(session, created);
    expect(audit.append).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        actorId: "user_catalog",
        resourceType: "category",
        resourceId: "category_generated",
        correlationId: "corr_category",
      }),
    );
  });

  it("rejects duplicate slugs and missing or archived parents", async () => {
    await expect(
      createFixture({ findBySlug: vi.fn(async () => parent) }).service.create(
        { name: "Duplicate", slug: "Đồ Gia Dụng" },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      createFixture().service.create(
        { name: "Child", parentId: "missing" },
        context,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      createFixture({
        findById: vi.fn(async () => ({ ...parent, status: "archived" as const })),
      }).service.create({ name: "Child", parentId: parent.id }, context),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects hierarchy cycles and stale optimistic versions", async () => {
    const cycle = createFixture({
      findById: vi.fn(async () => parent),
      wouldCreateCycle: vi.fn(async () => true),
    });
    await expect(
      cycle.service.update(
        parent.id,
        { parentId: "category_child", version: 1 },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const stale = createFixture({
      findById: vi.fn(async () => parent),
      update: vi.fn(async () => false),
    });
    await expect(
      stale.service.update(parent.id, { name: "Changed", version: 1 }, context),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects archiving a category that still has active products", async () => {
    const { service } = createFixture({
      findById: vi.fn(async () => parent),
      hasActiveProducts: vi.fn(async () => true),
    });
    await expect(service.archive(parent.id, 1, context)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("does not append audit when the category write fails", async () => {
    const { service, audit } = createFixture({
      create: vi.fn(async () => {
        throw new Error("database write failed");
      }),
    });
    await expect(service.create({ name: "Failure" }, context)).rejects.toThrow(
      "database write failed",
    );
    expect(audit.append).not.toHaveBeenCalled();
  });
});
