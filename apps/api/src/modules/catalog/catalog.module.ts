// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import { authenticateStaff, type StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import type { InventoryAvailabilityReader } from "../inventory";
import { CategoryService } from "./application/services/implementations/category.service";
import { ProductMediaService } from "./application/services/implementations/product-media.service";
import { ProductService } from "./application/services/implementations/product.service";
import { ProductPublicationService } from "./application/services/implementations/product-publication.service";
import { PublicCatalogService } from "./application/services/implementations/public-catalog.service";
import { PublicWishlistProductReaderService } from "./application/services/implementations/public-wishlist-product-reader";
import { VariantService } from "./application/services/implementations/variant.service";
import { CatalogVariantReaderService } from "./application/services/implementations/catalog-variant-reader";
import { StorefrontVariantReaderService } from "./application/services/implementations/storefront-variant-reader";
import { CatalogHealthReaderService } from "./application/services/implementations/catalog-health-reader";
import type { ProductMediaInspector, ProductMediaStorage } from "./application/storage/product-media.storage";
import { PostgresqlCatalogAuditRepository } from "./infrastructure/repositories/implementations/postgresql-catalog-audit.repository";
import { PostgresqlCategoryRepository } from "./infrastructure/repositories/implementations/postgresql-category.repository";
import { PostgresqlProductMediaRepository } from "./infrastructure/repositories/implementations/postgresql-product-media.repository";
import { PostgresqlProductRepository } from "./infrastructure/repositories/implementations/postgresql-product.repository";
import { PostgresqlPublicCatalogRepository } from "./infrastructure/repositories/implementations/postgresql-public-catalog.repository";
import { PostgresqlVariantRepository } from "./infrastructure/repositories/implementations/postgresql-variant.repository";
import { PostgresqlCatalogHealthRepository } from "./infrastructure/repositories/implementations/postgresql-catalog-health.repository";
import { CategoryController } from "./presentation/controllers/category.controller";
import { ProductMediaController } from "./presentation/controllers/product-media.controller";
import { ProductController } from "./presentation/controllers/product.controller";
import { ProductPublicationController } from "./presentation/controllers/product-publication.controller";
import { PublicCatalogController } from "./presentation/controllers/public-catalog.controller";
import { VariantController } from "./presentation/controllers/variant.controller";
import { createCategoryRouter } from "./presentation/routes/category.routes";
import { createProductMediaRouter } from "./presentation/routes/product-media.routes";
import { createProductRouter } from "./presentation/routes/product.routes";
import { createProductPublicationRouter } from "./presentation/routes/product-publication.routes";
import { createPublicCatalogRouter } from "./presentation/routes/public-catalog.routes";
import { createVariantRouter } from "./presentation/routes/variant.routes";

export interface CatalogModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly mediaStorage: ProductMediaStorage;
  readonly mediaInspector: ProductMediaInspector;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly mediaMaximumBytes: number;
  readonly availability: InventoryAvailabilityReader;
}

export function createCatalogVariantReader() {
  return new CatalogVariantReaderService(new PostgresqlVariantRepository());
}

export function createStorefrontVariantReader(transactions: TransactionRunner) {
  return new StorefrontVariantReaderService(
    new PostgresqlPublicCatalogRepository(),
    transactions,
  );
}

export function createPublicWishlistProductReader(
  transactions: TransactionRunner,
  availability: InventoryAvailabilityReader,
) {
  const catalog = new PublicCatalogService(
    new PostgresqlPublicCatalogRepository(),
    availability,
    transactions,
  );
  return new PublicWishlistProductReaderService(catalog);
}

export function createCatalogHealthReader(
  transactions: TransactionRunner,
  now: () => string,
) {
  return new CatalogHealthReaderService(
    new PostgresqlCatalogHealthRepository(),
    transactions,
    now,
  );
}

export function createCatalogModule(dependencies: CatalogModuleDependencies) {
  const audit = new PostgresqlCatalogAuditRepository();
  const categories = new PostgresqlCategoryRepository();
  const products = new PostgresqlProductRepository();
  const variants = new PostgresqlVariantRepository();
  const media = new PostgresqlProductMediaRepository();
  const publicCatalog = new PostgresqlPublicCatalogRepository();
  const categoryService = new CategoryService(
    categories,
    audit,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
  );
  const publicationService = new ProductPublicationService(
    products,
    publicCatalog,
    dependencies.availability,
    audit,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
  );
  const publicCatalogService = new PublicCatalogService(
    publicCatalog,
    dependencies.availability,
    dependencies.transactions,
  );
  const productService = new ProductService(
    products,
    categories,
    audit,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
    dependencies.availability,
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
  const appendDenied = async (denied: {
    actorId: string; action: string; resourceId: string; correlationId: string;
  }) => dependencies.transactions.run((session) => audit.append(session, {
    id: dependencies.generateId(),
    actorId: denied.actorId,
    action: denied.action,
    resourceType: "product",
    resourceId: denied.resourceId,
    outcome: "denied",
    correlationId: denied.correlationId,
    metadata: {},
    occurredAt: dependencies.now(),
  }));
  const adminRouter = Router();
  adminRouter.use(createCategoryRouter(new CategoryController(categoryService), authenticate));
  adminRouter.use(createProductRouter(new ProductController(productService), authenticate));
  adminRouter.use(createVariantRouter(new VariantController(variantService), authenticate));
  adminRouter.use(
    createProductMediaRouter(
      new ProductMediaController(mediaService),
      authenticate,
      dependencies.mediaMaximumBytes,
    ),
  );
  adminRouter.use(createProductPublicationRouter(
    new ProductPublicationController(publicationService),
    authenticate,
    appendDenied,
  ));
  const publicRouter = createPublicCatalogRouter(
    new PublicCatalogController(publicCatalogService, dependencies.mediaStorage),
  );
  return {
    adminRouter,
    publicRouter,
    storefrontVariants: new StorefrontVariantReaderService(publicCatalog, dependencies.transactions),
    health: new CatalogHealthReaderService(
      new PostgresqlCatalogHealthRepository(),
      dependencies.transactions,
      dependencies.now,
    ),
  };
}
