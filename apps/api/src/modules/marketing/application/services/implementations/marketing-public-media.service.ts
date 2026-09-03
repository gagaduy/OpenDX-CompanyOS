// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { MarketingImageTransformerPort } from "../../ports/marketing-image-transformer.port";
import type {
  MarketingPublicMediaStoragePort,
  MarketingPublicMediaVariant,
} from "../../ports/marketing-public-media-storage.port";
import { MarketingPublicMediaIntegrityError } from "../../ports/marketing-public-media-storage.port";
import type { SocialPublishMediaItem } from "../../ports/social-publisher.port";
import type { MarketingRepository } from "../../repositories/interfaces/marketing.repository";
import {
  MarketingPublicMediaAccessError,
  type MarketingPublicMediaPayload,
  type MarketingPublicMediaService,
  type ReadMarketingPublicMediaInput,
} from "../interfaces/marketing-public-media.service";

interface MarketingPublicMediaServiceDependencies {
  readonly repository: MarketingRepository;
  readonly storage: MarketingPublicMediaStoragePort;
  readonly transformer: MarketingImageTransformerPort;
  readonly publicBaseUrl: string;
  readonly signingSecret: string;
  readonly urlTtlSeconds: number;
  readonly jpegQuality: number;
  readonly now?: () => string;
}

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_SIGNING_SECRET_LENGTH = 32;
const MIN_URL_TTL_SECONDS = 60;
const MAX_URL_TTL_SECONDS = 3_600;
const JPEG_CONVERSION_POLICY_VERSION = "marketing-jpeg-policy-v1";

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasJpegMagic(bytes: Buffer): boolean {
  return bytes.byteLength >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
}

function jpegPolicyFingerprint(quality: number): string {
  return createHash("sha256")
    .update(`${JPEG_CONVERSION_POLICY_VERSION}\nquality=${quality}`)
    .digest("hex");
}

function variantKey(assetId: string, sourceDigest: string, policy: string): string {
  return `marketing/public-media/${assetId}/${sourceDigest}/${policy}.jpg`;
}

function epochSeconds(timestamp: string): number {
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) {
    throw new Error("Marketing public media clock returned an invalid timestamp");
  }
  return Math.floor(milliseconds / 1_000);
}

export class MarketingPublicMediaServiceImpl implements MarketingPublicMediaService {
  private readonly repository: MarketingRepository;
  private readonly storage: MarketingPublicMediaStoragePort;
  private readonly transformer: MarketingImageTransformerPort;
  private readonly publicBaseUrl: URL;
  private readonly signingSecret: string;
  private readonly urlTtlSeconds: number;
  private readonly jpegQuality: number;
  private readonly now: () => string;

  constructor(dependencies: MarketingPublicMediaServiceDependencies) {
    const publicBaseUrl = new URL(dependencies.publicBaseUrl);
    if (
      publicBaseUrl.protocol !== "https:"
      || publicBaseUrl.username !== ""
      || publicBaseUrl.password !== ""
      || publicBaseUrl.search !== ""
      || publicBaseUrl.hash !== ""
    ) {
      throw new Error("Marketing public media base URL must be an HTTPS URL without credentials or claims");
    }
    if (dependencies.signingSecret.length < MIN_SIGNING_SECRET_LENGTH) {
      throw new Error("Marketing public media signing secret is too short");
    }
    if (
      !Number.isSafeInteger(dependencies.urlTtlSeconds)
      || dependencies.urlTtlSeconds < MIN_URL_TTL_SECONDS
      || dependencies.urlTtlSeconds > MAX_URL_TTL_SECONDS
    ) {
      throw new Error("Marketing public media URL TTL is outside the supported range");
    }
    if (
      !Number.isInteger(dependencies.jpegQuality)
      || dependencies.jpegQuality < 1
      || dependencies.jpegQuality > 100
    ) {
      throw new Error("Marketing JPEG quality must be an integer from 1 to 100");
    }

    this.repository = dependencies.repository;
    this.storage = dependencies.storage;
    this.transformer = dependencies.transformer;
    this.publicBaseUrl = publicBaseUrl;
    this.signingSecret = dependencies.signingSecret;
    this.urlTtlSeconds = dependencies.urlTtlSeconds;
    this.jpegQuality = dependencies.jpegQuality;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async prepareUrl(media: SocialPublishMediaItem): Promise<string> {
    try {
      const asset = await this.repository.findVisualAssetById(media.id);
      const sourceDigest = sha256(media.bytes);
      if (
        !asset
        || asset.id !== media.id
        || asset.imageDigest !== sourceDigest
        || !DIGEST_PATTERN.test(sourceDigest)
      ) {
        throw new MarketingPublicMediaAccessError();
      }

      const policy = jpegPolicyFingerprint(this.jpegQuality);
      const key = variantKey(asset.id, sourceDigest, policy);
      let existing: MarketingPublicMediaVariant | null;
      try {
        existing = await this.storage.readVariant(key);
      } catch (error) {
        if (!(error instanceof MarketingPublicMediaIntegrityError)) {
          throw error;
        }
        existing = null;
      }
      let outputDigest: string;
      if (existing && this.isReusableVariant(existing, {
        assetId: asset.id,
        sourceDigest,
        policy,
        width: asset.width,
        height: asset.height,
      })) {
        outputDigest = sha256(existing.bytes);
      } else {
        const transformed = await this.transformer.toJpeg(media.bytes, this.jpegQuality);
        if (
          !hasJpegMagic(transformed.bytes)
          || transformed.byteSize !== transformed.bytes.byteLength
          || !Number.isSafeInteger(transformed.width)
          || transformed.width !== asset.width
          || !Number.isSafeInteger(transformed.height)
          || transformed.height !== asset.height
        ) {
          throw new MarketingPublicMediaAccessError();
        }
        outputDigest = sha256(transformed.bytes);
        await this.storage.writeVariant({
          key,
          bytes: transformed.bytes,
          sourceAssetId: asset.id,
          sourceDigest,
          outputDigest,
          policyFingerprint: policy,
          width: transformed.width,
          height: transformed.height,
        });
      }

      const expires = epochSeconds(this.now()) + this.urlTtlSeconds;
      const signature = this.sign(
        asset.id,
        sourceDigest,
        policy,
        outputDigest,
        expires,
      );
      const url = new URL(
        `/v1/public/marketing/media/${encodeURIComponent(asset.id)}`,
        this.publicBaseUrl,
      );
      url.searchParams.set("v", "1");
      url.searchParams.set("digest", sourceDigest);
      url.searchParams.set("policy", policy);
      url.searchParams.set("outputDigest", outputDigest);
      url.searchParams.set("expires", String(expires));
      url.searchParams.set("signature", signature);
      return url.toString();
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async read(input: ReadMarketingPublicMediaInput): Promise<MarketingPublicMediaPayload> {
    try {
      this.verifyClaim(input);

      const asset = await this.repository.findVisualAssetById(input.assetId);
      if (
        !asset
        || asset.id !== input.assetId
        || asset.imageDigest !== input.sourceDigest
      ) {
        throw new MarketingPublicMediaAccessError();
      }

      const variant = await this.storage.readVariant(
        variantKey(asset.id, input.sourceDigest, input.policy),
      );
      if (
        !variant
        || !this.isReusableVariant(variant, {
          assetId: asset.id,
          sourceDigest: input.sourceDigest,
          policy: input.policy,
          outputDigest: input.outputDigest,
          width: asset.width,
          height: asset.height,
        })
      ) {
        throw new MarketingPublicMediaAccessError();
      }
      const outputDigest = sha256(variant.bytes);
      if (outputDigest !== input.outputDigest) {
        throw new MarketingPublicMediaAccessError();
      }

      return {
        bytes: variant.bytes,
        mediaType: "image/jpeg",
        outputDigest,
      };
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  private verifyClaim(input: ReadMarketingPublicMediaInput): void {
    const expectedSignature = Buffer.from(
      this.sign(
        input.assetId,
        input.sourceDigest,
        input.policy,
        input.outputDigest,
        input.expires,
      ),
      "hex",
    );
    const signatureIsWellFormed = DIGEST_PATTERN.test(input.signature);
    const suppliedSignature = signatureIsWellFormed
      ? Buffer.from(input.signature, "hex")
      : Buffer.alloc(expectedSignature.byteLength);
    const signatureMatches = timingSafeEqual(expectedSignature, suppliedSignature);
    const claimIsWellFormed = UUID_PATTERN.test(input.assetId)
      && DIGEST_PATTERN.test(input.sourceDigest)
      && DIGEST_PATTERN.test(input.policy)
      && DIGEST_PATTERN.test(input.outputDigest)
      && Number.isSafeInteger(input.expires);
    const now = epochSeconds(this.now());
    const isUnexpired = input.expires > now;
    const isWithinConfiguredLifetime = input.expires <= now + this.urlTtlSeconds;

    if (
      !claimIsWellFormed
      || !signatureIsWellFormed
      || !signatureMatches
      || !isUnexpired
      || !isWithinConfiguredLifetime
    ) {
      throw new MarketingPublicMediaAccessError();
    }
  }

  private isReusableVariant(
    variant: MarketingPublicMediaVariant,
    expected: {
      readonly assetId: string;
      readonly sourceDigest: string;
      readonly policy: string;
      readonly outputDigest?: string;
      readonly width: number;
      readonly height: number;
    },
  ): boolean {
    const actualOutputDigest = sha256(variant.bytes);
    return variant.mediaType === "image/jpeg"
      && hasJpegMagic(variant.bytes)
      && variant.sourceAssetId === expected.assetId
      && variant.sourceDigest === expected.sourceDigest
      && variant.policyFingerprint === expected.policy
      && variant.outputDigest === actualOutputDigest
      && (expected.outputDigest === undefined || actualOutputDigest === expected.outputDigest)
      && variant.width === expected.width
      && variant.height === expected.height;
  }

  private sign(
    assetId: string,
    sourceDigest: string,
    policy: string,
    outputDigest: string,
    expires: number,
  ): string {
    return createHmac("sha256", this.signingSecret)
      .update(`v1\n${assetId}\n${sourceDigest}\n${policy}\n${outputDigest}\n${expires}`)
      .digest("hex");
  }

  private unavailable(error: unknown): MarketingPublicMediaAccessError {
    if (error instanceof MarketingPublicMediaAccessError) {
      return error;
    }
    return new MarketingPublicMediaAccessError({ cause: error });
  }
}
