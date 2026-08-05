// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { assertIntegrationEnvironment } from "./assert-integration-environment";

describe("assertIntegrationEnvironment", () => {
  it("accepts isolated PostgreSQL and MinIO test targets", () => {
    expect(() =>
      assertIntegrationEnvironment({
        TEST_DATABASE_URL:
          "postgres://user:password@localhost:5432/opendx_test",
        MINIO_BUCKET: "product-media-test",
      }),
    ).not.toThrow();
  });

  it.each([
    [
      { TEST_DATABASE_URL: "postgres://user:password@localhost:5432/opendx" },
      "TEST_DATABASE_URL",
    ],
    [
      {
        TEST_DATABASE_URL:
          "postgres://user:password@localhost:5432/opendx_test",
        MINIO_BUCKET: "product-media",
      },
      "MINIO_BUCKET",
    ],
  ])("rejects non-test integration storage", (source, expected) => {
    expect(() => assertIntegrationEnvironment(source)).toThrow(expected);
  });
});
