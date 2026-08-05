// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { TransactionRunner } from "../../shared/database/transaction";
import type { GoogleIdentityVerifier } from "./application/identity/google-identity-verifier";
import type { SessionTokenService } from "./application/security/session-token-service";
import { CustomerAuthenticationService } from "./application/services/implementations/customer-authentication.service";
import { CustomerProfileService } from "./application/services/implementations/customer-profile.service";
import { CustomerSessionService } from "./application/services/implementations/customer-session.service";
import type { CustomerCartLoginResolver } from "./application/services/interfaces/customer-cart-login-resolver";
import { PostgresqlCustomerAuditRepository } from "./infrastructure/repositories/implementations/postgresql-customer-audit.repository";
import { PostgresqlCustomerRepository } from "./infrastructure/repositories/implementations/postgresql-customer.repository";
import { CustomerAccountController } from "./presentation/controllers/customer-account.controller";
import { CustomerAuthController } from "./presentation/controllers/customer-auth.controller";
import { customerErrorMiddleware } from "./presentation/middleware/customer-error.middleware";
import { requireCustomerSession } from "./presentation/middleware/customer-session.middleware";
import type { StorefrontCookieConfig } from "./presentation/middleware/storefront-cookies";
import { requireCsrf, requireStorefrontOrigin } from "./presentation/middleware/storefront-mutation.middleware";
import { createAuthenticationRateLimit } from "./presentation/middleware/storefront-rate-limit.middleware";
import { createCustomerAccountRouter } from "./presentation/routes/customer-account.routes";
import { createCustomerAuthRouter } from "./presentation/routes/customer-auth.routes";

export interface CustomerModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly verifier: GoogleIdentityVerifier;
  readonly tokens: SessionTokenService;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly storefrontOrigin: string;
  readonly cookies: StorefrontCookieConfig;
  readonly authenticationRateLimit: number;
  readonly cartLoginResolver?: CustomerCartLoginResolver;
}

export function createCustomerModule(dependencies: CustomerModuleDependencies) {
  const repository = new PostgresqlCustomerRepository();
  const audit = new PostgresqlCustomerAuditRepository();
  const sessions = new CustomerSessionService(repository, dependencies.transactions, dependencies.tokens, dependencies.generateId, dependencies.now);
  const authentication = new CustomerAuthenticationService(repository, audit, dependencies.transactions, dependencies.verifier, dependencies.tokens, dependencies.generateId, dependencies.now);
  const profile = new CustomerProfileService(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const origin = requireStorefrontOrigin(dependencies.storefrontOrigin);
  const csrf = requireCsrf(dependencies.cookies);
  const customer = requireCustomerSession(sessions, dependencies.cookies);
  const router = Router();
  router.use(createCustomerAuthRouter(
    new CustomerAuthController(authentication, sessions, dependencies.cookies, dependencies.cartLoginResolver),
    origin,
    csrf,
    createAuthenticationRateLimit(dependencies.authenticationRateLimit),
  ));
  router.use(createCustomerAccountRouter(new CustomerAccountController(profile), customer, origin, csrf));
  router.use(customerErrorMiddleware);
  return { router, sessions, profile };
}
