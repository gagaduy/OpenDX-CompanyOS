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
import { MarketingPublicMediaIntegrityError } from "../../ports/marketing-public-media-storage.port";
import type { SocialPublishMediaItem } from "../../ports/social-publisher.port";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import type { VisualAsset } from "../../../domain/entities/marketing-campaign";
import {
  MarketingPublicMediaAccessError,
  MarketingPublicMediaPreparationError,
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
const POLICY_85 = "bd0f54974cd5a1d6a5c9de0749da2b7ada2ed380767bf26346a0a94681b3f18d";
const POLICY_86 = "c04bde095a9865ce15f6100a192c47d4bd6760d51696e09629226a8a091ddf4e";
const JPEG_DIGEST = "6f18bea31ace0455d61ac9394b95b48b03747c26ba414b8bc1cac0f216187442";
const VARIANT_KEY = `marketing/public-media/${ASSET_ID}/${SOURCE_DIGEST}/${POLICY_85}.jpg`;

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

function storedVariant(
  overrides: Partial<MarketingPublicMediaVariant> = {},
): MarketingPublicMediaVariant {
  return {
    bytes: JPEG_BYTES,
    mediaType: "image/jpeg",
    sourceAssetId: ASSET_ID,
    sourceDigest: SOURCE_DIGEST,
    outputDigest: JPEG_DIGEST,
    policyFingerprint: POLICY_85,
    width: 1080,
    height: 1080,
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
    const configuredPolicy = options.jpegQuality === 86 ? POLICY_86 : POLICY_85;
    const configuredKey = `marketing/public-media/${ASSET_ID}/${SOURCE_DIGEST}/${configuredPolicy}.jpg`;
    variants.set(
      configuredKey,
      options.existingVariant ?? storedVariant({ policyFingerprint: configuredPolicy }),
    );
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
      variants.set(input.key, {
        bytes: Buffer.from(input.bytes),
        mediaType: "image/jpeg",
        sourceAssetId: input.sourceAssetId,
        sourceDigest: input.sourceDigest,
        outputDigest: input.outputDigest,
        policyFingerprint: input.policyFingerprint,
        width: input.width,
        height: input.height,
      });
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

function sign(
  assetId: string,
  sourceDigest: string,
  policy: string,
  outputDigest: string,
  expires: number,
): string {
  return createHmac("sha256", SECRET)
    .update(`v1\n${assetId}\n${sourceDigest}\n${policy}\n${outputDigest}\n${expires}`)
    .digest("hex");
}

function validReadInput() {
  const expires = NOW_SECONDS + TTL_SECONDS;
  return {
    assetId: ASSET_ID,
    sourceDigest: SOURCE_DIGEST,
    policy: POLICY_85,
    outputDigest: JPEG_DIGEST,
    expires,
    signature: sign(ASSET_ID, SOURCE_DIGEST, POLICY_85, JPEG_DIGEST, expires),
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

    await expect(service.prepareUrl(media({ bytes: Buffer.from("tampered") }))).rejects.toEqual(
      expect.objectContaining({
        name: "MarketingPublicMediaPreparationError",
        code: "MARKETING_MEDIA_INVALID",
        retryable: false,
      }),
    );

    expect(state.storageReads).toEqual([]);
    expect(state.transformCalls).toEqual([]);
  });

  it("derives the private variant key from the asset, source digest, and versioned JPEG policy", async () => {
    const { service, state } = harness();

    await service.prepareUrl(media());

    expect(state.storageReads).toEqual([VARIANT_KEY]);
  });

  it("materializes different variants and claims when JPEG quality changes", async () => {
    const quality85 = harness({ existingVariant: null, jpegQuality: 85 });
    const quality86 = harness({ existingVariant: null, jpegQuality: 86 });

    const url85 = new URL(await quality85.service.prepareUrl(media()));
    const url86 = new URL(await quality86.service.prepareUrl(media()));

    expect(quality85.state.storageReads).toEqual([
      `marketing/public-media/${ASSET_ID}/${SOURCE_DIGEST}/${POLICY_85}.jpg`,
    ]);
    expect(quality86.state.storageReads).toEqual([
      `marketing/public-media/${ASSET_ID}/${SOURCE_DIGEST}/${POLICY_86}.jpg`,
    ]);
    expect(quality85.state.transformCalls).toEqual([{ source: PNG_BYTES, quality: 85 }]);
    expect(quality86.state.transformCalls).toEqual([{ source: PNG_BYTES, quality: 86 }]);
    expect(quality85.state.storageWrites).toHaveLength(1);
    expect(quality86.state.storageWrites).toHaveLength(1);
    expect(url85.searchParams.get("policy")).toBe(POLICY_85);
    expect(url86.searchParams.get("policy")).toBe(POLICY_86);
    expect(url85.searchParams.get("signature")).not.toBe(url86.searchParams.get("signature"));
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
      policyFingerprint: POLICY_85,
      width: 1080,
      height: 1080,
    }]);
  });

  it.each([
    ["wrong asset", storedVariant({ sourceAssetId: OTHER_ASSET_ID })],
    ["wrong source digest", storedVariant({ sourceDigest: "a".repeat(64) })],
    ["wrong policy", storedVariant({ policyFingerprint: POLICY_86 })],
    ["wrong output digest", storedVariant({ outputDigest: "a".repeat(64) })],
    ["wrong width", storedVariant({ width: 720 })],
    ["wrong height", storedVariant({ height: 720 })],
  ])("regenerates a cached JPEG with %s provenance before signing", async (_name, existingVariant) => {
    const { service, state } = harness({ existingVariant });

    const url = new URL(await service.prepareUrl(media()));

    expect(state.transformCalls).toEqual([{ source: PNG_BYTES, quality: 85 }]);
    expect(state.storageWrites).toHaveLength(1);
    expect(url.searchParams.get("outputDigest")).toBe(sha256(OTHER_JPEG_BYTES));
  });

  it("regenerates a variant when storage reports missing or malformed provenance", async () => {
    const { service, state } = harness({
      storageReadError: new MarketingPublicMediaIntegrityError(),
    });

    await service.prepareUrl(media());

    expect(state.transformCalls).toEqual([{ source: PNG_BYTES, quality: 85 }]);
    expect(state.storageWrites).toHaveLength(1);
  });

  it("returns the configured HTTPS endpoint with only bounded signed claims", async () => {
    const { service } = harness({ publicBaseUrl: "https://stable-tunnel.trycloudflare.com/" });

    const result = new URL(await service.prepareUrl(media()));

    expect(`${result.origin}${result.pathname}`).toBe(
      `https://stable-tunnel.trycloudflare.com/v1/public/marketing/media/${ASSET_ID}`,
    );
    expect([...result.searchParams.keys()].sort()).toEqual([
      "digest",
      "expires",
      "outputDigest",
      "policy",
      "signature",
      "v",
    ]);
    expect(Object.fromEntries(result.searchParams)).toEqual({
      v: "1",
      digest: SOURCE_DIGEST,
      policy: POLICY_85,
      outputDigest: JPEG_DIGEST,
      expires: String(NOW_SECONDS + TTL_SECONDS),
      signature: "13f2ac892622dbce7ad3fc693c262a3fdb1f2dec72714bf478e99679547e0e4a",
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

  it("validates a signed claim without looking up protected resources", () => {
    const { service, state } = harness();

    service.assertValidClaim(validReadInput());

    expect(state.repositoryLookups).toEqual([]);
    expect(state.storageReads).toEqual([]);
  });

  it.each([
    ["expired", () => ({
      ...validReadInput(),
      expires: NOW_SECONDS - 1,
      signature: sign(ASSET_ID, SOURCE_DIGEST, POLICY_85, JPEG_DIGEST, NOW_SECONDS - 1),
    })],
    ["excessive future expiry", () => {
      const expires = NOW_SECONDS + TTL_SECONDS + 1;
      return {
        ...validReadInput(),
        expires,
        signature: sign(ASSET_ID, SOURCE_DIGEST, POLICY_85, JPEG_DIGEST, expires),
      };
    }],
    ["malformed", () => ({ ...validReadInput(), signature: "not-hex" })],
    ["tampered signature", () => ({ ...validReadInput(), signature: "0".repeat(64) })],
    ["substituted asset", () => ({ ...validReadInput(), assetId: OTHER_ASSET_ID })],
    ["substituted digest", () => ({ ...validReadInput(), sourceDigest: "a".repeat(64) })],
    ["substituted policy", () => ({ ...validReadInput(), policy: POLICY_86 })],
    ["substituted output digest", () => ({ ...validReadInput(), outputDigest: "a".repeat(64) })],
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

  it("regenerates cached bytes without JPEG magic", async () => {
    const { service, state } = harness({
      existingVariant: storedVariant({ bytes: Buffer.from("not-jpeg") }),
    });

    await service.prepareUrl(media());

    expect(state.transformCalls).toEqual([{ source: PNG_BYTES, quality: 85 }]);
    expect(state.storageWrites).toHaveLength(1);
  });

  it("rejects newly transformed bytes without JPEG magic", async () => {
    const { service, state } = harness({
      existingVariant: null,
      transformedBytes: Buffer.from("not-jpeg"),
    });

    await expect(service.prepareUrl(media())).rejects.toEqual(
      expect.objectContaining({
        name: "MarketingPublicMediaPreparationError",
        code: "MARKETING_MEDIA_INVALID",
        retryable: false,
      }),
    );

    expect(state.storageWrites).toEqual([]);
  });

  it("rejects valid-looking JPEG bytes that differ from the exact signed output digest", async () => {
    const { service } = harness({
      existingVariant: storedVariant({ bytes: OTHER_JPEG_BYTES }),
    });

    await expectUnavailable(service.read(validReadInput()));
  });

  it.each([
    ["asset", storedVariant({ sourceAssetId: OTHER_ASSET_ID })],
    ["source digest", storedVariant({ sourceDigest: "a".repeat(64) })],
    ["policy", storedVariant({ policyFingerprint: POLICY_86 })],
    ["output digest", storedVariant({ outputDigest: "a".repeat(64) })],
    ["width", storedVariant({ width: 720 })],
    ["height", storedVariant({ height: 720 })],
  ])("denies public retrieval when stored %s provenance changed after URL issuance", async (_name, existingVariant) => {
    const { service } = harness({ existingVariant });

    await expectUnavailable(service.read(validReadInput()));
  });

  it("denies malformed stored provenance without regenerating during public retrieval", async () => {
    const { service, state } = harness({
      storageReadError: new MarketingPublicMediaIntegrityError(),
    });

    await expectUnavailable(service.read(validReadInput()));

    expect(state.transformCalls).toEqual([]);
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
    ["variant storage write", { existingVariant: null, storageWriteError: new Error("write failed") }],
  ] as const)("classifies %s availability failure as bounded and retryable", async (_name, options) => {
    const { service } = harness(options);

    await expect(service.prepareUrl(media())).rejects.toEqual(
      expect.objectContaining({
        name: "MarketingPublicMediaPreparationError",
        code: "MARKETING_MEDIA_UNAVAILABLE",
        retryable: true,
      }),
    );
  });

  it("classifies deterministic transformer rejection as bounded and non-retryable", async () => {
    const { service } = harness({
      existingVariant: null,
      transformerError: new Error("secret decoder detail"),
    });

    await expect(service.prepareUrl(media())).rejects.toEqual(
      expect.objectContaining({
        name: "MarketingPublicMediaPreparationError",
        code: "MARKETING_MEDIA_INVALID",
        retryable: false,
      }),
    );
    await expect(service.prepareUrl(media())).rejects.not.toThrow("secret decoder detail");
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

  it("uses the preparation error type only for publication preparation", async () => {
    const { service } = harness({ repositoryError: new Error("database unavailable") });

    await expect(service.prepareUrl(media())).rejects.toBeInstanceOf(MarketingPublicMediaPreparationError);
  });
});
