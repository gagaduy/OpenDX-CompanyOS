// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Router } from "express";
import { Client } from "minio";
import { createApiApp } from "./app";
import { createCatalogModule, createCatalogVariantReader } from "./modules/catalog";
import { createInventoryModule } from "./modules/inventory";
import { FileTypeProductMediaInspector, MinioProductMediaStorage } from "./modules/catalog/infrastructure/storage/minio-product-media.storage";
import { PostgresqlCompanyOperatingCoreRepository } from "./modules/company-operating-core/infrastructure/repositories/implementations/postgresql-company-operating-core.repository";
import { parseApiEnvironment } from "./shared/config/environment";
import { createPostgresPool } from "./shared/database/postgres";
import { PostgresTransactionRunner } from "./shared/database/transaction";
import { createRemoteStaffTokenVerifier } from "./shared/auth/staff-auth.middleware";
import type { DependencyStatus } from "./shared/http/health.routes";
import { createCustomerModule } from "./modules/customer";
import type { CustomerCartLoginResolver } from "./modules/customer";
import { createCartModule, type CartResolutionServiceContract } from "./modules/cart";
import { NodeSessionTokenService } from "./modules/customer/infrastructure/security/node-session-token-service";
import { GoogleJoseIdentityVerifier } from "./modules/customer/infrastructure/identity/google-jose-identity-verifier";
import { UnavailableGoogleIdentityVerifier } from "./modules/customer/infrastructure/identity/unavailable-google-identity-verifier";
import { createPromotionModule } from "./modules/promotion";
import { createOrderModule } from "./modules/order";
import { createPaymentModule, SePayPaymentGateway, UnavailablePaymentGateway } from "./modules/payment";
import { createCheckoutModule } from "./modules/checkout";

const environment = parseApiEnvironment(process.env);
const pool = createPostgresPool(environment);
const transactions = new PostgresTransactionRunner(pool);
const repository = new PostgresqlCompanyOperatingCoreRepository(transactions);
const minioEndpoint = new URL(environment.minioEndpoint);
const minio = new Client({
  endPoint: minioEndpoint.hostname,
  port: Number(minioEndpoint.port || (minioEndpoint.protocol === "https:" ? 443 : 80)),
  useSSL: minioEndpoint.protocol === "https:",
  accessKey: environment.minioAccessKey,
  secretKey: environment.minioSecretKey,
});
const staffTokenVerifier = createRemoteStaffTokenVerifier({
  issuer: environment.keycloakIssuer,
  jwksUrl: environment.keycloakJwksUrl,
  audience: environment.keycloakAudience,
});
const inventory = createInventoryModule({
  transactions,
  variantReader: createCatalogVariantReader(),
  staffTokenVerifier,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
  reservationTtlMs: environment.inventoryReservationTtlSeconds * 1_000,
  expiryIntervalMs: environment.inventoryExpiryIntervalSeconds * 1_000,
  onWorkerError: (error) => console.error("Inventory expiry worker failed", error),
});
const catalog = createCatalogModule({
  transactions,
  mediaStorage: new MinioProductMediaStorage(minio, environment.minioBucket),
  mediaInspector: new FileTypeProductMediaInspector(),
  staffTokenVerifier,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
  mediaMaximumBytes: environment.mediaMaxBytes,
  availability: inventory.availability,
});
const storefrontCookies = {
  guestName: environment.guestCookieName,
  customerName: environment.customerCookieName,
  csrfName: environment.csrfCookieName,
  secure: environment.cookieSecure,
};
let cartResolution: CartResolutionServiceContract | undefined;
const cartLoginResolver: CustomerCartLoginResolver = {
  async inspect(...arguments_) {
    return cartResolution === undefined
      ? { status: "not_required" }
      : cartResolution.inspect(...arguments_);
  },
};
const customer = createCustomerModule({
  transactions,
  verifier: environment.googleClientId === undefined
    ? new UnavailableGoogleIdentityVerifier()
    : new GoogleJoseIdentityVerifier(environment.googleClientId),
  tokens: new NodeSessionTokenService(),
  generateId: randomUUID,
  now: () => new Date().toISOString(),
  storefrontOrigin: environment.storefrontOrigin,
  cookies: storefrontCookies,
  authenticationRateLimit: environment.authenticationRateLimit,
  cartLoginResolver,
});
const cart = createCartModule({
  transactions,
  variants: catalog.storefrontVariants,
  availability: inventory.availability,
  sessions: customer.sessions,
  storefrontOrigin: environment.storefrontOrigin,
  cookies: storefrontCookies,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
});
cartResolution = cart.resolution;
const promotion = createPromotionModule({
  transactions,
  staffTokenVerifier,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
});
const order = createOrderModule({
  transactions,
  staffTokenVerifier,
  customerSessions: customer.sessions,
  cookies: storefrontCookies,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
});
const paymentGateway = environment.sepay.configured
  ? new SePayPaymentGateway({
      checkoutUrl: environment.sepay.checkoutUrl,
      apiBaseUrl: environment.sepay.apiBaseUrl,
      merchantId: environment.sepay.merchantId,
      secretKey: environment.sepay.secretKey,
      successUrl: environment.sepay.successUrl,
      errorUrl: environment.sepay.errorUrl,
      cancelUrl: environment.sepay.cancelUrl,
      requestTimeoutMs: environment.sepay.requestTimeoutMs,
    })
  : new UnavailablePaymentGateway();
const payment = createPaymentModule({ transactions, gateway: paymentGateway, generateId: randomUUID, now: () => new Date().toISOString() });
const checkout = createCheckoutModule({
  transactions, carts: cart.checkoutReady, customers: customer.checkout,
  catalog: catalog.storefrontVariants, promotions: promotion.checkout,
  orders: order.checkout, payments: payment.checkout, inventory: inventory.reservations,
  sessions: customer.sessions, cookies: storefrontCookies,
  storefrontOrigin: environment.storefrontOrigin, generateId: randomUUID,
  now: () => new Date().toISOString(), expirationMs: environment.checkoutTtlSeconds * 1_000,
  expiryIntervalMs: environment.checkoutExpiryIntervalSeconds * 1_000,
  onWorkerError: (error) => console.error("Checkout expiry worker failed", error),
});
const paymentOperations = payment.createOperations({
  orders: order.checkout, inventory: inventory.reservations,
  promotions: promotion.checkout, checkouts: checkout.paid, carts: cart.paid,
  staffTokenVerifier,
  reconciliationIntervalMs: environment.paymentReconciliationIntervalSeconds * 1_000,
  onWorkerError: (error) => console.error("Payment reconciliation worker failed", error),
  ...(environment.sepay.configured ? { ipnSecret: environment.sepay.ipnSecret } : {}),
});
const storefront = Router();
storefront.use(catalog.publicRouter);
storefront.use(customer.router);
storefront.use(cart.router);
storefront.use(order.customerRouter);
storefront.use(checkout.router);
const app = createApiApp({
  consoleOrigin: environment.consoleOrigin,
  storefrontOrigin: environment.storefrontOrigin,
  companyOperatingCoreRepository: repository,
  catalogAdminRouter: catalog.adminRouter,
  storefrontRouter: storefront,
  inventoryRouter: inventory.router,
  promotionAdminRouter: promotion.adminRouter,
  orderAdminRouter: order.adminRouter,
  paymentAdminRouter: paymentOperations.adminRouter,
  sepayWebhookRouter: paymentOperations.webhookRouter,
  readiness: async () => ({
    postgres: await probe(async () => { await pool.query("SELECT 1"); }),
    migrations: await probe(async () => {
      const result = await pool.query<{ catalog: string; company_core: string; inventory: string; customer: string; cart: string; promotion: string; checkout: string; orders: string; payment: string }>(
        "SELECT (SELECT count(*)::text FROM catalog_migrations) AS catalog, (SELECT count(*)::text FROM company_core_migrations) AS company_core, (SELECT count(*)::text FROM inventory_migrations) AS inventory, (SELECT count(*)::text FROM customer_migrations) AS customer, (SELECT count(*)::text FROM cart_migrations) AS cart, (SELECT count(*)::text FROM promotion_migrations) AS promotion, (SELECT count(*)::text FROM checkout_migrations) AS checkout, (SELECT count(*)::text FROM order_migrations) AS orders, (SELECT count(*)::text FROM payment_migrations) AS payment",
      );
      if (Number(result.rows[0]?.catalog ?? 0) < 2 || Number(result.rows[0]?.company_core ?? 0) < 1 || Number(result.rows[0]?.inventory ?? 0) < 1 || Number(result.rows[0]?.customer ?? 0) < 1 || Number(result.rows[0]?.cart ?? 0) < 1 || Number(result.rows[0]?.promotion ?? 0) < 1 || Number(result.rows[0]?.checkout ?? 0) < 1 || Number(result.rows[0]?.orders ?? 0) < 1 || Number(result.rows[0]?.payment ?? 0) < 1) {
        throw new Error("Database migrations are incomplete");
      }
    }),
    keycloak: await probe(async () => {
      const response = await fetch(environment.keycloakJwksUrl);
      if (!response.ok) throw new Error("Keycloak JWKS is unavailable");
    }),
    minio: await probe(async () => {
      if (!(await minio.bucketExists(environment.minioBucket))) {
        throw new Error("Product media bucket is unavailable");
      }
    }),
  }),
});

const server = app.listen(environment.apiPort, () => {
  console.log(`OpenDX API listening on http://localhost:${environment.apiPort}`);
  inventory.expiryWorker.start();
  checkout.expiryWorker.start();
  if (environment.sepay.configured) paymentOperations.reconciliationWorker.start();
});

async function shutdown(): Promise<void> {
  inventory.expiryWorker.stop();
  checkout.expiryWorker.stop();
  paymentOperations.reconciliationWorker.stop();
  server.close(async () => {
    await pool.end();
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

async function probe(operation: () => Promise<void>): Promise<DependencyStatus> {
  try {
    await operation();
    return "up";
  } catch {
    return "down";
  }
}
