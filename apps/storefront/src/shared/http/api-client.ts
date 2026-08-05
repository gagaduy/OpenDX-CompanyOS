// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string(),
});

export class StorefrontApiError extends Error {
  constructor(readonly errorCode: string, message: string, readonly status: number) {
    super(message);
    this.name = "StorefrontApiError";
  }
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...init.headers },
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const parsed = errorEnvelopeSchema.safeParse(payload);
      throw new StorefrontApiError(
        parsed.success ? parsed.data.errorCode : "DEPENDENCY_UNAVAILABLE",
        parsed.success ? parsed.data.message : "The store service is unavailable",
        response.status,
      );
    }
    return schema.parse(payload);
  }
}

export function csrfToken(): string | undefined {
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("opendx_csrf="))?.split("=").slice(1).join("=");
}

export function mutationHeaders(): HeadersInit {
  const csrf = csrfToken();
  return { "Content-Type": "application/json", ...(csrf === undefined ? {} : { "x-csrf-token": csrf }) };
}
