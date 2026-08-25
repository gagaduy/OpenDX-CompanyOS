// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseConsoleEnvironment } from "./environment";

const validSource = {
  VITE_API_BASE_URL: "http://localhost:4000",
  VITE_OIDC_AUTHORITY: "http://localhost:8080/realms/opendx",
  VITE_OIDC_CLIENT_ID: "opendx-console",
  VITE_OIDC_REDIRECT_URI: "http://localhost:3000/auth/callback",
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI: "http://localhost:3000/sign-in",
} as const;

describe("parseConsoleEnvironment", () => {
  it("returns the public OIDC and API contract", () => {
    expect(parseConsoleEnvironment(validSource)).toEqual({
      apiBaseUrl: validSource.VITE_API_BASE_URL,
      oidcAuthority: validSource.VITE_OIDC_AUTHORITY,
      oidcClientId: validSource.VITE_OIDC_CLIENT_ID,
      oidcRedirectUri: validSource.VITE_OIDC_REDIRECT_URI,
      oidcPostLogoutRedirectUri:
        validSource.VITE_OIDC_POST_LOGOUT_REDIRECT_URI,
    });
  });

  it.each([
    ["VITE_API_BASE_URL", { VITE_API_BASE_URL: "" }],
    ["VITE_OIDC_AUTHORITY", { VITE_OIDC_AUTHORITY: "invalid" }],
    ["VITE_OIDC_CLIENT_ID", { VITE_OIDC_CLIENT_ID: "" }],
  ])("rejects invalid %s", (expectedKey, override) => {
    expect(() =>
      parseConsoleEnvironment({ ...validSource, ...override }),
    ).toThrow(expectedKey);
  });
});
