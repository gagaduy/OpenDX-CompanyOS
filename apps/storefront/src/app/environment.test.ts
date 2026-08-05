// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseStorefrontEnvironment } from "./environment";

describe("parseStorefrontEnvironment", () => {
  it("returns the public API, origin, and optional Google identity contract", () => {
    expect(parseStorefrontEnvironment({
      VITE_API_BASE_URL: "http://localhost:4000",
      VITE_STOREFRONT_ORIGIN: "http://localhost:3100",
      VITE_GOOGLE_CLIENT_ID: "local-google-client.apps.googleusercontent.com",
    })).toEqual({
      apiBaseUrl: "http://localhost:4000",
      storefrontOrigin: "http://localhost:3100",
      googleClientId: "local-google-client.apps.googleusercontent.com",
    });
  });

  it("allows local browsing and guest cart behavior without Google configuration", () => {
    expect(parseStorefrontEnvironment({
      VITE_API_BASE_URL: "http://localhost:4000",
      VITE_STOREFRONT_ORIGIN: "http://localhost:3100",
    })).toEqual({
      apiBaseUrl: "http://localhost:4000",
      storefrontOrigin: "http://localhost:3100",
    });
  });

  it.each([
    ["VITE_API_BASE_URL", { VITE_API_BASE_URL: "not-a-url", VITE_STOREFRONT_ORIGIN: "http://localhost:3100" }],
    ["VITE_STOREFRONT_ORIGIN", { VITE_API_BASE_URL: "http://localhost:4000", VITE_STOREFRONT_ORIGIN: "" }],
  ])("rejects invalid %s", (expectedKey, source) => {
    expect(() => parseStorefrontEnvironment(source)).toThrow(expectedKey);
  });
});
