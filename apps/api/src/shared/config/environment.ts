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

const SEPAY_SANDBOX_CHECKOUT_URL = "https://pay-sandbox.sepay.vn/v1/checkout/init";
const SEPAY_SANDBOX_API_URL = "https://pgapi-sandbox.sepay.vn";
const SEPAY_PRODUCTION_CHECKOUT_URL = "https://pay.sepay.vn/v1/checkout/init";
const SEPAY_PRODUCTION_API_URL = "https://pgapi.sepay.vn";

const apiEnvironmentSchema = z.object({
  OPENDX_ENV: z.enum(["development", "test", "production"]),
  API_PORT: positiveInteger.pipe(z.number().max(65_535)),
  DATABASE_URL: z.url().refine((value) => value.startsWith("postgres"), {
    message: "must be a PostgreSQL URL",
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
  MINIO_ENDPOINT: z.url(),
  MINIO_ACCESS_KEY: z.string().trim().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().trim().min(1),
  MEDIA_MAX_BYTES: positiveInteger,
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
}).superRefine((value, context) => {
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

  if (value.OPENDX_ENV !== "production") return;
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
  readonly minioEndpoint: string;
  readonly minioAccessKey: string;
  readonly minioSecretKey: string;
  readonly minioBucket: string;
  readonly mediaMaxBytes: number;
  readonly inventoryReservationTtlSeconds: number;
  readonly inventoryExpiryIntervalSeconds: number;
  readonly checkoutTtlSeconds: number;
  readonly checkoutExpiryIntervalSeconds: number;
  readonly paymentReconciliationIntervalSeconds: number;
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
    minioEndpoint: value.MINIO_ENDPOINT,
    minioAccessKey: value.MINIO_ACCESS_KEY,
    minioSecretKey: value.MINIO_SECRET_KEY,
    minioBucket: value.MINIO_BUCKET,
    mediaMaxBytes: value.MEDIA_MAX_BYTES,
    inventoryReservationTtlSeconds: value.INVENTORY_RESERVATION_TTL_SECONDS,
    inventoryExpiryIntervalSeconds: value.INVENTORY_EXPIRY_INTERVAL_SECONDS,
    checkoutTtlSeconds: value.CHECKOUT_TTL_SECONDS,
    checkoutExpiryIntervalSeconds: value.CHECKOUT_EXPIRY_INTERVAL_SECONDS,
    paymentReconciliationIntervalSeconds:
      value.PAYMENT_RECONCILIATION_INTERVAL_SECONDS,
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
