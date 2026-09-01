// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import sharp from "sharp";
import type {
  MarketingImageTransformerPort,
  MarketingJpegVariant,
} from "../../application/ports/marketing-image-transformer.port";

export class SharpMarketingImageTransformerAdapter
  implements MarketingImageTransformerPort
{
  async toJpeg(source: Buffer, quality: number): Promise<MarketingJpegVariant> {
    if (!Number.isInteger(quality) || quality < 70 || quality > 100) {
      throw new RangeError(
        "JPEG quality must be an integer between 70 and 100",
      );
    }

    const { data, info } = await sharp(source, { failOn: "error" })
      .rotate()
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer({ resolveWithObject: true });

    if (info.width <= 0 || info.height <= 0) {
      throw new Error("JPEG output dimensions must be positive");
    }
    if (
      data.byteLength < 3 ||
      data[0] !== 0xff ||
      data[1] !== 0xd8 ||
      data[2] !== 0xff
    ) {
      throw new Error("Image transformation did not produce a valid JPEG");
    }

    return {
      bytes: data,
      width: info.width,
      height: info.height,
      byteSize: data.byteLength,
      sha256Digest: createHash("sha256").update(data).digest("hex"),
    };
  }
}
