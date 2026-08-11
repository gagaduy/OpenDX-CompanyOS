// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { homepageModelAssets } from "../data/homepage-model-assets";
import {
  clearHomepageModelCache,
  disposeObject3D,
  fetchGlbBytes,
  preloadHomepageModel,
} from "../lib/homepage-model-loader";

describe("homepage model loader", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await clearHomepageModelCache();
  });

  it("aborts a model fetch at the exact timeout", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const result = fetchGlbBytes("/model.glb", {
      timeoutMs: 10,
      fetcher,
    });
    const expectation = expect(result).rejects.toMatchObject({
      code: "MODEL_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(10);
    await expectation;
  });

  it("maps HTTP, network, and successful byte responses", async () => {
    await expect(
      fetchGlbBytes("/model.glb", {
        timeoutMs: 100,
        fetcher: vi.fn(async () => new Response(null, { status: 503 })),
      }),
    ).rejects.toMatchObject({ code: "MODEL_HTTP_ERROR" });

    await expect(
      fetchGlbBytes("/model.glb", {
        timeoutMs: 100,
        fetcher: vi.fn(async () => {
          throw new Error("offline");
        }),
      }),
    ).rejects.toMatchObject({ code: "MODEL_NETWORK_ERROR" });

    const expected = new Uint8Array([1, 2, 3]).buffer;
    await expect(
      fetchGlbBytes("/model.glb", {
        timeoutMs: 100,
        fetcher: vi.fn(async () => new Response(expected)),
      }),
    ).resolves.toEqual(expected);
  });

  it("shares one in-flight model request for the same local asset", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1]).buffer));
    const scene = new Group();
    const parser = vi.fn(async () => scene);
    const asset = homepageModelAssets[0];

    const [first, second] = await Promise.all([
      preloadHomepageModel(asset, { fetcher, parser }),
      preloadHomepageModel(asset, { fetcher, parser }),
    ]);

    expect(first).toBe(scene);
    expect(second).toBe(scene);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(parser).toHaveBeenCalledTimes(1);
  });

  it("disposes geometry, material, and texture exactly once", () => {
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    const root = new Group();
    root.add(new Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");

    disposeObject3D(root);

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });
});
