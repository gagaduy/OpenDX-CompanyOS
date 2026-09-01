// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { MinioMarketingArtifactStorage } from "./minio-marketing-artifact.storage";

describe("MinioMarketingArtifactStorage", () => {
  it("writes immutable marketing bytes with their content type", async () => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const storage = new MinioMarketingArtifactStorage(
      { putObject } as never,
      "product-media",
    );
    const buffer = Buffer.from("valid-png-bytes");

    await storage.write(
      "marketing/campaign-1/visual_v2.png",
      buffer,
      "image/png",
    );

    expect(putObject).toHaveBeenCalledWith(
      "product-media",
      "marketing/campaign-1/visual_v2.png",
      buffer,
      buffer.byteLength,
      { "Content-Type": "image/png" },
    );
  });

  it("reads the complete private object stream", async () => {
    const getObject = vi.fn().mockResolvedValue(
      Readable.from([Buffer.from("first-"), Buffer.from("second")]),
    );
    const storage = new MinioMarketingArtifactStorage(
      { getObject } as never,
      "product-media",
    );

    await expect(
      storage.read("marketing/campaign-1/visual_v2.png"),
    ).resolves.toEqual(Buffer.from("first-second"));
  });

  it("rejects keys outside the Marketing prefix", async () => {
    const storage = new MinioMarketingArtifactStorage(
      { putObject: vi.fn() } as never,
      "product-media",
    );

    await expect(
      storage.write("../catalog/private.png", Buffer.from("x"), "image/png"),
    ).rejects.toThrow(/unsafe marketing storage key/i);
  });

  it.each(["NoSuchKey", "NotFound"])(
    "returns null when MinIO stat reports %s",
    async (code) => {
      const statObject = vi.fn().mockRejectedValue(
        Object.assign(new Error("object missing"), { code }),
      );
      const getObject = vi.fn();
      const storage = new MinioMarketingArtifactStorage(
        { getObject, statObject } as never,
        "product-media",
      );

      await expect(
        storage.readVariant(
          "marketing/public-media/asset-1/source-digest.jpg",
        ),
      ).resolves.toBeNull();
      expect(getObject).not.toHaveBeenCalled();
    },
  );

  it.each([
    Object.assign(new Error("access denied"), { code: "AccessDenied" }),
    Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
  ])("propagates MinIO stat failures with code $code", async (statError) => {
    const storage = new MinioMarketingArtifactStorage(
      {
        getObject: vi.fn(),
        statObject: vi.fn().mockRejectedValue(statError),
      } as never,
      "product-media",
    );

    await expect(
      storage.readVariant(
        "marketing/public-media/asset-1/source-digest.jpg",
      ),
    ).rejects.toBe(statError);
  });

  it.each(["NoSuchKey", "NotFound"])(
    "returns null when a %s variant disappears after stat",
    async (code) => {
      const storage = new MinioMarketingArtifactStorage(
        {
          statObject: vi.fn().mockResolvedValue({
            size: 12,
            etag: "jpeg-etag",
            lastModified: new Date("2026-09-02T00:00:00.000Z"),
            metaData: { "content-type": "image/jpeg" },
            versionId: null,
          }),
          getObject: vi.fn().mockRejectedValue(
            Object.assign(new Error("object disappeared"), { code }),
          ),
        } as never,
        "product-media",
      );

      await expect(
        storage.readVariant(
          "marketing/public-media/asset-1/source-digest.jpg",
        ),
      ).resolves.toBeNull();
    },
  );

  it("propagates a transport failure while opening an existing variant", async () => {
    const transportError = Object.assign(new Error("connection reset"), {
      code: "ECONNRESET",
    });
    const storage = new MinioMarketingArtifactStorage(
      {
        statObject: vi.fn().mockResolvedValue({
          size: 12,
          etag: "jpeg-etag",
          lastModified: new Date("2026-09-02T00:00:00.000Z"),
          metaData: { "content-type": "image/jpeg" },
          versionId: null,
        }),
        getObject: vi.fn().mockRejectedValue(transportError),
      } as never,
      "product-media",
    );

    await expect(
      storage.readVariant(
        "marketing/public-media/asset-1/source-digest.jpg",
      ),
    ).rejects.toBe(transportError);
  });

  it("propagates a failure while streaming an existing variant", async () => {
    const streamError = new Error("stream interrupted");
    const stream = Readable.from(
      (async function* () {
        yield Buffer.from("partial-");
        throw streamError;
      })(),
    );
    const storage = new MinioMarketingArtifactStorage(
      {
        statObject: vi.fn().mockResolvedValue({
          size: 12,
          etag: "jpeg-etag",
          lastModified: new Date("2026-09-02T00:00:00.000Z"),
          metaData: { "content-type": "image/jpeg" },
          versionId: null,
        }),
        getObject: vi.fn().mockResolvedValue(stream),
      } as never,
      "product-media",
    );

    await expect(
      storage.readVariant(
        "marketing/public-media/asset-1/source-digest.jpg",
      ),
    ).rejects.toBe(streamError);
  });

  it("reads a complete private JPEG variant after checking its content type", async () => {
    const statObject = vi.fn().mockResolvedValue({
      size: 12,
      etag: "jpeg-etag",
      lastModified: new Date("2026-09-02T00:00:00.000Z"),
      metaData: { "content-type": "image/jpeg" },
      versionId: null,
    });
    const getObject = vi.fn().mockResolvedValue(
      Readable.from([Buffer.from("jpeg-"), Buffer.from("bytes")]),
    );
    const storage = new MinioMarketingArtifactStorage(
      { getObject, statObject } as never,
      "product-media",
    );

    await expect(
      storage.readVariant(
        "marketing/public-media/asset-1/source-digest.jpg",
      ),
    ).resolves.toEqual({
      bytes: Buffer.from("jpeg-bytes"),
      mediaType: "image/jpeg",
    });
  });

  it("fails closed when a stored variant is not JPEG", async () => {
    const getObject = vi.fn();
    const storage = new MinioMarketingArtifactStorage(
      {
        getObject,
        statObject: vi.fn().mockResolvedValue({
          size: 9,
          etag: "png-etag",
          lastModified: new Date("2026-09-02T00:00:00.000Z"),
          metaData: { "content-type": "image/png" },
          versionId: null,
        }),
      } as never,
      "product-media",
    );

    await expect(
      storage.readVariant(
        "marketing/public-media/asset-1/source-digest.jpg",
      ),
    ).rejects.toThrow(/must be image\/jpeg/i);
    expect(getObject).not.toHaveBeenCalled();
  });

  it("writes a JPEG variant with source and output provenance metadata", async () => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const storage = new MinioMarketingArtifactStorage(
      { putObject } as never,
      "product-media",
    );
    const bytes = Buffer.from("jpeg-bytes");

    await storage.writeVariant({
      key: "marketing/public-media/asset-1/source-digest.jpg",
      bytes,
      sourceAssetId: "asset-1",
      sourceDigest: "a".repeat(64),
      outputDigest: "b".repeat(64),
      width: 1080,
      height: 1080,
    });

    expect(putObject).toHaveBeenCalledWith(
      "product-media",
      "marketing/public-media/asset-1/source-digest.jpg",
      bytes,
      bytes.byteLength,
      {
        "Content-Type": "image/jpeg",
        "source-asset-id": "asset-1",
        "source-digest": "a".repeat(64),
        "output-digest": "b".repeat(64),
        width: "1080",
        height: "1080",
      },
    );
  });

  it.each([
    "catalog/public-media/asset-1/source-digest.jpg",
    "marketing/public-media/../private.jpg",
    "marketing/public-media/asset-1\\private.jpg",
  ])("rejects unsafe JPEG variant key %s", async (key) => {
    const putObject = vi.fn();
    const storage = new MinioMarketingArtifactStorage(
      { putObject } as never,
      "product-media",
    );

    await expect(
      storage.writeVariant({
        key,
        bytes: Buffer.from("jpeg-bytes"),
        sourceAssetId: "asset-1",
        sourceDigest: "a".repeat(64),
        outputDigest: "b".repeat(64),
        width: 1080,
        height: 1080,
      }),
    ).rejects.toThrow(/unsafe marketing storage key/i);
    expect(putObject).not.toHaveBeenCalled();
  });
});
