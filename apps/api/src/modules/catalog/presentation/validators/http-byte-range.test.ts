// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseSingleByteRange } from "./http-byte-range";

describe("parseSingleByteRange", () => {
  it("accepts absent, bounded, open-ended, and suffix ranges", () => {
    expect(parseSingleByteRange(undefined, 100)).toBeUndefined();
    expect(parseSingleByteRange("bytes=10-19", 100)).toEqual({
      offset: 10,
      length: 10,
      end: 19,
    });
    expect(parseSingleByteRange("bytes=90-", 100)).toEqual({
      offset: 90,
      length: 10,
      end: 99,
    });
    expect(parseSingleByteRange("bytes=-10", 100)).toEqual({
      offset: 90,
      length: 10,
      end: 99,
    });
  });

  it("rejects multiple and unsatisfiable ranges", () => {
    expect(() => parseSingleByteRange("bytes=0-1,4-5", 100)).toThrow(
      "Unsupported byte range",
    );
    expect(() => parseSingleByteRange("bytes=100-101", 100)).toThrow(
      "Unsatisfiable byte range",
    );
  });

  it.each([
    ["bytes=abc-def", 100],
    ["items=0-1", 100],
    ["bytes=-0", 100],
    ["bytes=0-1", 0],
    ["bytes=0-1", -1],
    ["bytes=0-1", Number.NaN],
  ])("rejects malformed range %s with size %s safely", (range, size) => {
    expect(() => parseSingleByteRange(range, size)).toThrow();
  });
});
