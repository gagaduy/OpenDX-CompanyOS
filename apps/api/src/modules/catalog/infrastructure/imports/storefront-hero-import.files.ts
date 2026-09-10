// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { readFile, stat } from "node:fs/promises";
import {
  parseStorefrontHeroImportConfig,
  type StorefrontHeroImportArguments,
  type StorefrontHeroImportConfig,
} from "./storefront-hero-import.config";

export const MAXIMUM_HERO_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAXIMUM_HERO_CONFIG_BYTES = 64 * 1024;

export interface StorefrontHeroImportFileSystem {
  fileSize(path: string): Promise<number>;
  readFile(path: string): Promise<Uint8Array>;
}

const nodeFileSystem: StorefrontHeroImportFileSystem = {
  async fileSize(path) {
    return (await stat(path)).size;
  },
  readFile,
};

export async function loadStorefrontHeroImportFiles(
  paths: StorefrontHeroImportArguments,
  fileSystem: StorefrontHeroImportFileSystem = nodeFileSystem,
): Promise<{ readonly config: StorefrontHeroImportConfig; readonly bytes: Uint8Array }> {
  const configBytes = await readBoundedFile(
    paths.configPath,
    MAXIMUM_HERO_CONFIG_BYTES,
    "Storefront hero configuration",
    fileSystem,
  );
  const config = parseStorefrontHeroImportConfig(
    new TextDecoder("utf-8", { fatal: true }).decode(configBytes),
  );
  const bytes = await readBoundedFile(
    paths.filePath,
    MAXIMUM_HERO_VIDEO_BYTES,
    "Storefront hero video",
    fileSystem,
  );
  return { config, bytes };
}

export async function readBoundedFile(
  path: string,
  maximumBytes: number,
  description: string,
  fileSystem: StorefrontHeroImportFileSystem = nodeFileSystem,
): Promise<Uint8Array> {
  const size = await fileSystem.fileSize(path);
  if (!Number.isSafeInteger(size) || size < 0 || size > maximumBytes) {
    throw new Error(`${description} exceeds the ${maximumBytes} byte limit`);
  }

  const bytes = await fileSystem.readFile(path);
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`${description} exceeds the ${maximumBytes} byte limit`);
  }
  return bytes;
}
