// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../../../app";
import type {
  MarketingPublicMediaService,
  ReadMarketingPublicMediaInput,
} from "../application/services/interfaces/marketing-public-media.service";
import { MarketingPublicMediaAccessError } from "../application/services/interfaces/marketing-public-media.service";
import { createMarketingPublicMediaRouter } from "../presentation/routes/marketing-public-media.routes";

const ASSET_ID = "7c1466de-4f31-4598-9552-c84b9e20a7b2";
const DIGEST = "a".repeat(64);
const POLICY = "b".repeat(64);
const OUTPUT_DIGEST = "c".repeat(64);
const SIGNATURE = "d".repeat(64);
const EXPIRES = "1788318900";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x4a, 0x46, 0x49, 0x46]);

function path(overrides: Record<string, string> = {}): string {
  const query = new URLSearchParams({
    v: "1",
    digest: DIGEST,
    policy: POLICY,
    outputDigest: OUTPUT_DIGEST,
    expires: EXPIRES,
    signature: SIGNATURE,
    ...overrides,
  });
  return `/v1/public/marketing/media/${ASSET_ID}?${query}`;
}

function createService(
  read: MarketingPublicMediaService["read"] = vi.fn(async () => ({
    bytes: JPEG,
    mediaType: "image/jpeg" as const,
    outputDigest: OUTPUT_DIGEST,
  })),
): MarketingPublicMediaService {
  return {
    prepareUrl: vi.fn(async () => "https://example.invalid/signed"),
    assertValidClaim: vi.fn(),
    read,
  };
}

function createTestApp(
  service: MarketingPublicMediaService,
  rateLimit = 100,
) {
  return createApiApp({
    marketingPublicRouter: createMarketingPublicMediaRouter({
      service,
      rateLimit,
      rateWindowMs: 60_000,
    }),
  });
}

describe("Marketing public media API", () => {
  it("streams exact JPEG bytes and bounded response headers for GET", async () => {
    const read = vi.fn(async (_input: ReadMarketingPublicMediaInput) => ({
      bytes: JPEG,
      mediaType: "image/jpeg" as const,
      outputDigest: OUTPUT_DIGEST,
    }));
    const response = await request(createTestApp(createService(read)))
      .get(path())
      .expect(200);

    expect(Buffer.from(response.body)).toEqual(JPEG);
    expect(response.headers["content-type"]).toMatch(/^image\/jpeg/);
    expect(response.headers["content-length"]).toBe(String(JPEG.byteLength));
    expect(response.headers.etag).toBe(`"${OUTPUT_DIGEST}"`);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(read).toHaveBeenCalledWith({
      assetId: ASSET_ID,
      sourceDigest: DIGEST,
      policy: POLICY,
      outputDigest: OUTPUT_DIGEST,
      expires: Number(EXPIRES),
      signature: SIGNATURE,
    });
  });

  it("returns the same JPEG headers without a body for HEAD", async () => {
    const response = await request(createTestApp(createService()))
      .head(path())
      .expect(200);

    expect(response.body).toEqual({});
    expect(response.text).toBeUndefined();
    expect(response.headers["content-type"]).toMatch(/^image\/jpeg/);
    expect(response.headers["content-length"]).toBe(String(JPEG.byteLength));
    expect(response.headers.etag).toBe(`"${OUTPUT_DIGEST}"`);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("always returns the exact JPEG instead of converting a matching ETag into 304", async () => {
    const response = await request(createTestApp(createService()))
      .get(path())
      .set("If-None-Match", `"${OUTPUT_DIGEST}"`)
      .expect(200);

    expect(Buffer.from(response.body)).toEqual(JPEG);
  });

  it.each([
    ["malformed UUID", path().replace(ASSET_ID, "not-a-uuid")],
    ["version", path({ v: "2" })],
    ["digest", path({ digest: "A".repeat(64) })],
    ["policy", path({ policy: "not-a-digest" })],
    ["output digest", path({ outputDigest: "1".repeat(63) })],
    ["expiry", path({ expires: "1.5" })],
    ["unsafe expiry", path({ expires: "9007199254740992" })],
    ["signature", path({ signature: "g".repeat(64) })],
    ["unknown query key", path({ bucket: "private-marketing" })],
  ])("maps invalid %s input to the indistinguishable 404", async (_label, requestPath) => {
    const service = createService();
    const response = await request(createTestApp(service)).get(requestPath).expect(404);

    expect(response.body).toEqual({
      success: false,
      message: "Marketing media is unavailable",
      errorCode: "MARKETING_MEDIA_NOT_FOUND",
      errors: [],
    });
    expect(service.read).not.toHaveBeenCalled();
  });

  it.each(["expired", "excessive-future", "unknown"])(
    "maps %s media access failures to the same 404",
    async () => {
      const service = createService(vi.fn(async () => {
        throw new MarketingPublicMediaAccessError();
      }));
      const response = await request(createTestApp(service)).get(path()).expect(404);

      expect(response.body).toEqual({
        success: false,
        message: "Marketing media is unavailable",
        errorCode: "MARKETING_MEDIA_NOT_FOUND",
        errors: [],
      });
    },
  );

  it("does not leak unexpected service errors", async () => {
    const service = createService(vi.fn(async () => {
      throw new Error("private storage and signing detail");
    }));
    const response = await request(createTestApp(service)).get(path()).expect(500);

    expect(response.body).toEqual({
      success: false,
      message: "An unexpected error occurred",
      errorCode: "INTERNAL_ERROR",
      errors: [],
    });
    expect(JSON.stringify(response.body)).not.toContain("private storage and signing detail");
  });

  it("does not expose a bucket or object-key route", async () => {
    const service = createService();
    await request(createTestApp(service))
      .get(`/v1/public/marketing/media/private-bucket/marketing/public-media/${ASSET_ID}`)
      .expect(404);
    expect(service.read).not.toHaveBeenCalled();
  });

  it("rate limits repeated public media requests", async () => {
    const app = createTestApp(createService(), 1);
    await request(app).get(path()).expect(200);
    await request(app).get(path()).expect(429);
  });

  it("validates the signature before consuming signed URL quota", async () => {
    const service = createService();
    service.assertValidClaim = vi.fn((input) => {
      if (input.signature !== SIGNATURE) throw new MarketingPublicMediaAccessError();
    });
    const app = createTestApp(service, 1);

    await request(app).get(path({ signature: "e".repeat(64) })).expect(404);
    await request(app).get(path()).expect(200);
  });

  it("shares one signed URL quota across spoofed forwarding headers without limiter warnings", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const app = createTestApp(createService(), 1);
      await request(app).get(path()).set("X-Forwarded-For", "198.51.100.1").expect(200);
      await request(app).get(path()).set("X-Forwarded-For", "203.0.113.2").expect(429);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("keeps independent quotas for different valid signed URLs", async () => {
    const app = createTestApp(createService(), 1);

    await request(app).get(path()).expect(200);
    await request(app).get(path({ signature: "e".repeat(64) })).expect(200);
  });

  it("does not include signed claims in request logs", async () => {
    const info = vi.fn();
    const service = createService();
    const app = createApiApp({
      logger: {
        debug: vi.fn(),
        info,
        warn: vi.fn(),
        error: vi.fn(),
      },
      marketingPublicRouter: createMarketingPublicMediaRouter({
        service,
        rateLimit: 100,
        rateWindowMs: 60_000,
      }),
    });

    await request(app).get(path()).expect(200);

    expect(info).toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain(SIGNATURE);
    expect(JSON.stringify(info.mock.calls)).not.toContain("outputDigest");
  });
});
