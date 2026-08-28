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
});
