// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { homepageModelAssets } from "../data/homepage-model-assets";

describe("homepage model assets", () => {
  it("maps four unique local GLB files with immutable checksums", () => {
    expect(homepageModelAssets.map((asset) => asset.id)).toEqual([
      "smartphone",
      "laptop",
      "headphones",
      "game-controller",
    ]);

    for (const asset of homepageModelAssets) {
      expect(asset.path).toMatch(/^\/models\/homepage\/.+\.glb$/);
      const bytes = readFileSync(
        resolve(process.cwd(), "public", asset.path.slice(1)),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        asset.sha256,
      );
    }
  });
});
