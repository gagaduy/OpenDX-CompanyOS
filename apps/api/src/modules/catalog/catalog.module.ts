// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import { authenticateStaff, type StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import { CategoryService } from "./application/services/implementations/category.service";
import { ProductMediaService } from "./application/services/implementations/product-media.service";
import { ProductService } from "./application/services/implementations/product.service";
import { VariantService } from "./application/services/implementations/variant.service";
import type { ProductMediaInspector, ProductMediaStorage } from "./application/storage/product-media.storage";
import { PostgresqlCatalogAuditRepository } from "./infrastructure/repositories/implementations/postgresql-catalog-audit.repository";
import { PostgresqlCategoryRepository } from "./infrastructure/repositories/implementations/postgresql-category.repository";
import { PostgresqlProductMediaRepository } from "./infrastructure/repositories/implementations/postgresql-product-media.repository";
import { PostgresqlProductRepository } from "./infrastructure/repositories/implementations/postgresql-product.repository";
import { PostgresqlVariantRepository } from "./infrastructure/repositories/implementations/postgresql-variant.repository";
import { CategoryController } from "./presentation/controllers/category.controller";
import { ProductMediaController } from "./presentation/controllers/product-media.controller";
import { ProductController } from "./presentation/controllers/product.controller";
import { VariantController } from "./presentation/controllers/variant.controller";
import { createCategoryRouter } from "./presentation/routes/category.routes";
import { createProductMediaRouter } from "./presentation/routes/product-media.routes";
import { createProductRouter } from "./presentation/routes/product.routes";
import { createVariantRouter } from "./presentation/routes/variant.routes";

export interface CatalogModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly mediaStorage: ProductMediaStorage;
  readonly mediaInspector: ProductMediaInspector;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly mediaMaximumBytes: number;
}

export function createCatalogModule(dependencies: CatalogModuleDependencies): Router {
  const audit = new PostgresqlCatalogAuditRepository();
  const categories = new PostgresqlCategoryRepository();
  const products = new PostgresqlProductRepository();
  const variants = new PostgresqlVariantRepository();
  const media = new PostgresqlProductMediaRepository();
  const categoryService = new CategoryService(
    categories,
    audit,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
  );
  const productService = new ProductService(
    products,
    categories,
    audit,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
  );
  const variantService = new VariantService(
    variants,
    products,
    audit,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
  );
  const mediaService = new ProductMediaService(
    media,
    products,
    dependencies.mediaStorage,
    dependencies.mediaInspector,
    audit,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
    dependencies.mediaMaximumBytes,
  );
  const authenticate = authenticateStaff(dependencies.staffTokenVerifier);
  const router = Router();
  router.use(createCategoryRouter(new CategoryController(categoryService), authenticate));
  router.use(createProductRouter(new ProductController(productService), authenticate));
  router.use(createVariantRouter(new VariantController(variantService), authenticate));
  router.use(
    createProductMediaRouter(
      new ProductMediaController(mediaService),
      authenticate,
      dependencies.mediaMaximumBytes,
    ),
  );
  return router;
}
