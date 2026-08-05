// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StorefrontVariantReader } from "../catalog";
import type { CustomerSessionServiceContract, StorefrontCookieConfig } from "../customer";
import { requireCsrf, requireStorefrontOrigin } from "../customer";
import type { InventoryAvailabilityReader } from "../inventory";
import type { TransactionRunner } from "../../shared/database/transaction";
import { CartResolutionService } from "./application/services/implementations/cart-resolution.service";
import { CartService } from "./application/services/implementations/cart.service";
import { PostgresqlCartRepository } from "./infrastructure/repositories/implementations/postgresql-cart.repository";
import { CartController } from "./presentation/controllers/cart.controller";
import { cartErrorMiddleware } from "./presentation/middleware/cart-error.middleware";
import { resolveCartSession } from "./presentation/middleware/cart-session.middleware";
import { createCartRouter } from "./presentation/routes/cart.routes";

export interface CartModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly variants: StorefrontVariantReader;
  readonly availability: InventoryAvailabilityReader;
  readonly sessions: CustomerSessionServiceContract;
  readonly storefrontOrigin: string;
  readonly cookies: StorefrontCookieConfig;
  readonly generateId: () => string;
  readonly now: () => string;
}

export function createCartModule(dependencies: CartModuleDependencies) {
  const repository = new PostgresqlCartRepository();
  const service = new CartService(
    repository,
    dependencies.variants,
    dependencies.availability,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
  );
  const resolution = new CartResolutionService(
    repository,
    service,
    dependencies.variants,
    dependencies.availability,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
  );
  const controller = new CartController(service, resolution, service);
  const router = createCartRouter(
    controller,
    resolveCartSession(dependencies.sessions, dependencies.cookies, false),
    resolveCartSession(dependencies.sessions, dependencies.cookies, true),
    resolveCartSession(dependencies.sessions, dependencies.cookies, true, true),
    requireStorefrontOrigin(dependencies.storefrontOrigin),
    requireCsrf(dependencies.cookies),
  );
  router.use(cartErrorMiddleware);
  return { router, service, resolution, checkoutReady: service };
}
