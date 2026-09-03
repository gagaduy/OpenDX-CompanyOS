// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface HttpByteRange {
  readonly offset: number;
  readonly length: number;
  readonly end: number;
}

export class HttpByteRangeError extends Error {}

export function parseSingleByteRange(
  header: string | undefined,
  size: number,
): HttpByteRange | undefined {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new HttpByteRangeError("Unsatisfiable byte range");
  }
  if (header === undefined) return undefined;
  if (header.includes(",")) {
    throw new HttpByteRangeError("Unsupported byte range");
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null || (match[1] === "" && match[2] === "")) {
    throw new HttpByteRangeError("Unsupported byte range");
  }
  const startText = match[1]!;
  const endText = match[2]!;

  if (startText === "") {
    const suffixLength = parseSafeInteger(endText);
    if (suffixLength <= 0) {
      throw new HttpByteRangeError("Unsatisfiable byte range");
    }
    const length = Math.min(suffixLength, size);
    return { offset: size - length, length, end: size - 1 };
  }

  const offset = parseSafeInteger(startText);
  if (offset >= size) {
    throw new HttpByteRangeError("Unsatisfiable byte range");
  }
  const requestedEnd = endText === "" ? size - 1 : parseSafeInteger(endText);
  if (requestedEnd < offset) {
    throw new HttpByteRangeError("Unsatisfiable byte range");
  }
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1, end };
}

function parseSafeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new HttpByteRangeError("Unsupported byte range");
  }
  return parsed;
}
