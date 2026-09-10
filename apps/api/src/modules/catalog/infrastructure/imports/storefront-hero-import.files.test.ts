// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import {
  MAXIMUM_HERO_CONFIG_BYTES,
  MAXIMUM_HERO_VIDEO_BYTES,
  loadStorefrontHeroImportFiles,
  readBoundedFile,
  type StorefrontHeroImportFileSystem,
} from "./storefront-hero-import.files";

const paths = { filePath: "/imports/hero.mp4", configPath: "/imports/hero.json" };
const validConfig = JSON.stringify({
  code: "nova-signal",
  chapters: [
    {
      categorySlug: "laptops",
      sortOrder: 0,
      startMs: 0,
      endMs: 4_000,
      label: "Laptop nổi bật",
    },
  ],
});

function fileSystem(
  fileSize: StorefrontHeroImportFileSystem["fileSize"],
  readFile: StorefrontHeroImportFileSystem["readFile"],
): StorefrontHeroImportFileSystem {
  return { fileSize, readFile };
}

describe("Storefront hero import file loading", () => {
  it("rejects an oversized configuration before reading its payload", async () => {
    const fileSize = vi.fn(async () => MAXIMUM_HERO_CONFIG_BYTES + 1);
    const readFile = vi.fn(async () => Buffer.from(validConfig));

    await expect(
      loadStorefrontHeroImportFiles(paths, fileSystem(fileSize, readFile)),
    ).rejects.toThrow("Storefront hero configuration exceeds the 65536 byte limit");
    expect(fileSize).toHaveBeenCalledOnce();
    expect(fileSize).toHaveBeenCalledWith(paths.configPath);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects an oversized video without reading its payload", async () => {
    const configBytes = Buffer.from(validConfig);
    const fileSize = vi.fn(async (path: string) =>
      path === paths.configPath ? configBytes.byteLength : MAXIMUM_HERO_VIDEO_BYTES + 1,
    );
    const readFile = vi.fn(async () => configBytes);

    await expect(
      loadStorefrontHeroImportFiles(paths, fileSystem(fileSize, readFile)),
    ).rejects.toThrow("Storefront hero video exceeds the 52428800 byte limit");
    expect(readFile).toHaveBeenCalledOnce();
    expect(readFile).toHaveBeenCalledWith(paths.configPath);
  });

  it("validates configuration before inspecting the video file", async () => {
    const invalidConfig = Buffer.from("{");
    const fileSize = vi.fn(async () => invalidConfig.byteLength);
    const readFile = vi.fn(async () => invalidConfig);

    await expect(
      loadStorefrontHeroImportFiles(paths, fileSystem(fileSize, readFile)),
    ).rejects.toThrow();
    expect(fileSize).toHaveBeenCalledOnce();
    expect(fileSize).toHaveBeenCalledWith(paths.configPath);
    expect(readFile).toHaveBeenCalledOnce();
    expect(readFile).toHaveBeenCalledWith(paths.configPath);
  });

  it("rechecks payload length after reading to catch a file growth race", async () => {
    const fileSize = vi.fn(async () => 4);
    const readFile = vi.fn(async () => Buffer.from("12345"));

    await expect(
      readBoundedFile("/imports/racing.mp4", 4, "Racing file", fileSystem(fileSize, readFile)),
    ).rejects.toThrow("Racing file exceeds the 4 byte limit");
  });
});
