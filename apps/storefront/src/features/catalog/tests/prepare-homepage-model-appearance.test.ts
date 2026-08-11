// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
  Texture,
} from "three";
import { describe, expect, it } from "vitest";
import { homepageModelPresentations } from "../lib/homepage-model-presentation";
import { prepareHomepageModelAppearance } from "../lib/prepare-homepage-model-appearance";

describe("homepage model appearance", () => {
  it("defines the approved dark palette for every homepage model", () => {
    expect(
      Object.fromEntries(
        Object.entries(homepageModelPresentations).map(([id, value]) => [
          id,
          value.darkBaseColor,
        ]),
      ),
    ).toEqual({
      smartphone: "#6578d9",
      laptop: "#b7bdc8",
      headphones: "#c46a32",
      "game-controller": "#969eb2",
    });
  });

  it("clones shared materials and applies the dark base color without mutating the source", () => {
    const texture = new Texture();
    const sourceMaterial = new MeshStandardMaterial({
      color: "#ffffff",
      map: texture,
      roughness: 0.37,
    });
    const source = new Group();
    source.add(
      new Mesh(new BoxGeometry(), sourceMaterial),
      new Mesh(new BoxGeometry(), sourceMaterial),
    );

    const result = prepareHomepageModelAppearance(
      source,
      homepageModelPresentations.smartphone,
      "dark",
    );
    const first = result.children[0] as Mesh;
    const second = result.children[1] as Mesh;
    const resultMaterial = first.material as MeshStandardMaterial;

    expect(result).not.toBe(source);
    expect(resultMaterial).not.toBe(sourceMaterial);
    expect(second.material).toBe(resultMaterial);
    expect(resultMaterial.color.getHexString()).toBe("6578d9");
    expect(resultMaterial.map).toBe(texture);
    expect(resultMaterial.roughness).toBe(0.37);
    expect(sourceMaterial.color.getHexString()).toBe("ffffff");
  });

  it("preserves authored light colors while still isolating the material", () => {
    const sourceMaterial = new MeshStandardMaterial({ color: "#c46a32" });
    const source = new Group();
    source.add(new Mesh(new BoxGeometry(), sourceMaterial));

    const result = prepareHomepageModelAppearance(
      source,
      homepageModelPresentations.headphones,
      "light",
    );
    const resultMaterial = (result.children[0] as Mesh)
      .material as MeshStandardMaterial;

    expect(resultMaterial).not.toBe(sourceMaterial);
    expect(resultMaterial.color.getHexString()).toBe("c46a32");
    expect(sourceMaterial.color.getHexString()).toBe("c46a32");
  });

  it("raises a black authored material to a bounded visible shade in dark mode", () => {
    const source = new Group();
    source.add(
      new Mesh(
        new BoxGeometry(),
        new MeshStandardMaterial({ color: "#000000" }),
      ),
    );

    const result = prepareHomepageModelAppearance(
      source,
      homepageModelPresentations["game-controller"],
      "dark",
    );
    const material = (result.children[0] as Mesh)
      .material as MeshStandardMaterial;

    expect(material.color.getHex()).not.toBe(0);
    expect(
      Math.max(material.color.r, material.color.g, material.color.b),
    ).toBeGreaterThan(0.25);
    expect(material.color.getHexString()).not.toBe("969eb2");
  });

  it("clones a material without a color channel without coercing its type", () => {
    const sourceMaterial = new ShaderMaterial();
    const source = new Group();
    source.add(new Mesh(new BoxGeometry(), sourceMaterial));

    const result = prepareHomepageModelAppearance(
      source,
      homepageModelPresentations.laptop,
      "dark",
    );
    const material = (result.children[0] as Mesh).material;

    expect(material).toBeInstanceOf(ShaderMaterial);
    expect(material).not.toBe(sourceMaterial);
  });
});
