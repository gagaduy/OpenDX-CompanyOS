// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { deflateSync } from "node:zlib";
import type { VisualAsset } from "../../domain/entities/marketing-campaign";

// CRC-32 lookup table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Buffer {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, "ascii");
  buf.set(data, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

export function create1x1SquarePngBuffer(
  width = 600,
  height = 600,
  r = 30,
  g = 64,
  b = 175,
): Buffer {
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type: None
    const gradientY = Math.floor((y / height) * 35);
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const gradientX = Math.floor((x / width) * 45);
      rawData[pxOffset] = Math.min(255, r + gradientX);
      rawData[pxOffset + 1] = Math.min(255, g + gradientY);
      rawData[pxOffset + 2] = Math.min(255, b + Math.floor((gradientX + gradientY) / 2));
      rawData[pxOffset + 3] = 255; // Alpha
    }
  }

  const compressedData = deflateSync(rawData);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = makePngChunk("IHDR", ihdrData);
  const idatChunk = makePngChunk("IDAT", compressedData);
  const iendChunk = makePngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

export function generateFacebookVisualPng(
  visualAsset: VisualAsset,
  existingBuffer?: Buffer,
): {
  buffer: Buffer;
  filename: string;
  mediaType: "image/png";
} {
  const buffer =
    existingBuffer && existingBuffer.length >= 8
      ? existingBuffer
      : create1x1SquarePngBuffer(
          visualAsset.width || 600,
          visualAsset.height || 600,
        );

  return {
    buffer,
    filename: `facebook_visual_${visualAsset.campaignId}.png`,
    mediaType: "image/png",
  };
}
