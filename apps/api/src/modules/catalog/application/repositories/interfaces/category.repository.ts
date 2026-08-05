// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { Category } from "../../../domain/entities/category";

export interface CategoryRepository {
  list(session: DatabaseSession): Promise<readonly Category[]>;
  findById(session: DatabaseSession, id: string): Promise<Category | undefined>;
  findBySlug(session: DatabaseSession, slug: string): Promise<Category | undefined>;
  create(session: DatabaseSession, category: Category): Promise<void>;
  update(
    session: DatabaseSession,
    category: Category,
    expectedVersion: number,
  ): Promise<boolean>;
  wouldCreateCycle(
    session: DatabaseSession,
    categoryId: string,
    parentId: string,
  ): Promise<boolean>;
  hasActiveProducts(session: DatabaseSession, categoryId: string): Promise<boolean>;
}
