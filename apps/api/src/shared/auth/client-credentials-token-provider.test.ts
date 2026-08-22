// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { ClientCredentialsTokenProvider } from "./client-credentials-token-provider";

describe("ClientCredentialsTokenProvider", () => {
  it("posts an encoded audience grant and caches until the expiry skew", async () => {
    let now = 1_000_000;
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      access_token: "short-lived-token",
      token_type: "Bearer",
      expires_in: 60,
    }), { status: 200 }));
    const provider = createProvider(fetch, () => now);

    await expect(provider.getToken()).resolves.toBe("short-lived-token");
    await expect(provider.getToken()).resolves.toBe("short-lived-token");
    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0]!;
    expect(request[0]).toBe("https://identity.test/token");
    expect(request[1]?.method).toBe("POST");
    expect(request[1]?.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" });
    expect(String(request[1]?.body)).toBe(new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "opendx-agentic-control",
      client_secret: "private-client-secret",
      audience: "opendx-ai-runtime",
    }).toString());

    now += 51_000;
    await provider.getToken();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent refreshes", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const provider = createProvider(fetch, () => 1_000_000);
    const first = provider.getToken();
    const second = provider.getToken();
    expect(fetch).toHaveBeenCalledOnce();
    resolveResponse(new Response(JSON.stringify({
      access_token: "shared-token", token_type: "Bearer", expires_in: 60,
    }), { status: 200 }));
    await expect(Promise.all([first, second])).resolves.toEqual(["shared-token", "shared-token"]);
  });

  it.each([
    ["non-2xx", new Response("sensitive-provider-body", { status: 401 })],
    ["malformed", new Response(JSON.stringify({ access_token: "", expires_in: 0 }), { status: 200 })],
  ])("returns a redacted error for %s responses", async (_case, response) => {
    const provider = createProvider(vi.fn(async () => response), () => 1_000_000);
    const error = await provider.getToken().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain("private-client-secret");
    expect(String(error)).not.toContain("sensitive-provider-body");
  });
});

function createProvider(fetch: typeof globalThis.fetch, now: () => number) {
  return new ClientCredentialsTokenProvider({
    tokenUrl: "https://identity.test/token",
    clientId: "opendx-agentic-control",
    clientSecret: "private-client-secret",
    audience: "opendx-ai-runtime",
    fetch,
    now,
    expirySkewMs: 10_000,
  });
}
