// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { readMp4DurationMs } from "./mp4-duration";

const textEncoder = new TextEncoder();

function concatenate(...parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function uint64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value);
  return bytes;
}

function box(
  type: string,
  payload: Uint8Array = new Uint8Array(),
  extendedSize = false,
): Uint8Array {
  const typeBytes = textEncoder.encode(type);
  if (extendedSize) {
    return concatenate(uint32(1), typeBytes, uint64(BigInt(16 + payload.byteLength)), payload);
  }
  return concatenate(uint32(8 + payload.byteLength), typeBytes, payload);
}

function movieHeader(
  version: 0 | 1,
  timescale: number,
  duration: bigint,
  extendedSize = false,
): Uint8Array {
  const versionAndFlags = new Uint8Array([version, 0, 0, 0]);
  const timestamps = version === 0 ? new Uint8Array(8) : new Uint8Array(16);
  const durationBytes = version === 0 ? uint32(Number(duration)) : uint64(duration);
  return box(
    "mvhd",
    concatenate(versionAndFlags, timestamps, uint32(timescale), durationBytes),
    extendedSize,
  );
}

function mp4(movieHeaderBox: Uint8Array, extendedMoov = false): Uint8Array {
  return concatenate(
    box("ftyp", textEncoder.encode("isom\u0000\u0000\u0000\u0000isom")),
    box("moov", movieHeaderBox, extendedMoov),
  );
}

describe("MP4 duration inspection", () => {
  it("reads a version 0 movie header duration", () => {
    expect(readMp4DurationMs(mp4(movieHeader(0, 1_000, 24_000n)))).toBe(24_000);
  });

  it("reads version 1 movie headers inside extended-size boxes", () => {
    expect(readMp4DurationMs(mp4(movieHeader(1, 90_000, 2_160_000n, true), true))).toBe(
      24_000,
    );
  });

  it("rejects a file without an ftyp box", () => {
    expect(() => readMp4DurationMs(box("moov", movieHeader(0, 1_000, 24_000n)))).toThrow(
      "MP4 ftyp box is required",
    );
  });

  it("rejects a movie without an mvhd box", () => {
    expect(() => readMp4DurationMs(mp4(box("free")))).toThrow(
      "MP4 mvhd box is required",
    );
  });

  it("rejects a zero movie timescale", () => {
    expect(() => readMp4DurationMs(mp4(movieHeader(0, 0, 24_000n)))).toThrow(
      "MP4 timescale must be greater than zero",
    );
  });

  it("rejects truncated boxes", () => {
    const valid = mp4(movieHeader(0, 1_000, 24_000n));
    const truncated = valid.slice(0, valid.byteLength - 1);

    expect(() => readMp4DurationMs(truncated)).toThrow("MP4 box is truncated");
  });

  it("rejects a duration above the safe integer range", () => {
    const unsafeDuration = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

    expect(() => readMp4DurationMs(mp4(movieHeader(1, 1, unsafeDuration)))).toThrow(
      "MP4 duration exceeds the safe integer range",
    );
  });
});
