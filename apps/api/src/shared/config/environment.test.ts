// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseApiEnvironment } from "./environment";

const validSource = {
  OPENDX_ENV: "test",
  API_PORT: "4000",
  DATABASE_URL: "postgres://opendx:secret@postgres:5432/opendx",
  CONSOLE_ORIGIN: "http://localhost:3000",
  KEYCLOAK_ISSUER: "http://keycloak:8080/realms/opendx",
  KEYCLOAK_AUDIENCE: "opendx-api",
  MINIO_ENDPOINT: "http://minio:9000",
  MINIO_ACCESS_KEY: "opendx_minio",
  MINIO_SECRET_KEY: "local-only-secret",
  MINIO_BUCKET: "product-media",
  MEDIA_MAX_BYTES: "10485760",
} as const;

describe("parseApiEnvironment", () => {
  it("returns typed runtime configuration", () => {
    const environment = parseApiEnvironment(validSource);

    expect(environment.apiPort).toBe(4000);
    expect(environment.databaseUrl).toBe(validSource.DATABASE_URL);
    expect(environment.mediaMaxBytes).toBe(10_485_760);
    expect(environment.inventoryReservationTtlSeconds).toBe(900);
    expect(environment.inventoryExpiryIntervalSeconds).toBe(30);
    expect(environment.checkoutTtlSeconds).toBe(900);
    expect(environment.paymentReconciliationIntervalSeconds).toBe(60);
    expect(environment.sepay).toMatchObject({
      environment: "sandbox",
      configured: false,
      checkoutUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
      apiBaseUrl: "https://pgapi-sandbox.sepay.vn",
      requestTimeoutMs: 5_000,
    });
    expect(environment.googleClientId).toBeUndefined();
  });

  it.each([
    ["DATABASE_URL", { DATABASE_URL: "" }],
    ["DATABASE_URL", { DATABASE_URL: "not-a-url" }],
    ["API_PORT", { API_PORT: "0" }],
    ["API_PORT", { API_PORT: "70000" }],
    ["MEDIA_MAX_BYTES", { MEDIA_MAX_BYTES: "0" }],
    ["INVENTORY_RESERVATION_TTL_SECONDS", { INVENTORY_RESERVATION_TTL_SECONDS: "600" }],
    ["INVENTORY_EXPIRY_INTERVAL_SECONDS", { INVENTORY_EXPIRY_INTERVAL_SECONDS: "4" }],
    ["CHECKOUT_TTL_SECONDS", { CHECKOUT_TTL_SECONDS: "600" }],
    ["SEPAY_REQUEST_TIMEOUT_MS", { SEPAY_REQUEST_TIMEOUT_MS: "499" }],
    ["PAYMENT_RECONCILIATION_INTERVAL_SECONDS", { PAYMENT_RECONCILIATION_INTERVAL_SECONDS: "9" }],
  ])("rejects invalid %s", (expectedKey, override) => {
    expect(() =>
      parseApiEnvironment({ ...validSource, ...override }),
    ).toThrow(expectedKey);
  });

  it("accepts a complete SePay sandbox configuration", () => {
    expect(parseApiEnvironment({
      ...validSource,
      SEPAY_MERCHANT_ID: "sandbox-merchant",
      SEPAY_SECRET_KEY: "sandbox-secret",
      SEPAY_IPN_SECRET: "sandbox-ipn-secret",
    }).sepay).toMatchObject({
      configured: true,
      merchantId: "sandbox-merchant",
      secretKey: "sandbox-secret",
      ipnSecret: "sandbox-ipn-secret",
    });
  });

  it("rejects partially configured SePay credentials", () => {
    expect(() => parseApiEnvironment({
      ...validSource,
      SEPAY_MERCHANT_ID: "sandbox-merchant",
    })).toThrow("SEPAY_SECRET_KEY");
  });

  it.each([
    ["COOKIE_SECURE", { OPENDX_ENV: "production", STOREFRONT_ORIGIN: "https://shop.example.com", COOKIE_SECURE: "false" }],
    ["STOREFRONT_ORIGIN", { OPENDX_ENV: "production", STOREFRONT_ORIGIN: "http://shop.example.com", COOKIE_SECURE: "true" }],
  ])("rejects unsafe production %s", (expectedKey, override) => {
    expect(() => parseApiEnvironment({ ...validSource, ...override })).toThrow(expectedKey);
  });

  it("accepts an HTTPS production storefront with secure cookies", () => {
    expect(parseApiEnvironment({
      ...validSource,
      OPENDX_ENV: "production",
      STOREFRONT_ORIGIN: "https://shop.example.com",
      COOKIE_SECURE: "true",
      GOOGLE_CLIENT_ID: "",
      SEPAY_ENVIRONMENT: "production",
      SEPAY_CHECKOUT_URL: "https://pay.sepay.vn/v1/checkout/init",
      SEPAY_API_BASE_URL: "https://pgapi.sepay.vn",
      SEPAY_MERCHANT_ID: "production-merchant",
      SEPAY_SECRET_KEY: "production-secret",
      SEPAY_IPN_SECRET: "production-ipn-secret",
      SEPAY_SUCCESS_URL: "https://shop.example.com/payment/return?outcome=success",
      SEPAY_ERROR_URL: "https://shop.example.com/payment/return?outcome=error",
      SEPAY_CANCEL_URL: "https://shop.example.com/payment/return?outcome=cancel",
    })).toMatchObject({
      environment: "production",
      storefrontOrigin: "https://shop.example.com",
      cookieSecure: true,
    });
  });

  it.each([
    ["SEPAY_MERCHANT_ID", { SEPAY_MERCHANT_ID: "" }],
    ["SEPAY_CHECKOUT_URL", { SEPAY_CHECKOUT_URL: "https://pay-sandbox.sepay.vn/v1/checkout/init" }],
    ["SEPAY_API_BASE_URL", { SEPAY_API_BASE_URL: "https://pgapi-sandbox.sepay.vn" }],
    ["SEPAY_SUCCESS_URL", { SEPAY_SUCCESS_URL: "http://shop.example.com/payment/return" }],
  ])("rejects unsafe production %s", (expectedKey, override) => {
    expect(() => parseApiEnvironment({
      ...validSource,
      OPENDX_ENV: "production",
      STOREFRONT_ORIGIN: "https://shop.example.com",
      COOKIE_SECURE: "true",
      SEPAY_ENVIRONMENT: "production",
      SEPAY_CHECKOUT_URL: "https://pay.sepay.vn/v1/checkout/init",
      SEPAY_API_BASE_URL: "https://pgapi.sepay.vn",
      SEPAY_MERCHANT_ID: "production-merchant",
      SEPAY_SECRET_KEY: "production-secret",
      SEPAY_IPN_SECRET: "production-ipn-secret",
      SEPAY_SUCCESS_URL: "https://shop.example.com/payment/return?outcome=success",
      SEPAY_ERROR_URL: "https://shop.example.com/payment/return?outcome=error",
      SEPAY_CANCEL_URL: "https://shop.example.com/payment/return?outcome=cancel",
      ...override,
    })).toThrow(expectedKey);
  });
});
