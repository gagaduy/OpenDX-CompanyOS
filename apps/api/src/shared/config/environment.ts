// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const positiveInteger = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());

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
}).superRefine((value, context) => {
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
});

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
}

export function parseApiEnvironment(
  source: Record<string, string | undefined>,
): ApiEnvironment {
  const value = apiEnvironmentSchema.parse(source);

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
  };
}
