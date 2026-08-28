// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { Router } from "express";
import { Client } from "minio";
import { createApiApp } from "./app";
import { createCatalogHealthReader, createCatalogModule, createCatalogVariantReader, createPublicWishlistProductReader } from "./modules/catalog";
import { createInventoryHealthReader, createInventoryModule } from "./modules/inventory";
import { FileTypeProductMediaInspector, MinioProductMediaStorage } from "./modules/catalog/infrastructure/storage/minio-product-media.storage";
import { PostgresqlCompanyOperatingCoreRepository } from "./modules/company-operating-core/infrastructure/repositories/implementations/postgresql-company-operating-core.repository";
import { parseApiEnvironment } from "./shared/config/environment";
import { createPostgresPool } from "./shared/database/postgres";
import { assertRequiredMigrations } from "./shared/database/migration-readiness";
import { PostgresTransactionRunner } from "./shared/database/transaction";
import { createRemoteStaffTokenVerifier } from "./shared/auth/staff-auth.middleware";
import { createRemoteWorkloadTokenVerifier } from "./shared/auth/workload-auth.middleware";
import { ClientCredentialsTokenProvider } from "./shared/auth/client-credentials-token-provider";
import type { DependencyStatus } from "./shared/http/health.routes";
import { createLogger } from "./shared/observability/logger";
import { createMetricsRegistry } from "./shared/observability/metrics";
import { createCustomerModule } from "./modules/customer";
import type { CustomerCartLoginResolver } from "./modules/customer";
import { createCartModule, type CartResolutionServiceContract } from "./modules/cart";
import { NodeSessionTokenService } from "./modules/customer/infrastructure/security/node-session-token-service";
import { GoogleJoseIdentityVerifier } from "./modules/customer/infrastructure/identity/google-jose-identity-verifier";
import { UnavailableGoogleIdentityVerifier } from "./modules/customer/infrastructure/identity/unavailable-google-identity-verifier";
import { createPromotionModule } from "./modules/promotion";
import { createOrderHealthReader, createOrderModule } from "./modules/order";
import { createPaymentHealthReader, createPaymentModule, SePayPaymentGateway, UnavailablePaymentGateway } from "./modules/payment";
import { createCheckoutModule } from "./modules/checkout";
import { createCrmHealthReader, createCrmModule } from "./modules/crm";
import { createAgenticAnalyticsReader, createReportingModule } from "./modules/reporting";
import { createSupportHealthReader, createSupportModule } from "./modules/support";
import { createAgenticModule, createFixedDepartmentToolAdapterRegistry } from "./modules/agentic";
import { createMarketingModule } from "./modules/marketing";
import { HttpWorkflowGateway } from "./modules/agentic/infrastructure/workflows/http-workflow.gateway";
import { BoundedAgenticFileParser } from "./modules/agentic/infrastructure/parsing/bounded-agentic-file.parser";
import { ClamdAgenticFileScanner } from "./modules/agentic/infrastructure/security/clamd-agentic-file.scanner";
import { MinioAgenticFileStorage } from "./modules/agentic/infrastructure/storage/minio-agentic-file.storage";
import { ClamdSupportAttachmentScanner } from "./modules/support/infrastructure/security/clamd-support-attachment.scanner";
import { MinioSupportAttachmentStorage } from "./modules/support/infrastructure/storage/minio-support-attachment.storage";

const environment = parseApiEnvironment(process.env);
const logger = createLogger(environment.logging);
const metrics = environment.metrics.enabled ? createMetricsRegistry() : undefined;
const pool = createPostgresPool({
  ...environment,
  onBackgroundError: (error) => console.error("PostgreSQL pool background error", error),
});
const transactions = new PostgresTransactionRunner(pool);
const analyticsPool = createPostgresPool({
  databaseUrl: environment.agenticAnalyticsDatabaseUrl,
  onBackgroundError: (error) => console.error("Agentic analytics pool background error", error),
});
const analyticsTransactions = new PostgresTransactionRunner(analyticsPool);
const analytics = createAgenticAnalyticsReader(analyticsTransactions);
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
const workloadTokenVerifier = createRemoteWorkloadTokenVerifier({
  issuer: environment.keycloakIssuer,
  jwksUrl: environment.keycloakJwksUrl,
  audience: environment.keycloakAudience,
});
const agenticTokens = new ClientCredentialsTokenProvider({
  tokenUrl: environment.agentic.tokenUrl,
  clientId: environment.agentic.controlClientId,
  clientSecret: environment.agentic.controlClientSecret,
  audience: environment.agentic.controlAudience,
  fetch,
  now: Date.now,
  expirySkewMs: 10_000,
});
const workflowGateway = new HttpWorkflowGateway({
  baseUrl: environment.agentic.runtimeUrl,
  tokens: agenticTokens,
  fetch,
  timeoutMs: environment.agentic.gatewayTimeoutMs,
  maximumResponseBytes: 16_384,
  onError: (error) => console.error("Agentic workflow gateway failed", error),
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
  wishlistProducts: createPublicWishlistProductReader(
    transactions,
    inventory.availability,
  ),
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
order.connectCancellation(checkout.cancellation);
const crm = createCrmModule({
  transactions,
  customers: customer.operations,
  orders: order.operations,
  staffTokenVerifier,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
});
const support = createSupportModule({
  transactions,
  customers: customer.operations,
  orders: order.operations,
  staffTokenVerifier,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
  attachmentStorage: new MinioSupportAttachmentStorage(minio, environment.minioSupportBucket),
  attachmentScanner: new ClamdSupportAttachmentScanner(environment.clamavHost, environment.clamavPort, environment.clamavTimeoutMs),
  escalationIntervalMs: environment.supportEscalationIntervalSeconds * 1_000,
  attachmentScanIntervalMs: environment.supportAttachmentScanIntervalSeconds * 1_000,
  attachmentRetentionIntervalMs: environment.supportAttachmentRetentionIntervalSeconds * 1_000,
});
const reporting = createReportingModule({
  database: pool,
  staffTokenVerifier,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
});
const currentTime = () => new Date().toISOString();
const marketing = createMarketingModule({
  database: pool,
  staffTokenVerifier,
  generateId: randomUUID,
  now: currentTime,
});
const orderHealth = createOrderHealthReader({ transactions, now: currentTime });
const supportHealth = createSupportHealthReader({
  transactions,
  orders: orderHealth,
  now: currentTime,
});
const toolAdapters = createFixedDepartmentToolAdapterRegistry({
  catalog: createCatalogHealthReader(transactions, currentTime),
  inventory: createInventoryHealthReader({ transactions, analytics, now: currentTime }),
  order: orderHealth,
  finance: createPaymentHealthReader({ transactions, now: currentTime }),
  crm: createCrmHealthReader({ transactions, analytics, now: currentTime }),
  support: supportHealth,
  marketingRepository: marketing.repository,
}, currentTime, environment.agentic.controlClientSecret);
const agentic = createAgenticModule({
  transactions,
  staffTokenVerifier,
  workloadTokenVerifier,
  workflowGateway,
  generateId: randomUUID,
  now: () => new Date().toISOString(),
  workflowApprovalTtlMs: 60 * 60 * 1_000,
  dispatcherIntervalMs: environment.agentic.dispatcherIntervalMs,
  dispatcherBatchSize: environment.agentic.dispatcherBatchSize,
  fileLifecycleIntervalMs: environment.agentic.fileLifecycleIntervalMs,
  fileLifecycleBatchSize: environment.agentic.fileLifecycleBatchSize,
  onDispatcherError: (error) => console.error("Agentic workflow dispatch failed", error),
  executionEnabled: environment.agentic.executionEnabled,
  toolAdapters,
  agenticFileStorage: new MinioAgenticFileStorage(minio, environment.minioBucket),
  agenticFileScanner: new ClamdAgenticFileScanner(environment.clamavHost, environment.clamavPort, environment.clamavTimeoutMs),
  agenticFileParser: new BoundedAgenticFileParser(),
  logger,
  ...(metrics === undefined ? {} : { metrics }),
  monotonicNow: performance.now.bind(performance),
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
  crmAdminRouter: crm.router,
  supportAdminRouter: support.router,
  reportingAdminRouter: reporting.router,
  agenticAdminRouter: agentic.adminRouter,
  agenticInternalRouter: agentic.internalRouter,
  agenticToolRouter: agentic.toolRouter,
  marketingAdminRouter: marketing.adminRouter,
  sepayWebhookRouter: paymentOperations.webhookRouter,
  jsonBodyLimit: environment.jsonBodyLimit,
  readinessTimeoutMs: environment.readinessTimeoutMs,
  logger,
  ...(metrics === undefined ? {} : { metrics, metricsPath: environment.metrics.path }),
  readiness: async () => ({
    postgres: await probe(async () => { await pool.query("SELECT 1"); }),
    migrations: await probe(() => assertRequiredMigrations(pool)),
    keycloak: await probe(async () => {
      const response = await fetch(environment.keycloakJwksUrl);
      if (!response.ok) throw new Error("Keycloak JWKS is unavailable");
    }),
    minio: await probe(async () => {
      if (!(await minio.bucketExists(environment.minioBucket))) {
        throw new Error("Product media bucket is unavailable");
      }
      if (!(await minio.bucketExists(environment.minioSupportBucket))) {
        throw new Error("Support attachment bucket is unavailable");
      }
    }),
    clamav: await probe(() => pingClamav(environment.clamavHost, environment.clamavPort, environment.clamavTimeoutMs)),
    ...(agentic.readiness === undefined
      ? {}
      : { agenticWorkflow: await probe(agentic.readiness) }),
  }),
});

const server = app.listen(environment.apiPort, () => {
  console.log(`OpenDX API listening on http://localhost:${environment.apiPort}`);
  inventory.expiryWorker.start();
  checkout.expiryWorker.start();
  if (environment.sepay.configured) paymentOperations.reconciliationWorker.start();
  support.escalationWorker.start();
  support.attachmentScanWorker.start();
  support.attachmentRetentionWorker.start();
  if (agentic.readiness !== undefined) agentic.dispatcher.start();
  agentic.fileLifecycleWorker?.start();
  marketing.publisherWorker.start();
});

function shutdown(signal: NodeJS.Signals): void {
  void shutdownGracefully(signal);
}

let shutdownStarted = false;

async function shutdownGracefully(signal: NodeJS.Signals): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.info(`Received ${signal}; shutting down`);
  setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000).unref();
  inventory.expiryWorker.stop();
  checkout.expiryWorker.stop();
  paymentOperations.reconciliationWorker.stop();
  support.escalationWorker.stop();
  support.attachmentScanWorker.stop();
  support.attachmentRetentionWorker.stop();
  marketing.publisherWorker.stop();
  await agentic.dispatcher.stop();
  agentic.fileLifecycleWorker?.stop();
  const closeError = await new Promise<Error | undefined>((resolve) => {
    server.close((error) => resolve(error));
  });
  await pool.end();
  await analyticsPool.end();
  if (closeError !== undefined) {
    console.error("HTTP server shutdown failed", closeError);
    process.exit(1);
  }
  process.exit(0);
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

async function pingClamav(host: string, port: number, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("ClamAV readiness timed out"));
    }, timeoutMs);
    socket.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("data", chunk => {
      const response = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      clearTimeout(timer);
      socket.destroy();
      response.includes("PONG") ? resolve() : reject(new Error("ClamAV readiness failed"));
    });
    socket.on("connect", () => socket.write("zPING\0"));
  });
}
