// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import rateLimit from "express-rate-limit";
import type { CheckoutCatalogReader } from "../catalog";
import type { CheckoutReadyCartReader } from "../cart";
import { requireCsrf, requireCustomerSession, requireStorefrontOrigin, type CheckoutCustomerReader, type CustomerSessionServiceContract, type StorefrontCookieConfig } from "../customer";
import type { InventoryCheckoutPort } from "../inventory";
import type { OrderCheckoutPort } from "../order";
import type { PaymentCheckoutPort } from "../payment";
import type { PromotionCheckoutPort } from "../promotion";
import type { TransactionRunner } from "../../shared/database/transaction";
import { CheckoutService } from "./application/services/implementations/checkout.service";
import { PostgresqlCheckoutRepository } from "./infrastructure/repositories/implementations/postgresql-checkout.repository";
import { CheckoutController } from "./presentation/controllers/checkout.controller";
import { checkoutErrorMiddleware } from "./presentation/middleware/checkout-error.middleware";
import { createCheckoutRouter } from "./presentation/routes/checkout.routes";

export interface CheckoutModuleDependencies {
  readonly transactions: TransactionRunner; readonly carts: CheckoutReadyCartReader; readonly customers: CheckoutCustomerReader;
  readonly catalog: CheckoutCatalogReader; readonly promotions: PromotionCheckoutPort; readonly orders: OrderCheckoutPort;
  readonly payments: PaymentCheckoutPort; readonly inventory: InventoryCheckoutPort; readonly sessions: CustomerSessionServiceContract;
  readonly cookies: StorefrontCookieConfig; readonly storefrontOrigin: string; readonly generateId: () => string;
  readonly now: () => string; readonly expirationMs: number;
}
export function createCheckoutModule(dependencies: CheckoutModuleDependencies) {
  const service = new CheckoutService(new PostgresqlCheckoutRepository(), dependencies.carts, dependencies.customers, dependencies.catalog, dependencies.promotions, dependencies.orders, dependencies.payments, dependencies.inventory, dependencies.transactions, dependencies.generateId, dependencies.now, dependencies.expirationMs);
  const mutationLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
  const router = createCheckoutRouter(new CheckoutController(service), requireCustomerSession(dependencies.sessions, dependencies.cookies), requireStorefrontOrigin(dependencies.storefrontOrigin), requireCsrf(dependencies.cookies), mutationLimit);
  router.use(checkoutErrorMiddleware);
  return { router, service, paid: service };
}
