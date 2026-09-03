// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const positiveInteger = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
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
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);
const forbiddenExampleHostnames = new Set([
  "shop.example.com",
  "console.example.com",
  "api.example.com",
  "auth.example.com",
  "storage.example.com",
]);
const reservedDocumentationDomains = ["example.com", "example.net", "example.org"] as const;

function isReservedDocumentationHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return reservedDocumentationDomains.some(
    (domain) => normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`),
  );
}

function parseIpv4Literal(hostname: string): number | undefined {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    !octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
  ) {
    return undefined;
  }

  return octets.reduce((address, octet) => ((address << 8) | octet) >>> 0, 0);
}

function isIpv4InCidr(address: number, network: string, prefixLength: number): boolean {
  const networkAddress = parseIpv4Literal(network);
  if (networkAddress === undefined) return false;
  const mask = prefixLength === 0 ? 0 : (0xffff_ffff << (32 - prefixLength)) >>> 0;
  return (address & mask) >>> 0 === (networkAddress & mask) >>> 0;
}

function parseIpv6Literal(hostname: string): bigint | undefined {
  if (hostname.includes(".")) return undefined;
  const halves = hostname.split("::");
  if (halves.length > 2) return undefined;

  const left = halves[0] === "" ? [] : halves[0]!.split(":");
  const right = halves.length === 1 || halves[1] === "" ? [] : halves[1]!.split(":");
  const missingSegmentCount = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missingSegmentCount !== 0) ||
    (halves.length === 2 && missingSegmentCount < 1)
  ) {
    return undefined;
  }

  const segments = [...left, ...Array<string>(missingSegmentCount).fill("0"), ...right];
  if (segments.some((segment) => !/^[a-f0-9]{1,4}$/i.test(segment))) return undefined;

  return segments.reduce(
    (address, segment) => (address << 16n) | BigInt(Number.parseInt(segment, 16)),
    0n,
  );
}

function isIpv6InCidr(address: bigint, network: string, prefixLength: number): boolean {
  const networkAddress = parseIpv6Literal(network);
  if (networkAddress === undefined) return false;
  const shift = BigInt(128 - prefixLength);
  return address >> shift === networkAddress >> shift;
}

function isPublicMediaHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local") ||
    isReservedDocumentationHostname(normalizedHostname)
  ) {
    return false;
  }

  const ipv4Address = parseIpv4Literal(normalizedHostname);
  if (ipv4Address !== undefined) {
    const nonPublicRanges = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.88.99.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ] as const;
    return !nonPublicRanges.some(([network, prefixLength]) =>
      isIpv4InCidr(ipv4Address, network, prefixLength),
    );
  }

  if (normalizedHostname.includes(":")) {
    const ipv6Address = parseIpv6Literal(normalizedHostname);
    if (ipv6Address === undefined) return false;
    if (!isIpv6InCidr(ipv6Address, "2000::", 3)) return false;
    const nonPublicRanges = [
      ["::", 128],
      ["::1", 128],
      ["::ffff:0:0", 96],
      ["64:ff9b::", 96],
      ["64:ff9b:1::", 48],
      ["100::", 64],
      ["2001::", 23],
      ["2001:db8::", 32],
      ["2002::", 16],
      ["3fff::", 20],
      ["5f00::", 16],
      ["fc00::", 7],
      ["fe80::", 10],
      ["fec0::", 10],
      ["ff00::", 8],
    ] as const;
    return !nonPublicRanges.some(([network, prefixLength]) =>
      isIpv6InCidr(ipv6Address, network, prefixLength),
    );
  }

  return true;
}

const SEPAY_SANDBOX_CHECKOUT_URL = "https://pay-sandbox.sepay.vn/v1/checkout/init";
const SEPAY_SANDBOX_API_URL = "https://pgapi-sandbox.sepay.vn";
const SEPAY_PRODUCTION_CHECKOUT_URL = "https://pay.sepay.vn/v1/checkout/init";
const SEPAY_PRODUCTION_API_URL = "https://pgapi.sepay.vn";

const apiEnvironmentSchema = z
  .object({
    OPENDX_ENV: z.enum(["development", "test", "production"]),
    API_PORT: positiveInteger.pipe(z.number().max(65_535)),
    DATABASE_URL: z.url().refine((value) => value.startsWith("postgres"), {
      message: "must be a PostgreSQL URL",
    }),
    AGENTIC_ANALYTICS_DATABASE_URL: z
      .url()
      .refine((value) => value.startsWith("postgres"), { message: "must be a PostgreSQL URL" })
      .refine((value) => new URL(value).username === "opendx_agentic_reader", {
        message: "must use the opendx_agentic_reader role",
      }),
    CONSOLE_ORIGIN: z.url(),
    STOREFRONT_ORIGIN: z.url().default("http://localhost:3100"),
    GOOGLE_CLIENT_ID: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
    CUSTOMER_COOKIE_NAME: z.string().trim().min(1).default("opendx_customer"),
    GUEST_COOKIE_NAME: z.string().trim().min(1).default("opendx_guest"),
    CSRF_COOKIE_NAME: z.string().trim().min(1).default("opendx_csrf"),
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default(false),
    CUSTOMER_SESSION_TTL_SECONDS: positiveInteger.default(2592000).refine((value) => value === 2592000),
    GUEST_SESSION_TTL_SECONDS: positiveInteger.default(604800).refine((value) => value === 604800),
    AUTH_RATE_LIMIT: positiveInteger.default(20),
    KEYCLOAK_ISSUER: z.url(),
    KEYCLOAK_JWKS_URL: z.url().optional(),
    KEYCLOAK_AUDIENCE: z.string().trim().min(1),
    KEYCLOAK_TOKEN_URL: z.url(),
    AGENTIC_CONTROL_CLIENT_ID: z.string().trim().min(1),
    AGENTIC_CONTROL_CLIENT_SECRET: z.string().min(1),
    AGENTIC_CONTROL_AUDIENCE: z.string().trim().min(1),
    AI_RUNTIME_INTERNAL_URL: z.url(),
    AGENTIC_EXECUTION_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default(false),
    WORKFLOW_GATEWAY_TIMEOUT_MS: positiveInteger.pipe(z.number().int().min(500).max(30_000)),
    WORKFLOW_DISPATCHER_INTERVAL_MS: positiveInteger.pipe(z.number().int().min(100).max(60_000)),
    WORKFLOW_DISPATCHER_BATCH_SIZE: positiveInteger.pipe(z.number().int().max(1_000)),
    AGENTIC_FILE_LIFECYCLE_INTERVAL_MS: positiveInteger.pipe(z.number().int().min(100).max(60_000)).default(30_000),
    AGENTIC_FILE_LIFECYCLE_BATCH_SIZE: positiveInteger.pipe(z.number().int().max(100)).default(20),
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
    SEPAY_CHECKOUT_URL: optionalUrl,
    SEPAY_API_BASE_URL: optionalUrl,
    SEPAY_MERCHANT_ID: optionalSecret,
    SEPAY_SECRET_KEY: optionalSecret,
    SEPAY_IPN_SECRET: optionalSecret,
    SEPAY_SUCCESS_URL: optionalUrl,
    SEPAY_ERROR_URL: optionalUrl,
    SEPAY_CANCEL_URL: optionalUrl,
    SEPAY_REQUEST_TIMEOUT_MS: positiveInteger.default(5000).pipe(
      z.number().int().min(500).max(30_000),
    ),
    PAYMENT_RECONCILIATION_INTERVAL_SECONDS: positiveInteger.default(60).pipe(
      z.number().int().min(10).max(3_600),
    ),
    MARKETING_PUBLICATION_POLL_INTERVAL_MS: positiveInteger
      .pipe(z.number().int().min(500).max(60_000))
      .default(5_000),
    MARKETING_TARGET_LEASE_SECONDS: positiveInteger
      .pipe(z.number().int().min(5).max(300))
      .default(30),
    META_GRAPH_BASE_URL: z.url().default("https://graph.facebook.com"),
    META_GRAPH_TIMEOUT_MS: positiveInteger
      .pipe(z.number().int().min(500).max(30_000))
      .default(10_000),
    FACEBOOK_PAGE_ID: optionalSecret,
    FACEBOOK_PAGE_ACCESS_TOKEN: optionalSecret,
    INSTAGRAM_PUBLICATION_MODE: z
      .enum(["disabled", "simulation", "live"])
      .default("simulation"),
    INSTAGRAM_ACCOUNT_CONFIGURATION_ID: z
      .string()
      .trim()
      .min(1)
      .default("instagram-local-simulation"),
    INSTAGRAM_BUSINESS_ACCOUNT_ID: optionalSecret,
    INSTAGRAM_ACCESS_TOKEN: optionalSecret,
    INSTAGRAM_PUBLIC_MEDIA_BASE_URL: optionalUrl,
    MARKETING_PUBLIC_MEDIA_SIGNING_SECRET: optionalSecret,
    MARKETING_PUBLIC_MEDIA_URL_TTL_SECONDS: positiveInteger
      .pipe(z.number().int().min(60).max(3_600))
      .default(900),
    MARKETING_INSTAGRAM_JPEG_QUALITY: positiveInteger
      .pipe(z.number().int().min(70).max(100))
      .default(90),
    MARKETING_PUBLIC_MEDIA_RATE_LIMIT: positiveInteger
      .pipe(z.number().int().min(1).max(1_000))
      .default(120),
    MARKETING_PUBLIC_MEDIA_RATE_WINDOW_MS: positiveInteger
      .pipe(z.number().int().min(1_000).max(3_600_000))
      .default(60_000),
    INSTAGRAM_CONTAINER_POLL_INTERVAL_MS: positiveInteger
      .pipe(z.number().int().min(1_000).max(60_000))
      .default(5_000),
    INSTAGRAM_CONTAINER_MAX_POLL_ATTEMPTS: positiveInteger
      .pipe(z.number().int().min(1).max(300))
      .default(60),
    LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    METRICS_ENABLED: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
    METRICS_PATH: z.string().trim().regex(/^\/[a-z0-9/_-]*$/i).default("/metrics"),
    READINESS_TIMEOUT_MS: positiveInteger.pipe(z.number().int().min(250).max(10_000)).default(2_000),
    JSON_BODY_LIMIT: bodyLimit.default("1mb"),
    PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND: positiveInteger.default(10_000),
    PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION: optionalProductionConfirmation,
  })
  .superRefine((value, context) => {
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

    if (value.INSTAGRAM_PUBLICATION_MODE === "live") {
      if (!value.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        context.addIssue({
          code: "custom",
          path: ["INSTAGRAM_BUSINESS_ACCOUNT_ID"],
          message: "is required when Instagram live mode is enabled",
        });
      }
      if (!value.INSTAGRAM_ACCESS_TOKEN) {
        context.addIssue({
          code: "custom",
          path: ["INSTAGRAM_ACCESS_TOKEN"],
          message: "is required when Instagram live mode is enabled",
        });
      }
      if (
        !value.MARKETING_PUBLIC_MEDIA_SIGNING_SECRET ||
        value.MARKETING_PUBLIC_MEDIA_SIGNING_SECRET.length < 32
      ) {
        context.addIssue({
          code: "custom",
          path: ["MARKETING_PUBLIC_MEDIA_SIGNING_SECRET"],
          message: "must contain at least 32 characters when Instagram live mode is enabled",
        });
      }
      if (
        !value.INSTAGRAM_PUBLIC_MEDIA_BASE_URL ||
        !value.INSTAGRAM_PUBLIC_MEDIA_BASE_URL.startsWith("https://")
      ) {
        context.addIssue({
          code: "custom",
          path: ["INSTAGRAM_PUBLIC_MEDIA_BASE_URL"],
          message: "must be an HTTPS URL when Instagram live mode is enabled",
        });
      } else if (!isPublicMediaHostname(new URL(value.INSTAGRAM_PUBLIC_MEDIA_BASE_URL).hostname)) {
        context.addIssue({
          code: "custom",
          path: ["INSTAGRAM_PUBLIC_MEDIA_BASE_URL"],
          message: "must use a publicly reachable media host",
        });
      }
    }

    if (value.OPENDX_ENV !== "production") return;

    if (value.INSTAGRAM_PUBLICATION_MODE === "simulation") {
      context.addIssue({
        code: "custom",
        path: ["INSTAGRAM_PUBLICATION_MODE"],
        message: "cannot be simulation in production",
      });
    }

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

export interface FacebookPublicationConfiguration {
  readonly pageId?: string;
  readonly pageAccessToken?: string;
}

export type InstagramPublicationConfiguration =
  | {
      readonly mode: "disabled";
    }
  | {
      readonly mode: "simulation";
      readonly accountConfigurationId: string;
    }
  | {
      readonly mode: "live";
      readonly accountConfigurationId: string;
      readonly businessAccountId: string;
      readonly accessToken: string;
      readonly publicMediaBaseUrl: string;
      readonly signingSecret: string;
      readonly urlTtlSeconds: number;
      readonly jpegQuality: number;
      readonly rateLimit: number;
      readonly rateWindowMs: number;
      readonly containerPollIntervalMs: number;
      readonly containerMaxPollAttempts: number;
    };

export interface MarketingPublicationConfiguration {
  readonly pollIntervalMs: number;
  readonly targetLeaseSeconds: number;
  readonly meta: {
    readonly graphBaseUrl: string;
    readonly requestTimeoutMs: number;
  };
  readonly facebook: FacebookPublicationConfiguration;
  readonly instagram: InstagramPublicationConfiguration;
}

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
    readonly fileLifecycleIntervalMs: number;
    readonly fileLifecycleBatchSize: number;
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
  readonly marketing: MarketingPublicationConfiguration;
  readonly logging: {
    readonly format: "pretty" | "json";
    readonly level: "debug" | "info" | "warn";
  } | {
    readonly format: "pretty" | "json";
    readonly level: "error";
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
      fileLifecycleIntervalMs: value.AGENTIC_FILE_LIFECYCLE_INTERVAL_MS,
      fileLifecycleBatchSize: value.AGENTIC_FILE_LIFECYCLE_BATCH_SIZE,
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
    marketing: {
      pollIntervalMs: value.MARKETING_PUBLICATION_POLL_INTERVAL_MS,
      targetLeaseSeconds: value.MARKETING_TARGET_LEASE_SECONDS,
      meta: {
        graphBaseUrl: value.META_GRAPH_BASE_URL,
        requestTimeoutMs: value.META_GRAPH_TIMEOUT_MS,
      },
      facebook: {
        ...(value.FACEBOOK_PAGE_ID !== undefined ? { pageId: value.FACEBOOK_PAGE_ID } : {}),
        ...(value.FACEBOOK_PAGE_ACCESS_TOKEN !== undefined
          ? { pageAccessToken: value.FACEBOOK_PAGE_ACCESS_TOKEN }
          : {}),
      },
      instagram:
        value.INSTAGRAM_PUBLICATION_MODE === "disabled"
          ? { mode: "disabled" }
          : value.INSTAGRAM_PUBLICATION_MODE === "live"
            ? {
                mode: "live",
                accountConfigurationId: value.INSTAGRAM_ACCOUNT_CONFIGURATION_ID,
                businessAccountId: value.INSTAGRAM_BUSINESS_ACCOUNT_ID!,
                accessToken: value.INSTAGRAM_ACCESS_TOKEN!,
                publicMediaBaseUrl: value.INSTAGRAM_PUBLIC_MEDIA_BASE_URL!,
                signingSecret: value.MARKETING_PUBLIC_MEDIA_SIGNING_SECRET!,
                urlTtlSeconds: value.MARKETING_PUBLIC_MEDIA_URL_TTL_SECONDS,
                jpegQuality: value.MARKETING_INSTAGRAM_JPEG_QUALITY,
                rateLimit: value.MARKETING_PUBLIC_MEDIA_RATE_LIMIT,
                rateWindowMs: value.MARKETING_PUBLIC_MEDIA_RATE_WINDOW_MS,
                containerPollIntervalMs: value.INSTAGRAM_CONTAINER_POLL_INTERVAL_MS,
                containerMaxPollAttempts: value.INSTAGRAM_CONTAINER_MAX_POLL_ATTEMPTS,
              }
            : {
                mode: "simulation",
                accountConfigurationId: value.INSTAGRAM_ACCOUNT_CONFIGURATION_ID,
              },
    },
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
