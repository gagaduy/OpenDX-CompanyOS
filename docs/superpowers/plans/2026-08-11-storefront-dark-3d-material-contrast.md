<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Dark 3D Material Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each NovaCommerce homepage 3D product a readable model-specific color in dark mode without changing light-mode assets or leaking material mutations across scenes.

**Architecture:** Extend the existing per-model presentation metadata with an approved dark base color, then prepare a theme-specific scene through a pure helper that clones the object and its materials before recoloring. `HomepageModelScene` consumes that prepared scene before the existing orientation and viewport-fit pipeline; the loader, GLB assets, environment lights, and public contracts remain unchanged.

**Tech Stack:** React 19, TypeScript, Three.js, React Three Fiber, Vitest, Vite, Chrome DevTools Protocol browser checks, Docker Compose

## Global Constraints

- Work only on branch `phuong`; do not merge or push without explicit approval.
- Keep all behavior under the existing `apps/storefront/src/features/catalog` homepage feature.
- Use exactly these dark base colors: smartphone `#6578d9`, laptop `#b7bdc8`, headphones `#c46a32`, game controller `#969eb2`.
- Light mode must preserve authored GLB colors and properties.
- Never mutate the cached source scene or any source material.
- Preserve textures, transparency, side mode, metalness, roughness, geometry, pose, scale, camera, scroll motion, fallback behavior, asset files, licenses, and hashes.
- Do not change `ShowroomEnvironment` lighting or global Storefront theme tokens.
- Add no dependency and create no new directory or architecture layer.
- Update `CHANGELOG.md` under `[Unreleased]` in the same implementation unit.
- Add SPDX headers to new source and test files.

---

### Task 1: Define and prove theme-safe model appearance

**Files:**
- Modify: `apps/storefront/src/features/catalog/lib/homepage-model-presentation.ts`
- Create: `apps/storefront/src/features/catalog/lib/prepare-homepage-model-appearance.ts`
- Create: `apps/storefront/src/features/catalog/tests/prepare-homepage-model-appearance.test.ts`

**Interfaces:**
- Consumes: `HomepageModelId` from `../types/homepage-experience.types` and Three.js `Object3D`, `Mesh`, `Material`, and `Color`.
- Produces: `HomepageModelPresentation.darkBaseColor: string` and `prepareHomepageModelAppearance(scene: Object3D, presentation: HomepageModelPresentation, theme: "dark" | "light"): Object3D`.
- Guarantee: the returned scene and every returned material are independent from the input; repeated source-material references remain shared only inside the returned scene.

- [ ] **Step 1: Write failing palette and material-isolation tests**

Create `prepare-homepage-model-appearance.test.ts` with real Three.js objects:

```ts
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
    expect(Object.fromEntries(
      Object.entries(homepageModelPresentations).map(([id, value]) => [id, value.darkBaseColor]),
    )).toEqual({
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
    const resultMaterial = (result.children[0] as Mesh).material as MeshStandardMaterial;

    expect(resultMaterial).not.toBe(sourceMaterial);
    expect(resultMaterial.color.getHexString()).toBe("c46a32");
    expect(sourceMaterial.color.getHexString()).toBe("c46a32");
  });

  it("raises a black authored material to a bounded visible shade in dark mode", () => {
    const source = new Group();
    source.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "#000000" })));

    const result = prepareHomepageModelAppearance(
      source,
      homepageModelPresentations["game-controller"],
      "dark",
    );
    const material = (result.children[0] as Mesh).material as MeshStandardMaterial;

    expect(material.color.getHex()).not.toBe(0);
    expect(Math.max(material.color.r, material.color.g, material.color.b)).toBeGreaterThan(0.25);
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/prepare-homepage-model-appearance.test.ts
```

Expected: FAIL because `darkBaseColor` and `prepare-homepage-model-appearance` do not exist.

- [ ] **Step 3: Add the exact palette to presentation metadata**

Extend `HomepageModelPresentation`:

```ts
export interface HomepageModelPresentation {
  readonly baseRotation: Rotation3;
  readonly turn: readonly [start: number, end: number];
  readonly desktopWidthFraction: number;
  readonly compactWidthFraction: number;
  readonly maxHeightFraction: number;
  readonly darkBaseColor: string;
}
```

Add the approved value to each entry without changing any pose or fit value:

```ts
smartphone: {
  baseRotation: [-Math.PI / 2, 0.18, 0],
  turn: [-0.18, 0.2],
  desktopWidthFraction: 0.32,
  compactWidthFraction: 0.26,
  maxHeightFraction: 0.52,
  darkBaseColor: "#6578d9",
},
laptop: {
  baseRotation: [0, 0, 0],
  turn: [-0.22, 0.2],
  desktopWidthFraction: 0.34,
  compactWidthFraction: 0.28,
  maxHeightFraction: 0.48,
  darkBaseColor: "#b7bdc8",
},
headphones: {
  baseRotation: [0, 0, 0],
  turn: [-0.2, 0.24],
  desktopWidthFraction: 0.31,
  compactWidthFraction: 0.25,
  maxHeightFraction: 0.48,
  darkBaseColor: "#c46a32",
},
"game-controller": {
  baseRotation: [-0.18, 0, 0],
  turn: [-0.2, 0.2],
  desktopWidthFraction: 0.32,
  compactWidthFraction: 0.25,
  maxHeightFraction: 0.42,
  darkBaseColor: "#969eb2",
},
```

- [ ] **Step 4: Implement the pure theme-safe appearance helper**

Create `prepare-homepage-model-appearance.ts` with this responsibility and no rendering imports:

```ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Color, Mesh, type Material, type Object3D } from "three";
import type { HomepageModelPresentation } from "./homepage-model-presentation";

type ColorMaterial = Material & { readonly color: Color };

function hasColor(material: Material): material is ColorMaterial {
  return "color" in material && material.color instanceof Color;
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
      }
      materialClones.set(sourceMaterial, clone);
      return clone;
    });
    object.material = Array.isArray(object.material) ? prepared : prepared[0];
  });

  return result;
}
```

- [ ] **Step 5: Run focused tests, Storefront tests, and typecheck**

Run:

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/prepare-homepage-model-appearance.test.ts src/features/catalog/tests/homepage-model-presentation.test.ts
pnpm --filter @opendx/storefront typecheck
```

Expected: all selected tests PASS and TypeScript exits 0.

- [ ] **Step 6: Review and commit Task 1**

Run `git diff --check`, inspect that only the three Task 1 files changed, then:

```bash
git add apps/storefront/src/features/catalog/lib/homepage-model-presentation.ts apps/storefront/src/features/catalog/lib/prepare-homepage-model-appearance.ts apps/storefront/src/features/catalog/tests/prepare-homepage-model-appearance.test.ts
git commit -m "feat(storefront): add dark 3D material palettes"
```

---

### Task 2: Integrate appearance with rendering and browser evidence

**Files:**
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/homepage-model-scene.tsx`
- Modify: `scripts/dev/storefront-browser-check.mjs`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `prepareHomepageModelAppearance(scene, presentation, theme)` and the existing `normalizeHomepageModel` pipeline.
- Produces: theme-specific prepared scenes in `HomepageModelScene`; browser evidence for `smartphones`, `computing`, `audio`, and `gaming` on desktop and mobile.

- [ ] **Step 1: Extend the browser regression contract before integration**

In `captureHomepageThemes`, make every inspected viewport sample all four
standalone model scenes:

```js
const sampledScenes = ["smartphones", "computing", "audio", "gaming"];
```

Extend `homepageSceneLabel`:

```js
function homepageSceneLabel(scene) {
  return {
    smartphones: "Điện thoại",
    computing: "Máy tính",
    audio: "Âm thanh",
    gaming: "Gaming",
  }[scene];
}
```

Keep the current active-scene, alert, canvas/static-fallback, and horizontal
overflow assertions. This produces dark/light evidence for all approved model
colors rather than testing only scenes that previously had layout problems.

- [ ] **Step 2: Verify the appearance helper is not yet integrated**

Run:

```bash
rg -n "prepareHomepageModelAppearance" apps/storefront/src/features/catalog/components/homepage-experience/scenes/homepage-model-scene.tsx
```

Expected: no match and exit status 1, proving the renderer does not yet consume
the tested policy.

- [ ] **Step 3: Prepare the scene by theme before normalization**

Import the helper in `homepage-model-scene.tsx`:

```ts
import { prepareHomepageModelAppearance } from "../../../lib/prepare-homepage-model-appearance";
```

Replace the current ready-scene normalization memo with one that prepares the
model first and includes `theme` in its dependencies:

```ts
const normalizedScene = useMemo(() => {
  if (model.status !== "ready") return undefined;
  const preparedScene = prepareHomepageModelAppearance(
    model.scene,
    presentation,
    theme,
  );
  return normalizeHomepageModel(
    preparedScene,
    presentation,
    {
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      browserWidth: window.innerWidth,
    },
    widthFraction,
  );
}, [model, presentation, theme, viewport.height, viewport.width, widthFraction]);
```

Do not change scene lights, pose, scale, camera, animation, or fallback code.

- [ ] **Step 4: Update the changelog**

Under the existing Storefront homepage `[Unreleased]` entry in `CHANGELOG.md`,
record that dark-mode 3D materials now use isolated model-specific palettes to
remain visible without affecting light mode.

- [ ] **Step 5: Run focused and full Storefront verification**

Run:

```bash
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
node --check scripts/dev/storefront-browser-check.mjs
git diff --check
pnpm audit:repo
```

Expected: 0 failed Storefront tests, TypeScript exit 0, Vite build exit 0,
browser-check syntax exit 0, clean diff check, and repository audit passed.

- [ ] **Step 6: Rebuild and verify real dark/light rendering**

Run:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up --build -d --wait storefront
pnpm check:storefront-browser
```

Inspect at minimum:

```text
/tmp/opendx-storefront-browser/homepage-desktop-dark-smartphones.png
/tmp/opendx-storefront-browser/homepage-desktop-dark-computing.png
/tmp/opendx-storefront-browser/homepage-desktop-dark-audio.png
/tmp/opendx-storefront-browser/homepage-desktop-dark-gaming.png
/tmp/opendx-storefront-browser/homepage-mobile-dark-smartphones.png
/tmp/opendx-storefront-browser/homepage-mobile-dark-computing.png
/tmp/opendx-storefront-browser/homepage-mobile-dark-audio.png
/tmp/opendx-storefront-browser/homepage-mobile-dark-gaming.png
```

Acceptance: each object has a readable silhouette and internal shading against
`#010102`, no model clips or overlaps its semantic panel/navigation, light-mode
captures retain authored colors, and every browser assertion exits 0.

- [ ] **Step 7: Run the repository completion gate**

Run:

```bash
pnpm check
git diff --check
git status --short
```

Expected: the complete repository gate exits 0, diff check is clean, and only
the three Task 2 files are modified.

- [ ] **Step 8: Review and commit Task 2**

Inspect the complete diff against the approved spec, then:

```bash
git add CHANGELOG.md apps/storefront/src/features/catalog/components/homepage-experience/scenes/homepage-model-scene.tsx scripts/dev/storefront-browser-check.mjs
git commit -m "fix(storefront): improve dark 3D model contrast"
```

Confirm `git status --short --branch` is clean and keep the rebuilt Storefront
running at `http://localhost:3100` for user testing.
