// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Color,
  Mesh,
  Texture,
  type Material,
  type Object3D,
} from "three";
import type { HomepageModelPresentation } from "./homepage-model-presentation";

type ColorMaterial = Material & { readonly color: Color };
type TexturedEmissiveMaterial = ColorMaterial & {
  readonly emissive: Color;
  emissiveIntensity: number;
  readonly map: Texture;
};

function hasColor(material: Material): material is ColorMaterial {
  return "color" in material && material.color instanceof Color;
}

function hasTexturedEmissive(
  material: ColorMaterial,
): material is TexturedEmissiveMaterial {
  return (
    "map" in material &&
    material.map instanceof Texture &&
    "emissive" in material &&
    material.emissive instanceof Color &&
    "emissiveIntensity" in material &&
    typeof material.emissiveIntensity === "number"
  );
}

function shadeFor(color: Color): number {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return 0.68 + Math.min(1, Math.max(0, hsl.l)) * 0.32;
}

export function prepareHomepageModelAppearance(
  scene: Object3D,
  presentation: HomepageModelPresentation,
  theme: "dark" | "light",
): Object3D {
  const result = scene.clone(true);
  const materialClones = new Map<Material, Material>();

  result.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const prepared = sourceMaterials.map((sourceMaterial) => {
      const existing = materialClones.get(sourceMaterial);
      if (existing !== undefined) return existing;
      const clone = sourceMaterial.clone();
      if (theme === "dark" && hasColor(clone)) {
        const shade = shadeFor(clone.color);
        clone.color.set(presentation.darkBaseColor).multiplyScalar(shade);
        if (hasTexturedEmissive(clone)) {
          clone.emissive.set(presentation.darkBaseColor);
          clone.emissiveIntensity = 0.28;
        }
      }
      materialClones.set(sourceMaterial, clone);
      return clone;
    });
    object.material = Array.isArray(object.material) ? prepared : prepared[0];
  });

  return result;
}
