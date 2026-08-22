<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront 3D Model Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every homepage GLB recognizable, upright where appropriate, fully visible, and visually balanced across desktop and compact viewports.

**Architecture:** Add one pure Catalog-feature presentation policy that owns each asset's fixed pose, subtle animated turn, and viewport fit fractions. The existing React Three Fiber scene component consumes that policy, centers the source model before transformation, fits its oriented bounds against width and height limits, and preserves the existing scroll, loading, theme, and fallback lifecycles.

**Tech Stack:** React 19, TypeScript, Three.js 0.185.1, React Three Fiber 9.7.0, Vitest, Docker Compose browser evidence.

## Global Constraints

- Standalone models target 30–35% of desktop viewport width and remain fully visible.
- Smartphone source Z height must map to screen-space Y and its front must face the camera.
- Compact viewports use a smaller visual fraction and stricter height cap.
- Do not edit or replace GLB files, checksums, attribution, Catalog data, copy, navigation, panels, themes, or scene order.
- Do not add dependencies, camera controls, drag gestures, physics, post-processing, or another animation library.
- Preserve reduced-motion, hidden-tab suspension, progressive loading, static fallback, cache, and disposal behavior.
- Keep all runtime changes inside `apps/storefront/src/features/catalog` and update `CHANGELOG.md` in the same integration unit.

---

### Task 1: Define Tested Pose and Viewport-Fit Policy

**Files:**
- Create: `apps/storefront/src/features/catalog/lib/homepage-model-presentation.ts`
- Create: `apps/storefront/src/features/catalog/tests/homepage-model-presentation.test.ts`

**Interfaces:**
- Consumes: `HomepageModelId` from `types/homepage-experience.types.ts`.
- Produces:

```ts
export type Rotation3 = readonly [x: number, y: number, z: number];

export interface HomepageModelPresentation {
  readonly baseRotation: Rotation3;
  readonly turn: readonly [start: number, end: number];
  readonly desktopWidthFraction: number;
  readonly compactWidthFraction: number;
  readonly maxHeightFraction: number;
}

export interface HomepageModelFitInput {
  readonly modelWidth: number;
  readonly modelHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly widthFraction: number;
  readonly maxHeightFraction: number;
}

export const homepageModelPresentations:
  Readonly<Record<HomepageModelId, HomepageModelPresentation>>;

export function fitHomepageModelToViewport(
  input: HomepageModelFitInput,
): number;

export function widthFractionForViewport(
  presentation: HomepageModelPresentation,
  viewportWidth: number,
): number;
```

- [ ] **Step 1: Write RED tests for the phone pose and shared limits**

Create `homepage-model-presentation.test.ts` with these assertions:

```ts
import { describe, expect, it } from "vitest";
import {
  fitHomepageModelToViewport,
  homepageModelPresentations,
  widthFractionForViewport,
} from "../lib/homepage-model-presentation";

describe("homepage model presentation", () => {
  it("turns the smartphone source Z height into an upright screen pose", () => {
    expect(homepageModelPresentations.smartphone.baseRotation).toEqual([
      -Math.PI / 2,
      0,
      0,
    ]);
  });

  it("keeps every standalone model within the approved visual range", () => {
    for (const presentation of Object.values(homepageModelPresentations)) {
      expect(presentation.desktopWidthFraction).toBeGreaterThanOrEqual(0.3);
      expect(presentation.desktopWidthFraction).toBeLessThanOrEqual(0.35);
      expect(presentation.compactWidthFraction).toBeLessThan(
        presentation.desktopWidthFraction,
      );
      expect(Math.abs(presentation.turn[0])).toBeLessThanOrEqual(0.3);
      expect(Math.abs(presentation.turn[1])).toBeLessThanOrEqual(0.3);
    }
  });

  it("uses the tighter width or height constraint", () => {
    expect(
      fitHomepageModelToViewport({
        modelWidth: 2,
        modelHeight: 4,
        viewportWidth: 10,
        viewportHeight: 8,
        widthFraction: 0.32,
        maxHeightFraction: 0.5,
      }),
    ).toBe(1);
  });

  it("selects compact fractions below the existing 768px boundary", () => {
    const presentation = homepageModelPresentations.smartphone;
    expect(widthFractionForViewport(presentation, 767)).toBe(
      presentation.compactWidthFraction,
    );
    expect(widthFractionForViewport(presentation, 768)).toBe(
      presentation.desktopWidthFraction,
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-model-presentation.test.ts
```

Expected: FAIL because `homepage-model-presentation` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Create `homepage-model-presentation.ts` with Apache-2.0 SPDX headers. Use these
approved values:

```ts
export const homepageModelPresentations = {
  smartphone: {
    baseRotation: [-Math.PI / 2, 0, 0],
    turn: [-0.18, 0.2],
    desktopWidthFraction: 0.32,
    compactWidthFraction: 0.26,
    maxHeightFraction: 0.52,
  },
  laptop: {
    baseRotation: [0, 0, 0],
    turn: [-0.22, 0.2],
    desktopWidthFraction: 0.34,
    compactWidthFraction: 0.28,
    maxHeightFraction: 0.48,
  },
  headphones: {
    baseRotation: [0, 0, 0],
    turn: [-0.2, 0.24],
    desktopWidthFraction: 0.31,
    compactWidthFraction: 0.25,
    maxHeightFraction: 0.48,
  },
  "game-controller": {
    baseRotation: [-0.18, 0, 0],
    turn: [-0.2, 0.2],
    desktopWidthFraction: 0.32,
    compactWidthFraction: 0.25,
    maxHeightFraction: 0.42,
  },
} as const satisfies Readonly<
  Record<HomepageModelId, HomepageModelPresentation>
>;

export function fitHomepageModelToViewport(input: HomepageModelFitInput) {
  const modelWidth = Math.max(Number.EPSILON, input.modelWidth);
  const modelHeight = Math.max(Number.EPSILON, input.modelHeight);
  return Math.min(
    (input.viewportWidth * input.widthFraction) / modelWidth,
    (input.viewportHeight * input.maxHeightFraction) / modelHeight,
  );
}

export function widthFractionForViewport(
  presentation: HomepageModelPresentation,
  viewportWidth: number,
) {
  return viewportWidth < 768
    ? presentation.compactWidthFraction
    : presentation.desktopWidthFraction;
}
```

- [ ] **Step 4: Run focused GREEN and Storefront typecheck**

Run:

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-model-presentation.test.ts
pnpm --filter @opendx/storefront typecheck
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 5: Commit the policy unit**

```bash
git add apps/storefront/src/features/catalog/lib/homepage-model-presentation.ts apps/storefront/src/features/catalog/tests/homepage-model-presentation.test.ts
git commit -m "feat(storefront): define balanced 3D model poses"
```

---

### Task 2: Apply Centered Orientation and Verify Every Scene

**Files:**
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/homepage-model-scene.tsx`
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/intro-scene.tsx`
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/smartphone-scene.tsx`
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/computing-scene.tsx`
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/audio-scene.tsx`
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/gaming-scene.tsx`
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/featured-scene.tsx`
- Create: `apps/storefront/src/features/catalog/lib/normalize-homepage-model.ts`
- Create: `apps/storefront/src/features/catalog/tests/normalize-homepage-model.test.ts`
- Modify: `apps/storefront/src/features/catalog/tests/homepage-scenes.test.ts`
- Modify: `scripts/dev/storefront-browser-check.mjs`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `homepageModelPresentations`, `fitHomepageModelToViewport`, and `widthFractionForViewport` from Task 1; existing `HomepageSceneProps`, `useHomepageModel`, and scroll progress helpers.
- Produces: `normalizeHomepageModel`, plus `HomepageModelScene` props with
  `side: "left" | "right"`, optional `widthFraction`, optional
  `verticalOffset`, optional explicit `position`, and no `targetSize` or
  scene-defined `rotation`.

- [ ] **Step 1: Extend RED scene assertions**

Update `homepage-scenes.test.ts` so the standalone definitions expose their
semantic side and use the shared model policy:

```ts
expect(smartphoneSceneDefinition).toEqual({
  scene: "smartphones",
  modelId: "smartphone",
  side: "left",
});
expect(gamingSceneDefinition).toEqual({
  scene: "gaming",
  modelId: "game-controller",
  side: "right",
});
```

Create `normalize-homepage-model.test.ts` with real Three.js geometry proving
the phone correction changes the visible bounds before fitting:

```ts
const phone = new Mesh(new BoxGeometry(1, 0.1, 2));
const normalized = normalizeHomepageModel(
  phone,
  homepageModelPresentations.smartphone,
  {
    viewportWidth: 10,
    viewportHeight: 8,
    browserWidth: 1440,
  },
);
expect(normalized.orientedHeight).toBeGreaterThan(normalized.orientedWidth);
expect(normalized.centeredPosition).toEqual([-0, -0, -0]);
expect(normalized.scale).toBeLessThanOrEqual(1.4);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-scenes.test.ts src/features/catalog/tests/normalize-homepage-model.test.ts
```

Expected: FAIL because current scene definitions omit `side` and
`normalize-homepage-model` does not exist.

- [ ] **Step 3: Implement centered, oriented, viewport-aware rendering**

Create `normalize-homepage-model.ts` with Apache-2.0 SPDX headers and the
following public boundary:

```ts
export interface HomepageModelViewport {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly browserWidth: number;
}

export interface NormalizedHomepageModel {
  readonly scene: Object3D;
  readonly centeredPosition: readonly [number, number, number];
  readonly orientedWidth: number;
  readonly orientedHeight: number;
  readonly scale: number;
}

export function normalizeHomepageModel(
  scene: Object3D,
  presentation: HomepageModelPresentation,
  viewport: HomepageModelViewport,
  widthFractionOverride?: number,
): NormalizedHomepageModel;
```

Then update `homepage-model-scene.tsx`:

- obtain `{ width, height }` from `useThree((state) => state.viewport)` and
  `window.innerWidth` only for selecting the existing 768px compact boundary;
- delegate source centering, oriented `Box3` measurement, and scale selection
  to `normalizeHomepageModel` once per loaded clone and viewport;
- set the animated outer group X position to `viewport.width * 0.22` for right
  and `viewport.width * -0.22` for left;
- render the hierarchy exactly as outer animated group → base-rotation group →
  uniform-scale group → centered primitive;
- keep point-light accents, scene visibility, pointer offset, loading fallback,
  and disposal unchanged;
- animate only `presentation.turn` around Y with the existing idle offset.

Update standalone scene definitions to include the approved side. Remove
`targetSize` and `rotation` props. Featured models reuse their base poses with
`widthFraction={0.12}` and retain their existing four-point arrangement through
explicit position overrides.

- [ ] **Step 4: Extend browser evidence to inspect scene clipping**

In `storefront-browser-check.mjs`, capture a homepage screenshot at the center
of `smartphones`, `audio`, and `gaming` on desktop light/dark, and at the center
of `smartphones` and `gaming` on mobile light/dark. For each sample assert:

```text
document scrollWidth <= viewport width
active scene navigation label matches the requested scene
no role="alert"
canvas remains present in 3d mode
```

Name evidence files `homepage-<viewport>-<theme>-<scene>.png`.

- [ ] **Step 5: Update changelog and run focused verification**

Update the first `[Unreleased]` homepage entry in `CHANGELOG.md` to mention
upright per-asset poses and viewport-bounded visual fitting. Run:

```bash
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
node --check scripts/dev/storefront-browser-check.mjs
git diff --check
pnpm audit:repo
```

Expected: every command exits `0`; no Storefront test fails.

- [ ] **Step 6: Rebuild and run browser evidence**

With the local stack already running:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up --build -d --wait storefront
pnpm check:storefront-browser
```

Expected: Storefront is healthy, every requested scene screenshot is recorded,
all viewport/theme/scene assertions pass, the smartphone is upright, and the
controller is fully inside the viewport.

- [ ] **Step 7: Commit the integration unit**

```bash
git add CHANGELOG.md apps/storefront/src/features/catalog scripts/dev/storefront-browser-check.mjs
git commit -m "fix(storefront): balance homepage 3D models"
git status --short
```

Expected: commit succeeds and worktree is clean.
