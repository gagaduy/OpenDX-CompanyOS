// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const storefrontEnvironmentSchema = z.object({
  VITE_API_BASE_URL: z.url(),
  VITE_STOREFRONT_ORIGIN: z.url(),
  VITE_GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
});

export interface StorefrontEnvironment {
  readonly apiBaseUrl: string;
  readonly storefrontOrigin: string;
  readonly googleClientId?: string;
}

export function parseStorefrontEnvironment(
  source: Record<string, string | undefined>,
): StorefrontEnvironment {
  const value = storefrontEnvironmentSchema.parse(source);

  return {
    apiBaseUrl: value.VITE_API_BASE_URL,
    storefrontOrigin: value.VITE_STOREFRONT_ORIGIN,
    ...(value.VITE_GOOGLE_CLIENT_ID === undefined
      ? {}
      : { googleClientId: value.VITE_GOOGLE_CLIENT_ID }),
  };
}
