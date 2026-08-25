// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Material,
  Mesh,
  Object3D,
  Texture,
  type BufferGeometry,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { HomepageModelAsset } from "../types/homepage-experience.types";

export type HomepageModelErrorCode =
  | "MODEL_TIMEOUT"
  | "MODEL_HTTP_ERROR"
  | "MODEL_NETWORK_ERROR"
  | "MODEL_PARSE_ERROR";

export class HomepageModelLoadError extends Error {
  constructor(
    readonly code: HomepageModelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HomepageModelLoadError";
  }
}

interface FetchGlbOptions {
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

interface HomepageModelLoaderDependencies extends FetchGlbOptions {
  readonly parser?: (bytes: ArrayBuffer, basePath: string) => Promise<Object3D>;
}

const modelCache = new Map<string, Promise<Object3D>>();

export async function fetchGlbBytes(
  url: string,
  { timeoutMs = 10_000, fetcher = fetch }: FetchGlbOptions = {},
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) {
      throw new HomepageModelLoadError(
        "MODEL_HTTP_ERROR",
        `Model request failed with status ${String(response.status)}`,
      );
    }
    return await response.arrayBuffer();
  } catch (error) {
    if (error instanceof HomepageModelLoadError) throw error;
    if (timedOut) {
      throw new HomepageModelLoadError(
        "MODEL_TIMEOUT",
        "Model request exceeded its timeout",
      );
    }
    throw new HomepageModelLoadError(
      "MODEL_NETWORK_ERROR",
      "Model request failed",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function parseGlbBytes(
  bytes: ArrayBuffer,
  basePath: string,
): Promise<Object3D> {
  try {
    return (await new GLTFLoader().parseAsync(bytes, basePath)).scene;
  } catch {
    throw new HomepageModelLoadError(
      "MODEL_PARSE_ERROR",
      "Model bytes could not be parsed",
    );
  }
}

export function preloadHomepageModel(
  asset: HomepageModelAsset,
  dependencies: HomepageModelLoaderDependencies = {},
): Promise<Object3D> {
  const cached = modelCache.get(asset.path);
  if (cached !== undefined) return cached;

  const basePath = asset.path.slice(0, asset.path.lastIndexOf("/") + 1);
  const promise = fetchGlbBytes(asset.path, dependencies)
    .then((bytes) =>
      dependencies.parser === undefined
        ? parseGlbBytes(bytes, basePath)
        : dependencies.parser(bytes, basePath),
    )
    .catch((error: unknown) => {
      modelCache.delete(asset.path);
      if (error instanceof HomepageModelLoadError) throw error;
      throw new HomepageModelLoadError(
        "MODEL_PARSE_ERROR",
        "Model bytes could not be parsed",
      );
    });
  modelCache.set(asset.path, promise);
  return promise;
}

export async function clearHomepageModelCache({
  dispose = false,
}: { readonly dispose?: boolean } = {}): Promise<void> {
  const cached = [...modelCache.values()];
  modelCache.clear();
  if (!dispose) return;
  const models = await Promise.allSettled(cached);
  for (const model of models) {
    if (model.status === "fulfilled") disposeObject3D(model.value);
  }
}

export function disposeObject3D(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
