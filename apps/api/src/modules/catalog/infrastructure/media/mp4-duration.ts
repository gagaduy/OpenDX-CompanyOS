// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

const BASIC_BOX_HEADER_SIZE = 8;
const EXTENDED_BOX_HEADER_SIZE = 16;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

interface IsoBox {
  readonly type: string;
  readonly contentStart: number;
  readonly end: number;
}

export function readMp4DurationMs(bytes: Uint8Array): number {
  const topLevelBoxes = readBoxes(bytes, 0, bytes.byteLength);
  if (!topLevelBoxes.some((box) => box.type === "ftyp")) {
    throw new Error("MP4 ftyp box is required");
  }

  const movieBox = topLevelBoxes.find((box) => box.type === "moov");
  if (movieBox === undefined) {
    throw new Error("MP4 mvhd box is required");
  }

  const movieHeaderBox = readBoxes(bytes, movieBox.contentStart, movieBox.end).find(
    (box) => box.type === "mvhd",
  );
  if (movieHeaderBox === undefined) {
    throw new Error("MP4 mvhd box is required");
  }

  return readMovieHeaderDurationMs(bytes, movieHeaderBox);
}

function readMovieHeaderDurationMs(bytes: Uint8Array, box: IsoBox): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  requireAvailable(box.contentStart, 4, box.end);
  const version = view.getUint8(box.contentStart);

  let timescaleOffset: number;
  let duration: bigint;
  if (version === 0) {
    timescaleOffset = box.contentStart + 12;
    requireAvailable(timescaleOffset, 8, box.end);
    duration = BigInt(view.getUint32(timescaleOffset + 4));
  } else if (version === 1) {
    timescaleOffset = box.contentStart + 20;
    requireAvailable(timescaleOffset, 12, box.end);
    duration = view.getBigUint64(timescaleOffset + 4);
  } else {
    throw new Error(`Unsupported MP4 mvhd version: ${version}`);
  }

  const timescale = BigInt(view.getUint32(timescaleOffset));
  if (timescale === 0n) {
    throw new Error("MP4 timescale must be greater than zero");
  }

  const durationMs = (duration * 1_000n) / timescale;
  if (durationMs > MAX_SAFE_INTEGER_BIGINT) {
    throw new Error("MP4 duration exceeds the safe integer range");
  }
  return Number(durationMs);
}

function readBoxes(bytes: Uint8Array, start: number, end: number): IsoBox[] {
  const boxes: IsoBox[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = start;

  while (offset < end) {
    requireAvailable(offset, BASIC_BOX_HEADER_SIZE, end);
    const compactSize = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );

    let headerSize = BASIC_BOX_HEADER_SIZE;
    let size = BigInt(compactSize);
    if (compactSize === 1) {
      requireAvailable(offset, EXTENDED_BOX_HEADER_SIZE, end);
      headerSize = EXTENDED_BOX_HEADER_SIZE;
      size = view.getBigUint64(offset + BASIC_BOX_HEADER_SIZE);
    } else if (compactSize === 0) {
      size = BigInt(end - offset);
    }

    if (size < BigInt(headerSize)) {
      throw new Error("MP4 box size is invalid");
    }
    if (size > MAX_SAFE_INTEGER_BIGINT) {
      throw new Error("MP4 box is truncated");
    }

    const boxEnd = offset + Number(size);
    if (boxEnd > end) {
      throw new Error("MP4 box is truncated");
    }

    boxes.push({ type, contentStart: offset + headerSize, end: boxEnd });
    offset = boxEnd;
  }

  return boxes;
}

function requireAvailable(offset: number, length: number, end: number): void {
  if (offset + length > end) {
    throw new Error("MP4 box is truncated");
  }
}
