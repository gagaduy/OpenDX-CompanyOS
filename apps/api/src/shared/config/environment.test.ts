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
  });

  it.each([
    ["DATABASE_URL", { DATABASE_URL: "" }],
    ["DATABASE_URL", { DATABASE_URL: "not-a-url" }],
    ["API_PORT", { API_PORT: "0" }],
    ["API_PORT", { API_PORT: "70000" }],
    ["MEDIA_MAX_BYTES", { MEDIA_MAX_BYTES: "0" }],
    ["INVENTORY_RESERVATION_TTL_SECONDS", { INVENTORY_RESERVATION_TTL_SECONDS: "600" }],
    ["INVENTORY_EXPIRY_INTERVAL_SECONDS", { INVENTORY_EXPIRY_INTERVAL_SECONDS: "4" }],
  ])("rejects invalid %s", (expectedKey, override) => {
    expect(() =>
      parseApiEnvironment({ ...validSource, ...override }),
    ).toThrow(expectedKey);
  });
});
