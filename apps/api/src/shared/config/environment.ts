// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const positiveInteger = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());

const optionalSecret = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const bodyLimit = z
  .string()
  .trim()
  .regex(/^\d+(b|kb|mb)$/i);
const optionalProductionConfirmation = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().optional(),
);
const forbiddenExampleHostnames = new Set([
  "shop.example.com",
  "console.example.com",
  "api.example.com",
  "auth.example.com",
  "storage.example.com",
]);

const SEPAY_SANDBOX_CHECKOUT_URL = "https://pay-sandbox.sepay.vn/v1/checkout/init";
const SEPAY_SANDBOX_API_URL = "https://pgapi-sandbox.sepay.vn";
const SEPAY_PRODUCTION_CHECKOUT_URL = "https://pay.sepay.vn/v1/checkout/init";
const SEPAY_PRODUCTION_API_URL = "https://pgapi.sepay.vn";
const placeholderSecret = /(?:change|replace)[_-]?me|changeme|example[_-]?secret/i;

const apiEnvironmentSchema = z.object({
  OPENDX_ENV: z.enum(["development", "test", "production"]),
  API_PORT: positiveInteger.pipe(z.number().max(65_535)),
  DATABASE_URL: z.url().refine((value) => value.startsWith("postgres"), {
    message: "must be a PostgreSQL URL",
  }),
  AGENTIC_ANALYTICS_DATABASE_URL: z.url()
    .refine((value) => value.startsWith("postgres"), { message: "must be a PostgreSQL URL" })
    .refine((value) => new URL(value).username === "opendx_agentic_reader", {
      message: "must use the opendx_agentic_reader role",
    }),
  CONSOLE_ORIGIN: z.url(),
  STOREFRONT_ORIGIN: z.url().default("http://localhost:3100"),
  GOOGLE_CLIENT_ID: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
  CUSTOMER_COOKIE_NAME: z.string().trim().min(1).default("opendx_customer"),
  GUEST_COOKIE_NAME: z.string().trim().min(1).default("opendx_guest"),
  CSRF_COOKIE_NAME: z.string().trim().min(1).default("opendx_csrf"),
  COOKIE_SECURE: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  CUSTOMER_SESSION_TTL_SECONDS: positiveInteger.default(2592000).refine((value) => value === 2592000),
  GUEST_SESSION_TTL_SECONDS: positiveInteger.default(604800).refine((value) => value === 604800),
  AUTH_RATE_LIMIT: positiveInteger.default(20),
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_JWKS_URL: z.url().optional(),
  KEYCLOAK_AUDIENCE: z.string().trim().min(1),
  KEYCLOAK_TOKEN_URL: z.url(),
  AGENTIC_CONTROL_CLIENT_ID: z.string().trim().min(1),
  AGENTIC_CONTROL_CLIENT_SECRET: z.string().min(1),
  AGENT_CATALOG_CLIENT_SECRET: z.string().min(1),
  AGENT_INVENTORY_CLIENT_SECRET: z.string().min(1),
  AGENT_ORDER_CLIENT_SECRET: z.string().min(1),
  AGENT_FINANCE_CLIENT_SECRET: z.string().min(1),
  AGENT_CRM_CLIENT_SECRET: z.string().min(1),
  AGENT_SUPPORT_CLIENT_SECRET: z.string().min(1),
  AGENTIC_CONTROL_AUDIENCE: z.string().trim().min(1),
  AI_RUNTIME_INTERNAL_URL: z.url(),
  AGENTIC_EXECUTION_ENABLED: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  WORKFLOW_GATEWAY_TIMEOUT_MS: positiveInteger.pipe(z.number().int().min(500).max(30_000)),
  WORKFLOW_DISPATCHER_INTERVAL_MS: positiveInteger.pipe(z.number().int().min(100).max(60_000)),
  WORKFLOW_DISPATCHER_BATCH_SIZE: positiveInteger.pipe(z.number().int().max(1_000)),
  MINIO_ENDPOINT: z.url(),
  MINIO_ACCESS_KEY: z.string().trim().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().trim().min(1),
  MINIO_SUPPORT_BUCKET: z.string().trim().min(1).default("support-attachments"),
  MEDIA_MAX_BYTES: positiveInteger,
  CLAMAV_HOST: z.string().trim().min(1).default("clamav"),
  CLAMAV_PORT: positiveInteger.pipe(z.number().int().max(65_535)).default(3310),
  CLAMAV_TIMEOUT_SECONDS: positiveInteger.pipe(z.number().int().min(1).max(60)).default(30),
  SUPPORT_ATTACHMENT_SCAN_INTERVAL_SECONDS: positiveInteger.default(30),
  SUPPORT_ESCALATION_INTERVAL_SECONDS: positiveInteger.default(30),
  SUPPORT_ATTACHMENT_RETENTION_INTERVAL_SECONDS: positiveInteger.default(3600),
  INVENTORY_RESERVATION_TTL_SECONDS: positiveInteger.default(900).refine(
    (value) => value === 900,
    { message: "must equal 900" },
  ),
  INVENTORY_EXPIRY_INTERVAL_SECONDS: positiveInteger.default(30).pipe(
    z.number().int().min(5).max(300),
  ),
  CHECKOUT_TTL_SECONDS: positiveInteger.default(900).refine(
    (value) => value === 900,
    { message: "must equal 900" },
  ),
  CHECKOUT_EXPIRY_INTERVAL_SECONDS: positiveInteger.default(30).pipe(
    z.number().int().min(5).max(300),
  ),
  SEPAY_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  SEPAY_CHECKOUT_URL: z.url().optional(),
  SEPAY_API_BASE_URL: z.url().optional(),
  SEPAY_MERCHANT_ID: optionalSecret,
  SEPAY_SECRET_KEY: optionalSecret,
  SEPAY_IPN_SECRET: optionalSecret,
  SEPAY_SUCCESS_URL: z.url().optional(),
  SEPAY_ERROR_URL: z.url().optional(),
  SEPAY_CANCEL_URL: z.url().optional(),
  SEPAY_REQUEST_TIMEOUT_MS: positiveInteger.default(5000).pipe(
    z.number().int().min(500).max(30_000),
  ),
  PAYMENT_RECONCILIATION_INTERVAL_SECONDS: positiveInteger.default(60).pipe(
    z.number().int().min(10).max(3_600),
  ),
  LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  METRICS_ENABLED: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  METRICS_PATH: z.string().trim().regex(/^\/[a-z0-9/_-]*$/i).default("/metrics"),
  READINESS_TIMEOUT_MS: positiveInteger.pipe(z.number().int().min(250).max(10_000)).default(2_000),
  JSON_BODY_LIMIT: bodyLimit.default("1mb"),
  PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND: positiveInteger.default(10_000),
  PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION: optionalProductionConfirmation,
}).superRefine((value, context) => {
  const departmentSecrets = [
    ["AGENT_CATALOG_CLIENT_SECRET", value.AGENT_CATALOG_CLIENT_SECRET],
    ["AGENT_INVENTORY_CLIENT_SECRET", value.AGENT_INVENTORY_CLIENT_SECRET],
    ["AGENT_ORDER_CLIENT_SECRET", value.AGENT_ORDER_CLIENT_SECRET],
    ["AGENT_FINANCE_CLIENT_SECRET", value.AGENT_FINANCE_CLIENT_SECRET],
    ["AGENT_CRM_CLIENT_SECRET", value.AGENT_CRM_CLIENT_SECRET],
    ["AGENT_SUPPORT_CLIENT_SECRET", value.AGENT_SUPPORT_CLIENT_SECRET],
  ] as const;
  const seenSecrets = new Map<string, string>([
    [value.AGENTIC_CONTROL_CLIENT_SECRET, "AGENTIC_CONTROL_CLIENT_SECRET"],
  ]);
  for (const [field, secret] of departmentSecrets) {
    if (seenSecrets.has(secret)) {
      context.addIssue({ code: "custom", path: [field], message: "must be distinct from every Agentic client secret" });
    }
    seenSecrets.set(secret, field);
    if (value.OPENDX_ENV === "production" && placeholderSecret.test(secret)) {
      context.addIssue({ code: "custom", path: [field], message: "must not be a placeholder secret" });
    }
  }
  const credentialFields = [
    ["SEPAY_MERCHANT_ID", value.SEPAY_MERCHANT_ID],
    ["SEPAY_SECRET_KEY", value.SEPAY_SECRET_KEY],
    ["SEPAY_IPN_SECRET", value.SEPAY_IPN_SECRET],
  ] as const;
  const configuredCredentialCount = credentialFields.filter(([, credential]) => credential !== undefined).length;
  if (configuredCredentialCount > 0 && configuredCredentialCount < credentialFields.length) {
    for (const [field, credential] of credentialFields) {
      if (credential === undefined) {
        context.addIssue({ code: "custom", path: [field], message: "is required when SePay is configured" });
      }
    }
  }
  if (value.MINIO_SUPPORT_BUCKET === value.MINIO_BUCKET) {
    context.addIssue({ code: "custom", path: ["MINIO_SUPPORT_BUCKET"], message: "must be distinct from MINIO_BUCKET" });
  }

  if (value.OPENDX_ENV !== "production") return;
  const runtimeUrl = new URL(value.AI_RUNTIME_INTERNAL_URL);
  if (runtimeUrl.protocol !== "https:" && !(runtimeUrl.protocol === "http:" && runtimeUrl.hostname === "ai-runtime")) {
    context.addIssue({ code: "custom", path: ["AI_RUNTIME_INTERNAL_URL"], message: "must use HTTPS or the approved Docker hostname" });
  }
  const tokenUrl = new URL(value.KEYCLOAK_TOKEN_URL);
  if (tokenUrl.protocol !== "https:" && !(tokenUrl.protocol === "http:" && tokenUrl.hostname === "keycloak")) {
    context.addIssue({ code: "custom", path: ["KEYCLOAK_TOKEN_URL"], message: "must use HTTPS or the approved Docker hostname" });
  }
  for (const [field, rawUrl] of [
    ["CONSOLE_ORIGIN", value.CONSOLE_ORIGIN],
    ["STOREFRONT_ORIGIN", value.STOREFRONT_ORIGIN],
    ["KEYCLOAK_ISSUER", value.KEYCLOAK_ISSUER],
    ["MINIO_ENDPOINT", value.MINIO_ENDPOINT],
  ] as const) {
    const hostname = new URL(rawUrl).hostname;
    if (forbiddenExampleHostnames.has(hostname)) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: "must not use a placeholder production domain",
      });
    }
  }
  if (!value.COOKIE_SECURE) {
    context.addIssue({
      code: "custom",
      path: ["COOKIE_SECURE"],
      message: "must be true in production",
    });
  }
  if (!value.STOREFRONT_ORIGIN.startsWith("https://")) {
    context.addIssue({
      code: "custom",
      path: ["STOREFRONT_ORIGIN"],
      message: "must use HTTPS in production",
    });
  }
  if (value.SEPAY_ENVIRONMENT !== "production") {
    context.addIssue({ code: "custom", path: ["SEPAY_ENVIRONMENT"], message: "must be production" });
  }
  for (const [field, credential] of credentialFields) {
    if (credential === undefined) {
      context.addIssue({ code: "custom", path: [field], message: "is required in production" });
    }
  }
  if (value.SEPAY_CHECKOUT_URL !== SEPAY_PRODUCTION_CHECKOUT_URL) {
    context.addIssue({ code: "custom", path: ["SEPAY_CHECKOUT_URL"], message: "must use the SePay production checkout endpoint" });
  }
  if (value.SEPAY_API_BASE_URL !== SEPAY_PRODUCTION_API_URL) {
    context.addIssue({ code: "custom", path: ["SEPAY_API_BASE_URL"], message: "must use the SePay production API endpoint" });
  }
  for (const [field, url] of [
    ["SEPAY_SUCCESS_URL", value.SEPAY_SUCCESS_URL],
    ["SEPAY_ERROR_URL", value.SEPAY_ERROR_URL],
    ["SEPAY_CANCEL_URL", value.SEPAY_CANCEL_URL],
  ] as const) {
    if (url === undefined || !url.startsWith("https://")) {
      context.addIssue({ code: "custom", path: [field], message: "must use HTTPS in production" });
    }
  }
});

interface SePayConfigurationBase {
  readonly environment: "sandbox" | "production";
  readonly checkoutUrl: string;
  readonly apiBaseUrl: string;
  readonly successUrl: string;
  readonly errorUrl: string;
  readonly cancelUrl: string;
  readonly requestTimeoutMs: number;
}

export type SePayConfiguration = SePayConfigurationBase & (
  | { readonly configured: false }
  | {
      readonly configured: true;
      readonly merchantId: string;
      readonly secretKey: string;
      readonly ipnSecret: string;
    }
);

export interface ApiEnvironment {
  readonly environment: "development" | "test" | "production";
  readonly apiPort: number;
  readonly databaseUrl: string;
  readonly agenticAnalyticsDatabaseUrl: string;
  readonly consoleOrigin: string;
  readonly storefrontOrigin: string;
  readonly googleClientId?: string;
  readonly customerCookieName: string;
  readonly guestCookieName: string;
  readonly csrfCookieName: string;
  readonly cookieSecure: boolean;
  readonly customerSessionTtlSeconds: number;
  readonly guestSessionTtlSeconds: number;
  readonly authenticationRateLimit: number;
  readonly keycloakIssuer: string;
  readonly keycloakJwksUrl: string;
  readonly keycloakAudience: string;
  readonly agentic: {
    readonly executionEnabled: boolean;
    readonly tokenUrl: string;
    readonly controlClientId: string;
    readonly controlClientSecret: string;
    readonly controlAudience: string;
    readonly runtimeUrl: string;
    readonly gatewayTimeoutMs: number;
    readonly dispatcherIntervalMs: number;
    readonly dispatcherBatchSize: number;
    readonly departmentClientSecrets: {
      readonly catalog: string;
      readonly inventory: string;
      readonly order: string;
      readonly finance: string;
      readonly crm: string;
      readonly support: string;
    };
  };
  readonly minioEndpoint: string;
  readonly minioAccessKey: string;
  readonly minioSecretKey: string;
  readonly minioBucket: string;
  readonly minioSupportBucket: string;
  readonly mediaMaxBytes: number;
  readonly clamavHost: string;
  readonly clamavPort: number;
  readonly clamavTimeoutMs: number;
  readonly supportAttachmentScanIntervalSeconds: number;
  readonly supportEscalationIntervalSeconds: number;
  readonly supportAttachmentRetentionIntervalSeconds: number;
  readonly inventoryReservationTtlSeconds: number;
  readonly inventoryExpiryIntervalSeconds: number;
  readonly checkoutTtlSeconds: number;
  readonly checkoutExpiryIntervalSeconds: number;
  readonly paymentReconciliationIntervalSeconds: number;
  readonly logging: {
    readonly format: "pretty" | "json";
    readonly level: "debug" | "info" | "warn" | "error";
  };
  readonly metrics: {
    readonly enabled: boolean;
    readonly path: string;
  };
  readonly readinessTimeoutMs: number;
  readonly jsonBodyLimit: string;
  readonly productionSePayAcceptance: {
    readonly amountVnd: number;
    readonly confirmation?: string;
  };
  readonly sepay: SePayConfiguration;
}

export function parseApiEnvironment(
  source: Record<string, string | undefined>,
): ApiEnvironment {
  const value = apiEnvironmentSchema.parse(source);
  const checkoutUrl = value.SEPAY_CHECKOUT_URL ?? (
    value.SEPAY_ENVIRONMENT === "production"
      ? SEPAY_PRODUCTION_CHECKOUT_URL
      : SEPAY_SANDBOX_CHECKOUT_URL
  );
  const apiBaseUrl = value.SEPAY_API_BASE_URL ?? (
    value.SEPAY_ENVIRONMENT === "production"
      ? SEPAY_PRODUCTION_API_URL
      : SEPAY_SANDBOX_API_URL
  );
  const returnBase = `${value.STOREFRONT_ORIGIN.replace(/\/$/, "")}/payment/return`;
  const credentials = value.SEPAY_MERCHANT_ID !== undefined &&
    value.SEPAY_SECRET_KEY !== undefined && value.SEPAY_IPN_SECRET !== undefined
    ? {
        configured: true as const,
        merchantId: value.SEPAY_MERCHANT_ID,
        secretKey: value.SEPAY_SECRET_KEY,
        ipnSecret: value.SEPAY_IPN_SECRET,
      }
    : { configured: false as const };

  return {
    environment: value.OPENDX_ENV,
    apiPort: value.API_PORT,
    databaseUrl: value.DATABASE_URL,
    agenticAnalyticsDatabaseUrl: value.AGENTIC_ANALYTICS_DATABASE_URL,
    consoleOrigin: value.CONSOLE_ORIGIN,
    storefrontOrigin: value.STOREFRONT_ORIGIN,
    ...(value.GOOGLE_CLIENT_ID === undefined ? {} : { googleClientId: value.GOOGLE_CLIENT_ID }),
    customerCookieName: value.CUSTOMER_COOKIE_NAME,
    guestCookieName: value.GUEST_COOKIE_NAME,
    csrfCookieName: value.CSRF_COOKIE_NAME,
    cookieSecure: value.COOKIE_SECURE,
    customerSessionTtlSeconds: value.CUSTOMER_SESSION_TTL_SECONDS,
    guestSessionTtlSeconds: value.GUEST_SESSION_TTL_SECONDS,
    authenticationRateLimit: value.AUTH_RATE_LIMIT,
    keycloakIssuer: value.KEYCLOAK_ISSUER,
    keycloakJwksUrl:
      value.KEYCLOAK_JWKS_URL ??
      `${value.KEYCLOAK_ISSUER.replace(/\/$/, "")}/protocol/openid-connect/certs`,
    keycloakAudience: value.KEYCLOAK_AUDIENCE,
    agentic: {
      executionEnabled: value.AGENTIC_EXECUTION_ENABLED,
      tokenUrl: value.KEYCLOAK_TOKEN_URL,
      controlClientId: value.AGENTIC_CONTROL_CLIENT_ID,
      controlClientSecret: value.AGENTIC_CONTROL_CLIENT_SECRET,
      controlAudience: value.AGENTIC_CONTROL_AUDIENCE,
      runtimeUrl: value.AI_RUNTIME_INTERNAL_URL,
      gatewayTimeoutMs: value.WORKFLOW_GATEWAY_TIMEOUT_MS,
      dispatcherIntervalMs: value.WORKFLOW_DISPATCHER_INTERVAL_MS,
      dispatcherBatchSize: value.WORKFLOW_DISPATCHER_BATCH_SIZE,
      departmentClientSecrets: {
        catalog: value.AGENT_CATALOG_CLIENT_SECRET,
        inventory: value.AGENT_INVENTORY_CLIENT_SECRET,
        order: value.AGENT_ORDER_CLIENT_SECRET,
        finance: value.AGENT_FINANCE_CLIENT_SECRET,
        crm: value.AGENT_CRM_CLIENT_SECRET,
        support: value.AGENT_SUPPORT_CLIENT_SECRET,
      },
    },
    minioEndpoint: value.MINIO_ENDPOINT,
    minioAccessKey: value.MINIO_ACCESS_KEY,
    minioSecretKey: value.MINIO_SECRET_KEY,
    minioBucket: value.MINIO_BUCKET,
    minioSupportBucket: value.MINIO_SUPPORT_BUCKET,
    mediaMaxBytes: value.MEDIA_MAX_BYTES,
    clamavHost: value.CLAMAV_HOST,
    clamavPort: value.CLAMAV_PORT,
    clamavTimeoutMs: value.CLAMAV_TIMEOUT_SECONDS * 1_000,
    supportAttachmentScanIntervalSeconds: value.SUPPORT_ATTACHMENT_SCAN_INTERVAL_SECONDS,
    supportEscalationIntervalSeconds: value.SUPPORT_ESCALATION_INTERVAL_SECONDS,
    supportAttachmentRetentionIntervalSeconds: value.SUPPORT_ATTACHMENT_RETENTION_INTERVAL_SECONDS,
    inventoryReservationTtlSeconds: value.INVENTORY_RESERVATION_TTL_SECONDS,
    inventoryExpiryIntervalSeconds: value.INVENTORY_EXPIRY_INTERVAL_SECONDS,
    checkoutTtlSeconds: value.CHECKOUT_TTL_SECONDS,
    checkoutExpiryIntervalSeconds: value.CHECKOUT_EXPIRY_INTERVAL_SECONDS,
    paymentReconciliationIntervalSeconds:
      value.PAYMENT_RECONCILIATION_INTERVAL_SECONDS,
    logging: {
      format: value.LOG_FORMAT,
      level: value.LOG_LEVEL,
    },
    metrics: {
      enabled: value.METRICS_ENABLED,
      path: value.METRICS_PATH,
    },
    readinessTimeoutMs: value.READINESS_TIMEOUT_MS,
    jsonBodyLimit: value.JSON_BODY_LIMIT,
    productionSePayAcceptance: {
      amountVnd: value.PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND,
      ...(value.PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION === undefined
        ? {}
        : { confirmation: value.PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION }),
    },
    sepay: {
      environment: value.SEPAY_ENVIRONMENT,
      checkoutUrl,
      apiBaseUrl,
      successUrl: value.SEPAY_SUCCESS_URL ?? `${returnBase}?outcome=success`,
      errorUrl: value.SEPAY_ERROR_URL ?? `${returnBase}?outcome=error`,
      cancelUrl: value.SEPAY_CANCEL_URL ?? `${returnBase}?outcome=cancel`,
      requestTimeoutMs: value.SEPAY_REQUEST_TIMEOUT_MS,
      ...credentials,
    },
  };
}
