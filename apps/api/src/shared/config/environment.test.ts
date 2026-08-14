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
  KEYCLOAK_TOKEN_URL: "http://keycloak:8080/realms/opendx/protocol/openid-connect/token",
  AGENTIC_CONTROL_CLIENT_ID: "opendx-agentic-control",
  AGENTIC_CONTROL_CLIENT_SECRET: "local-control-secret",
  AGENTIC_CONTROL_AUDIENCE: "opendx-ai-runtime",
  AI_RUNTIME_INTERNAL_URL: "http://ai-runtime:8000",
  AGENTIC_EXECUTION_ENABLED: "false",
  WORKFLOW_GATEWAY_TIMEOUT_MS: "5000",
  WORKFLOW_DISPATCHER_INTERVAL_MS: "5000",
  WORKFLOW_DISPATCHER_BATCH_SIZE: "20",
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
    expect(environment.checkoutExpiryIntervalSeconds).toBe(30);
    expect(environment.paymentReconciliationIntervalSeconds).toBe(60);
    expect(environment.clamavHost).toBe("clamav");
    expect(environment.clamavPort).toBe(3310);
    expect(environment.clamavTimeoutMs).toBe(30_000);
    expect(environment.supportAttachmentScanIntervalSeconds).toBe(30);
    expect(environment.supportEscalationIntervalSeconds).toBe(30);
    expect(environment.supportAttachmentRetentionIntervalSeconds).toBe(3_600);
    expect(environment.minioSupportBucket).toBe("support-attachments");
    expect(environment.sepay).toMatchObject({
      environment: "sandbox",
      configured: false,
      checkoutUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
      apiBaseUrl: "https://pgapi-sandbox.sepay.vn",
      requestTimeoutMs: 5_000,
    });
    expect(environment.googleClientId).toBeUndefined();
    expect(environment.agentic).toMatchObject({
      executionEnabled: false,
      controlClientId: "opendx-agentic-control",
      controlAudience: "opendx-ai-runtime",
      runtimeUrl: "http://ai-runtime:8000",
      gatewayTimeoutMs: 5_000,
      dispatcherIntervalMs: 5_000,
      dispatcherBatchSize: 20,
    });
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
    ["CHECKOUT_EXPIRY_INTERVAL_SECONDS", { CHECKOUT_EXPIRY_INTERVAL_SECONDS: "4" }],
    ["SEPAY_REQUEST_TIMEOUT_MS", { SEPAY_REQUEST_TIMEOUT_MS: "499" }],
    ["PAYMENT_RECONCILIATION_INTERVAL_SECONDS", { PAYMENT_RECONCILIATION_INTERVAL_SECONDS: "9" }],
    ["CLAMAV_HOST", { CLAMAV_HOST: "" }],
    ["CLAMAV_PORT", { CLAMAV_PORT: "0" }],
    ["CLAMAV_PORT", { CLAMAV_PORT: "70000" }],
    ["CLAMAV_TIMEOUT_SECONDS", { CLAMAV_TIMEOUT_SECONDS: "0" }],
    ["CLAMAV_TIMEOUT_SECONDS", { CLAMAV_TIMEOUT_SECONDS: "61" }],
    ["SUPPORT_ATTACHMENT_SCAN_INTERVAL_SECONDS", { SUPPORT_ATTACHMENT_SCAN_INTERVAL_SECONDS: "0" }],
    ["SUPPORT_ESCALATION_INTERVAL_SECONDS", { SUPPORT_ESCALATION_INTERVAL_SECONDS: "0" }],
    ["SUPPORT_ATTACHMENT_RETENTION_INTERVAL_SECONDS", { SUPPORT_ATTACHMENT_RETENTION_INTERVAL_SECONDS: "0" }],
    ["MINIO_SUPPORT_BUCKET", { MINIO_SUPPORT_BUCKET: "product-media" }],
    ["AGENTIC_CONTROL_CLIENT_SECRET", { AGENTIC_CONTROL_CLIENT_SECRET: "" }],
    ["WORKFLOW_GATEWAY_TIMEOUT_MS", { WORKFLOW_GATEWAY_TIMEOUT_MS: "499" }],
    ["WORKFLOW_DISPATCHER_INTERVAL_MS", { WORKFLOW_DISPATCHER_INTERVAL_MS: "99" }],
    ["WORKFLOW_DISPATCHER_BATCH_SIZE", { WORKFLOW_DISPATCHER_BATCH_SIZE: "1001" }],
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
      CONSOLE_ORIGIN: "https://console.novacommerce.local",
      STOREFRONT_ORIGIN: "https://shop.novacommerce.local",
      COOKIE_SECURE: "true",
      GOOGLE_CLIENT_ID: "",
      KEYCLOAK_ISSUER: "https://auth.novacommerce.local/realms/opendx",
      KEYCLOAK_JWKS_URL:
        "https://auth.novacommerce.local/realms/opendx/protocol/openid-connect/certs",
      MINIO_ENDPOINT: "https://storage.novacommerce.local",
      SEPAY_ENVIRONMENT: "production",
      SEPAY_CHECKOUT_URL: "https://pay.sepay.vn/v1/checkout/init",
      SEPAY_API_BASE_URL: "https://pgapi.sepay.vn",
      SEPAY_MERCHANT_ID: "production-merchant",
      SEPAY_SECRET_KEY: "production-secret",
      SEPAY_IPN_SECRET: "production-ipn-secret",
      SEPAY_SUCCESS_URL: "https://shop.novacommerce.local/payment/return?outcome=success",
      SEPAY_ERROR_URL: "https://shop.novacommerce.local/payment/return?outcome=error",
      SEPAY_CANCEL_URL: "https://shop.novacommerce.local/payment/return?outcome=cancel",
    })).toMatchObject({
      environment: "production",
      storefrontOrigin: "https://shop.novacommerce.local",
      cookieSecure: true,
    });
  });

  it("rejects public plaintext AI Runtime URLs in production", () => {
    expect(() => parseApiEnvironment({
      ...validSource,
      OPENDX_ENV: "production",
      AI_RUNTIME_INTERNAL_URL: "http://runtime.example.test:8000",
    })).toThrow("AI_RUNTIME_INTERNAL_URL");
  });

  it("rejects public plaintext token URLs in production", () => {
    expect(() => parseApiEnvironment({
      ...validSource,
      OPENDX_ENV: "production",
      KEYCLOAK_TOKEN_URL: "http://identity.example.test/token",
    })).toThrow("KEYCLOAK_TOKEN_URL");
  });

  it("rejects placeholder production domains", () => {
    expect(() =>
      parseApiEnvironment({
        ...validSource,
        OPENDX_ENV: "production",
        COOKIE_SECURE: "true",
        CONSOLE_ORIGIN: "https://console.example.com",
        STOREFRONT_ORIGIN: "https://shop.example.com",
        KEYCLOAK_ISSUER: "https://auth.example.com/realms/opendx",
        KEYCLOAK_JWKS_URL:
          "https://auth.example.com/realms/opendx/protocol/openid-connect/certs",
        MINIO_ENDPOINT: "https://storage.example.com",
        SEPAY_ENVIRONMENT: "production",
        SEPAY_CHECKOUT_URL: "https://pay.sepay.vn/v1/checkout/init",
        SEPAY_API_BASE_URL: "https://pgapi.sepay.vn",
        SEPAY_MERCHANT_ID: "merchant",
        SEPAY_SECRET_KEY: "secret",
        SEPAY_IPN_SECRET: "ipn-secret",
        SEPAY_SUCCESS_URL:
          "https://shop.example.com/payment/return?outcome=success",
        SEPAY_ERROR_URL: "https://shop.example.com/payment/return?outcome=error",
        SEPAY_CANCEL_URL:
          "https://shop.example.com/payment/return?outcome=cancel",
      }),
    ).toThrow(/placeholder production domain/i);
  });

  it("parses production observability and body limit settings", () => {
    const environment = parseApiEnvironment({
      ...validSource,
      OPENDX_ENV: "production",
      COOKIE_SECURE: "true",
      CONSOLE_ORIGIN: "https://console.novacommerce.local",
      STOREFRONT_ORIGIN: "https://shop.novacommerce.local",
      KEYCLOAK_ISSUER: "https://auth.novacommerce.local/realms/opendx",
      KEYCLOAK_JWKS_URL:
        "https://auth.novacommerce.local/realms/opendx/protocol/openid-connect/certs",
      MINIO_ENDPOINT: "https://storage.novacommerce.local",
      SEPAY_ENVIRONMENT: "production",
      SEPAY_CHECKOUT_URL: "https://pay.sepay.vn/v1/checkout/init",
      SEPAY_API_BASE_URL: "https://pgapi.sepay.vn",
      SEPAY_MERCHANT_ID: "merchant",
      SEPAY_SECRET_KEY: "secret",
      SEPAY_IPN_SECRET: "ipn-secret",
      SEPAY_SUCCESS_URL:
        "https://shop.novacommerce.local/payment/return?outcome=success",
      SEPAY_ERROR_URL:
        "https://shop.novacommerce.local/payment/return?outcome=error",
      SEPAY_CANCEL_URL:
        "https://shop.novacommerce.local/payment/return?outcome=cancel",
      LOG_FORMAT: "json",
      LOG_LEVEL: "info",
      METRICS_ENABLED: "true",
      METRICS_PATH: "/metrics",
      READINESS_TIMEOUT_MS: "2500",
      JSON_BODY_LIMIT: "1mb",
      PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND: "10000",
      PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION:
        "I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT",
    });
    expect(environment.logging).toEqual({ format: "json", level: "info" });
    expect(environment.metrics).toEqual({ enabled: true, path: "/metrics" });
    expect(environment.readinessTimeoutMs).toBe(2500);
    expect(environment.jsonBodyLimit).toBe("1mb");
    expect(environment.productionSePayAcceptance).toEqual({
      amountVnd: 10000,
      confirmation: "I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT",
    });
  });

  it.each([
    ["SEPAY_MERCHANT_ID", { SEPAY_MERCHANT_ID: "" }],
    ["SEPAY_CHECKOUT_URL", { SEPAY_CHECKOUT_URL: "https://pay-sandbox.sepay.vn/v1/checkout/init" }],
    ["SEPAY_API_BASE_URL", { SEPAY_API_BASE_URL: "https://pgapi-sandbox.sepay.vn" }],
    ["SEPAY_SUCCESS_URL", { SEPAY_SUCCESS_URL: "http://shop.example.com/payment/return" }],
    ["MINIO_SUPPORT_BUCKET", { MINIO_SUPPORT_BUCKET: "product-media" }],
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
