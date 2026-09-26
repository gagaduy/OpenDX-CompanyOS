// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const consoleEnvironmentSchema = z.object({
  VITE_API_BASE_URL: z.url().default("http://localhost:4000"),
  VITE_OIDC_AUTHORITY: z.url().default("http://localhost:8081/realms/opendx"),
  VITE_OIDC_CLIENT_ID: z.string().trim().min(1).default("opendx-console"),
  VITE_OIDC_REDIRECT_URI: z.url().default("http://localhost:3000/auth/callback"),
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI: z.url().default("http://localhost:3000/sign-in"),
});

export interface ConsoleEnvironment {
  readonly apiBaseUrl: string;
  readonly oidcAuthority: string;
  readonly oidcClientId: string;
  readonly oidcRedirectUri: string;
  readonly oidcPostLogoutRedirectUri: string;
}

export function parseConsoleEnvironment(
  source: Record<string, string | undefined>,
): ConsoleEnvironment {
  const value = consoleEnvironmentSchema.parse(source);

  return {
    apiBaseUrl: value.VITE_API_BASE_URL,
    oidcAuthority: value.VITE_OIDC_AUTHORITY,
    oidcClientId: value.VITE_OIDC_CLIENT_ID,
    oidcRedirectUri: value.VITE_OIDC_REDIRECT_URI,
    oidcPostLogoutRedirectUri: value.VITE_OIDC_POST_LOGOUT_REDIRECT_URI,
  };
}
