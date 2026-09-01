// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { create1x1SquarePngBuffer } from "../generators/facebook-visual-png.generator";
import { SharpMarketingImageTransformerAdapter } from "./sharp-marketing-image-transformer.adapter";

describe("SharpMarketingImageTransformerAdapter", () => {
  const adapter = new SharpMarketingImageTransformerAdapter();

  it("transforms the generated Marketing PNG into a valid JPEG variant", async () => {
    const source = create1x1SquarePngBuffer(1080, 1080);

    const result = await adapter.toJpeg(source, 90);

    expect(result.bytes.subarray(0, 3)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.byteSize).toBe(result.bytes.byteLength);
    expect(result.sha256Digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects invalid source bytes instead of fabricating a placeholder", async () => {
    await expect(
      adapter.toJpeg(Buffer.from("not-an-image"), 90),
    ).rejects.toThrow();
  });

  it.each([69, 101, 90.5])("rejects invalid JPEG quality %s", async (quality) => {
    const source = create1x1SquarePngBuffer(1, 1);

    await expect(adapter.toJpeg(source, quality)).rejects.toThrow(
      "JPEG quality must be an integer between 70 and 100",
    );
  });
});
