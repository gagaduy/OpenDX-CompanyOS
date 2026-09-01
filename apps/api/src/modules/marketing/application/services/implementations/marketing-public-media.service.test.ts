// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MarketingImageTransformerPort } from "../../ports/marketing-image-transformer.port";
import type {
  MarketingPublicMediaStoragePort,
  MarketingPublicMediaVariant,
  WriteMarketingPublicMediaVariant,
} from "../../ports/marketing-public-media-storage.port";
import type { SocialPublishMediaItem } from "../../ports/social-publisher.port";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import type { VisualAsset } from "../../../domain/entities/marketing-campaign";
import {
  MarketingPublicMediaAccessError,
} from "../interfaces/marketing-public-media.service";
import { MarketingPublicMediaServiceImpl } from "./marketing-public-media.service";

const NOW = "2026-09-02T03:00:00.000Z";
const NOW_SECONDS = 1_788_318_000;
const TTL_SECONDS = 900;
const SECRET = "test-signing-secret-that-is-at-least-32-characters";
const ASSET_ID = "7c1466de-4f31-4598-9552-c84b9e20a7b2";
const OTHER_ASSET_ID = "6b0355cd-3e20-4487-8441-b73a8d19f6a1";
const PNG_BYTES = Buffer.from("deterministic-private-png-source");
const SOURCE_DIGEST = "d714c2654f732d041e6229f04ea9c08ada24578350342dc31330b93b6756e863";
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x4a, 0x46, 0x49, 0x46]);
const OTHER_JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x01, 0x02, 0x03]);
const VARIANT_KEY = `marketing/public-media/${ASSET_ID}/${SOURCE_DIGEST}.jpg`;

interface FakeState {
  repositoryLookups: string[];
  storageReads: string[];
  storageWrites: WriteMarketingPublicMediaVariant[];
  transformCalls: Array<{ source: Buffer; quality: number }>;
}

interface HarnessOptions {
  asset?: VisualAsset | null;
  existingVariant?: MarketingPublicMediaVariant | null;
  transformedBytes?: Buffer;
  repositoryError?: Error;
  storageReadError?: Error;
  storageWriteError?: Error;
  transformerError?: Error;
  publicBaseUrl?: string;
  signingSecret?: string;
  urlTtlSeconds?: number;
  jpegQuality?: number;
}

function visualAsset(overrides: Partial<VisualAsset> = {}): VisualAsset {
  return {
    id: ASSET_ID,
    campaignId: "2f9245a2-8238-43f4-a16c-a4a1b1308d6f",
    versionNumber: 1,
    mediaType: "image/png",
    aspectRatio: "1:1",
    width: 1080,
    height: 1080,
    byteSize: PNG_BYTES.byteLength,
    imageDigest: SOURCE_DIGEST,
    altText: "A deterministic test image",
    storageKey: "marketing/campaigns/campaign-1/visual.png",
    modelRunId: null,
    costMicros: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function media(overrides: Partial<SocialPublishMediaItem> = {}): SocialPublishMediaItem {
  return {
    id: ASSET_ID,
    bytes: PNG_BYTES,
    mimeType: "image/png",
    fileName: `${ASSET_ID}.png`,
    ...overrides,
  };
}

function harness(options: HarnessOptions = {}) {
  const state: FakeState = {
    repositoryLookups: [],
    storageReads: [],
    storageWrites: [],
    transformCalls: [],
  };
  const variants = new Map<string, MarketingPublicMediaVariant>();
  if (options.existingVariant !== null) {
    variants.set(VARIANT_KEY, options.existingVariant ?? {
      bytes: JPEG_BYTES,
      mediaType: "image/jpeg",
    });
  }

  const repository = {
    async findVisualAssetById(id: string): Promise<VisualAsset | null> {
      state.repositoryLookups.push(id);
      if (options.repositoryError) throw options.repositoryError;
      return options.asset === undefined ? visualAsset() : options.asset;
    },
  } as MarketingRepository;

  const storage: MarketingPublicMediaStoragePort = {
    async readVariant(key: string) {
      state.storageReads.push(key);
      if (options.storageReadError) throw options.storageReadError;
      return variants.get(key) ?? null;
    },
    async writeVariant(input: WriteMarketingPublicMediaVariant) {
      if (options.storageWriteError) throw options.storageWriteError;
      state.storageWrites.push({ ...input, bytes: Buffer.from(input.bytes) });
      variants.set(input.key, { bytes: Buffer.from(input.bytes), mediaType: "image/jpeg" });
    },
  };

  const transformer: MarketingImageTransformerPort = {
    async toJpeg(source, quality) {
      state.transformCalls.push({ source: Buffer.from(source), quality });
      if (options.transformerError) throw options.transformerError;
      const bytes = options.transformedBytes ?? OTHER_JPEG_BYTES;
      return {
        bytes,
        width: 1080,
        height: 1080,
        byteSize: bytes.byteLength,
        sha256Digest: sha256(bytes),
      };
    },
  };

  return {
    service: new MarketingPublicMediaServiceImpl({
      repository,
      storage,
      transformer,
      publicBaseUrl: options.publicBaseUrl ?? "https://stable-tunnel.trycloudflare.com",
      signingSecret: options.signingSecret ?? SECRET,
      urlTtlSeconds: options.urlTtlSeconds ?? TTL_SECONDS,
      jpegQuality: options.jpegQuality ?? 85,
      now: () => NOW,
    }),
    state,
  };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sign(assetId: string, sourceDigest: string, expires: number): string {
  return createHmac("sha256", SECRET)
    .update(`v1\n${assetId}\n${sourceDigest}\n${expires}`)
    .digest("hex");
}

function validReadInput() {
  const expires = NOW_SECONDS + TTL_SECONDS;
  return {
    assetId: ASSET_ID,
    sourceDigest: SOURCE_DIGEST,
    expires,
    signature: sign(ASSET_ID, SOURCE_DIGEST, expires),
  };
}

async function expectUnavailable(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toEqual(
    expect.objectContaining({
      name: "MarketingPublicMediaAccessError",
      message: "Marketing media is unavailable",
    }),
  );
}

describe("MarketingPublicMediaServiceImpl", () => {
  it("rejects source bytes whose SHA-256 digest differs from the persisted visual asset", async () => {
    const { service, state } = harness();

    await expectUnavailable(service.prepareUrl(media({ bytes: Buffer.from("tampered") })));

    expect(state.storageReads).toEqual([]);
    expect(state.transformCalls).toEqual([]);
  });

  it("derives the private variant key from the persisted asset identity and source digest", async () => {
    const { service, state } = harness();

    await service.prepareUrl(media());

    expect(state.storageReads).toEqual([VARIANT_KEY]);
  });

  it("reuses a valid existing JPEG without transforming or writing it", async () => {
    const { service, state } = harness();

    await service.prepareUrl(media());

    expect(state.transformCalls).toEqual([]);
    expect(state.storageWrites).toEqual([]);
  });

  it("transforms a missing variant once and persists complete provenance metadata", async () => {
    const { service, state } = harness({ existingVariant: null });

    await service.prepareUrl(media());

    expect(state.transformCalls).toEqual([{ source: PNG_BYTES, quality: 85 }]);
    expect(state.storageWrites).toEqual([{
      key: VARIANT_KEY,
      bytes: OTHER_JPEG_BYTES,
      sourceAssetId: ASSET_ID,
      sourceDigest: SOURCE_DIGEST,
      outputDigest: sha256(OTHER_JPEG_BYTES),
      width: 1080,
      height: 1080,
    }]);
  });

  it("returns the configured HTTPS endpoint with only bounded signed claims", async () => {
    const { service } = harness({ publicBaseUrl: "https://stable-tunnel.trycloudflare.com/" });

    const result = new URL(await service.prepareUrl(media()));

    expect(`${result.origin}${result.pathname}`).toBe(
      `https://stable-tunnel.trycloudflare.com/v1/public/marketing/media/${ASSET_ID}`,
    );
    expect([...result.searchParams.keys()].sort()).toEqual(["digest", "expires", "signature", "v"]);
    expect(Object.fromEntries(result.searchParams)).toEqual({
      v: "1",
      digest: SOURCE_DIGEST,
      expires: String(NOW_SECONDS + TTL_SECONDS),
      signature: "d5da8b0b2b081a51985c60f3c8f83242f58c9cb4e7935d6f463bcb783531ac13",
    });
  });

  it("returns exact stored JPEG bytes and their actual output digest for a valid claim", async () => {
    const { service } = harness();

    const payload = await service.read(validReadInput());

    expect(payload).toEqual({
      bytes: JPEG_BYTES,
      mediaType: "image/jpeg",
      outputDigest: sha256(JPEG_BYTES),
    });
  });

  it.each([
    ["expired", () => ({ ...validReadInput(), expires: NOW_SECONDS - 1, signature: sign(ASSET_ID, SOURCE_DIGEST, NOW_SECONDS - 1) })],
    ["malformed", () => ({ ...validReadInput(), signature: "not-hex" })],
    ["tampered signature", () => ({ ...validReadInput(), signature: "0".repeat(64) })],
    ["substituted asset", () => ({ ...validReadInput(), assetId: OTHER_ASSET_ID })],
    ["substituted digest", () => ({ ...validReadInput(), sourceDigest: "a".repeat(64) })],
  ])("rejects a %s claim before protected resource lookup with the generic error", async (_name, buildInput) => {
    const { service, state } = harness();

    await expectUnavailable(service.read(buildInput()));

    expect(state.repositoryLookups).toEqual([]);
    expect(state.storageReads).toEqual([]);
  });

  it.each([
    ["missing asset", { asset: null }],
    ["missing variant", { existingVariant: null }],
  ] as const)("does not disclose a %s", async (_name, options) => {
    const { service } = harness(options);

    await expectUnavailable(service.read(validReadInput()));
  });

  it.each([
    ["reused", { existingVariant: { bytes: Buffer.from("not-jpeg"), mediaType: "image/jpeg" } }],
    ["new", { existingVariant: null, transformedBytes: Buffer.from("not-jpeg") }],
  ] as const)("rejects %s bytes without JPEG magic", async (_name, options) => {
    const { service, state } = harness(options);

    await expectUnavailable(service.prepareUrl(media()));

    expect(state.storageWrites).toEqual([]);
  });

  it("calculates the persisted digest from transformed bytes instead of trusting transformer metadata", async () => {
    const { service, state } = harness({ existingVariant: null });

    await service.prepareUrl(media());

    expect(state.storageWrites[0]?.outputDigest).toBe(sha256(OTHER_JPEG_BYTES));
  });

  it.each([
    ["repository", { repositoryError: new Error("database unavailable") }],
    ["variant storage read", { storageReadError: new Error("storage unavailable") }],
    ["transformer", { existingVariant: null, transformerError: new Error("transform failed") }],
    ["variant storage write", { existingVariant: null, storageWriteError: new Error("write failed") }],
  ] as const)("fails closed when the %s fails", async (_name, options) => {
    const { service } = harness(options);

    await expectUnavailable(service.prepareUrl(media()));
  });

  it.each([
    ["non-HTTPS base URL", { publicBaseUrl: "http://localhost:4000" }],
    ["short signing secret", { signingSecret: "short" }],
    ["out-of-range TTL", { urlTtlSeconds: 59 }],
    ["out-of-range quality", { jpegQuality: 101 }],
  ] as const)("rejects invalid constructor configuration: %s", (_name, options) => {
    expect(() => harness(options)).toThrow();
  });

  it("uses the public access error type for every inaccessible claim", async () => {
    const { service } = harness({ asset: null });

    await expect(service.read(validReadInput())).rejects.toBeInstanceOf(MarketingPublicMediaAccessError);
  });
});
