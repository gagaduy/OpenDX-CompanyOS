// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseApiEnvironment } from "./environment";

const validSource = {
  OPENDX_ENV: "test",
  API_PORT: "4000",
  DATABASE_URL: "postgres://opendx:secret@postgres:5432/opendx",
  AGENTIC_ANALYTICS_DATABASE_URL: "postgres://opendx_agentic_reader:reader-secret@postgres:5432/opendx",
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
    expect(environment.agenticAnalyticsDatabaseUrl).toBe(validSource.AGENTIC_ANALYTICS_DATABASE_URL);
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
    expect(environment.marketing).toMatchObject({
      pollIntervalMs: 5000,
      targetLeaseSeconds: 30,
      meta: {
        graphBaseUrl: "https://graph.facebook.com",
        requestTimeoutMs: 10000,
      },
      facebook: {},
      instagram: {
        mode: "simulation",
        accountConfigurationId: "instagram-local-simulation",
      },
    });
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

  it("parses live Instagram configuration when all required fields are present", () => {
    const environment = parseApiEnvironment({
      ...validSource,
      INSTAGRAM_PUBLICATION_MODE: "live",
      INSTAGRAM_ACCOUNT_CONFIGURATION_ID: "ig-live-1",
      INSTAGRAM_BUSINESS_ACCOUNT_ID: "17841400000000000",
      INSTAGRAM_ACCESS_TOKEN: "EAA...",
      INSTAGRAM_PUBLIC_MEDIA_BASE_URL: "https://cdn.novacommerce.vn/media",
    });

    expect(environment.marketing.instagram).toEqual({
      mode: "live",
      accountConfigurationId: "ig-live-1",
      businessAccountId: "17841400000000000",
      accessToken: "EAA...",
      publicMediaBaseUrl: "https://cdn.novacommerce.vn/media",
    });
  });

  it.each([
    ["INSTAGRAM_BUSINESS_ACCOUNT_ID", { INSTAGRAM_PUBLICATION_MODE: "live", INSTAGRAM_ACCESS_TOKEN: "token", INSTAGRAM_PUBLIC_MEDIA_BASE_URL: "https://cdn.novacommerce.vn/media" }],
    ["INSTAGRAM_ACCESS_TOKEN", { INSTAGRAM_PUBLICATION_MODE: "live", INSTAGRAM_BUSINESS_ACCOUNT_ID: "biz-1", INSTAGRAM_PUBLIC_MEDIA_BASE_URL: "https://cdn.novacommerce.vn/media" }],
    ["INSTAGRAM_PUBLIC_MEDIA_BASE_URL", { INSTAGRAM_PUBLICATION_MODE: "live", INSTAGRAM_BUSINESS_ACCOUNT_ID: "biz-1", INSTAGRAM_ACCESS_TOKEN: "token", INSTAGRAM_PUBLIC_MEDIA_BASE_URL: "http://insecure.com" }],
  ])("rejects incomplete live Instagram configuration: %s", (expectedKey, override) => {
    expect(() =>
      parseApiEnvironment({ ...validSource, ...override }),
    ).toThrow(expectedKey);
  });

  it.each([
    "https://example.com/media",
    "https://novacommerce.example.com/media",
    "https://cdn.example.net/media",
    "https://media.example.org/assets",
  ])("rejects reserved public-media host in Instagram live mode: %s", (publicMediaBaseUrl) => {
    expect(() =>
      parseApiEnvironment({
        ...validSource,
        INSTAGRAM_PUBLICATION_MODE: "live",
        INSTAGRAM_BUSINESS_ACCOUNT_ID: "17841400000000000",
        INSTAGRAM_ACCESS_TOKEN: "token",
        INSTAGRAM_PUBLIC_MEDIA_BASE_URL: publicMediaBaseUrl,
      }),
    ).toThrow("INSTAGRAM_PUBLIC_MEDIA_BASE_URL");
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
    ["AGENTIC_ANALYTICS_DATABASE_URL", { AGENTIC_ANALYTICS_DATABASE_URL: "postgres://opendx:secret@postgres:5432/opendx" }],
    ["WORKFLOW_GATEWAY_TIMEOUT_MS", { WORKFLOW_GATEWAY_TIMEOUT_MS: "499" }],
    ["WORKFLOW_DISPATCHER_INTERVAL_MS", { WORKFLOW_DISPATCHER_INTERVAL_MS: "99" }],
    ["WORKFLOW_DISPATCHER_BATCH_SIZE", { WORKFLOW_DISPATCHER_BATCH_SIZE: "1001" }],
    ["MARKETING_PUBLICATION_POLL_INTERVAL_MS", { MARKETING_PUBLICATION_POLL_INTERVAL_MS: "499" }],
    ["MARKETING_TARGET_LEASE_SECONDS", { MARKETING_TARGET_LEASE_SECONDS: "4" }],
  ])("rejects invalid %s", (expectedKey, override) => {
    expect(() =>
      parseApiEnvironment({ ...validSource, ...override }),
    ).toThrow(expectedKey);
  });

  it("rejects simulation mode in production", () => {
    expect(() =>
      parseApiEnvironment({
        ...validSource,
        OPENDX_ENV: "production",
        COOKIE_SECURE: "true",
        CONSOLE_ORIGIN: "https://console.novacommerce.local",
        STOREFRONT_ORIGIN: "https://shop.novacommerce.local",
        KEYCLOAK_ISSUER: "https://auth.novacommerce.local/realms/opendx",
        KEYCLOAK_JWKS_URL: "https://auth.novacommerce.local/realms/opendx/protocol/openid-connect/certs",
        MINIO_ENDPOINT: "https://storage.novacommerce.local",
        SEPAY_ENVIRONMENT: "production",
        SEPAY_CHECKOUT_URL: "https://pay.sepay.vn/v1/checkout/init",
        SEPAY_API_BASE_URL: "https://pgapi.sepay.vn",
        SEPAY_MERCHANT_ID: "merchant",
        SEPAY_SECRET_KEY: "secret",
        SEPAY_IPN_SECRET: "ipn-secret",
        SEPAY_SUCCESS_URL: "https://shop.novacommerce.local/payment/return?outcome=success",
        SEPAY_ERROR_URL: "https://shop.novacommerce.local/payment/return?outcome=error",
        SEPAY_CANCEL_URL: "https://shop.novacommerce.local/payment/return?outcome=cancel",
        INSTAGRAM_PUBLICATION_MODE: "simulation",
      }),
    ).toThrow("INSTAGRAM_PUBLICATION_MODE");
  });
});
