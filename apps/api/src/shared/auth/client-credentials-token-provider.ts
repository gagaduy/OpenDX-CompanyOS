// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface ClientCredentialsTokenProviderOptions {
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly audience: string;
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => number;
  readonly expirySkewMs: number;
}

export interface AccessTokenProvider {
  getToken(): Promise<string>;
}

interface CachedToken {
  readonly value: string;
  readonly expiresAt: number;
}

export class ClientCredentialsTokenProvider implements AccessTokenProvider {
  private cached: CachedToken | undefined;
  private refresh: Promise<string> | undefined;

  constructor(private readonly options: ClientCredentialsTokenProviderOptions) {
    if (options.clientId.trim() === "" || options.clientSecret === "" || options.audience.trim() === "") {
      throw new RangeError("Client credentials configuration is incomplete");
    }
    if (!Number.isSafeInteger(options.expirySkewMs) || options.expirySkewMs < 0) {
      throw new RangeError("Token expiry skew is invalid");
    }
  }

  async getToken(): Promise<string> {
    if (
      this.cached !== undefined
      && this.options.now() < this.cached.expiresAt - this.options.expirySkewMs
    ) return this.cached.value;
    if (this.refresh === undefined) {
      this.refresh = this.acquire().finally(() => { this.refresh = undefined; });
    }
    return this.refresh;
  }

  private async acquire(): Promise<string> {
    let response: Response;
    try {
      response = await this.options.fetch(this.options.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          audience: this.options.audience,
        }),
      });
    } catch {
      throw new Error("CLIENT_CREDENTIALS_TRANSPORT_FAILED");
    }
    if (!response.ok) throw new Error("CLIENT_CREDENTIALS_REJECTED");
    const raw = await response.text();
    if (raw.length > 32_768) throw new Error("CLIENT_CREDENTIALS_RESPONSE_INVALID");
    let payload: unknown;
    try { payload = JSON.parse(raw); }
    catch { throw new Error("CLIENT_CREDENTIALS_RESPONSE_INVALID"); }
    if (!isTokenResponse(payload)) throw new Error("CLIENT_CREDENTIALS_RESPONSE_INVALID");
    this.cached = {
      value: payload.access_token,
      expiresAt: this.options.now() + payload.expires_in * 1_000,
    };
    return this.cached.value;
  }
}

function isTokenResponse(value: unknown): value is {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
} {
  if (typeof value !== "object" || value === null) return false;
  const token = value as Record<string, unknown>;
  return typeof token.access_token === "string"
    && token.access_token.length > 0
    && token.access_token.length <= 16_384
    && typeof token.token_type === "string"
    && token.token_type.toLowerCase() === "bearer"
    && typeof token.expires_in === "number"
    && Number.isSafeInteger(token.expires_in)
    && token.expires_in > 0;
}
