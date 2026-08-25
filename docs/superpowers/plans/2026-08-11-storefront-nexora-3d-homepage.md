<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Nexora-Inspired 3D Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static NovaCommerce introduction homepage with a six-scene, scroll-controlled 3D showroom that uses real Catalog data and remains complete in light, dark, reduced-motion, mobile, and WebGL-failure paths.

**Architecture:** One fixed React Three Fiber canvas renders category models behind six semantic HTML sections. Pure progress and quality functions drive a native request-animation-frame scroll director; existing Catalog APIs populate product overlays, while bounded local GLB loading and a static semantic experience isolate WebGL and asset failures from commerce navigation.

**Tech Stack:** React 19, TypeScript, Vite, React Router, Three.js `0.185.1`, React Three Fiber `9.7.0`, Vitest, Testing Library, existing Storefront theme and Catalog clients.

## Global Constraints

- Redesign `/` only; `/products` and every account, cart, checkout, payment, and order route retain their current behavior.
- Keep the existing header, search, discovery taskbar, account, cart, footer, and `novacommerce-theme` preference.
- Render exactly six scenes: `intro`, `smartphones`, `computing`, `audio`, `gaming`, and `featured`.
- Product names, prices, availability, media, and links come only from existing validated Catalog responses.
- Use one fixed WebGL canvas; do not add GSAP, a second state library, a paid service, autoplay audio, or video.
- Use `#010102` as the dark canvas and `#5e6ad2` only for primary action, active navigation, focus, and restrained light accents.
- Do not add decorative gradients, broad purple washes, glowing orbs, constant glitching, or content-obscuring particles.
- Keep all meaningful content and controls in semantic HTML outside the canvas.
- Respect `prefers-reduced-motion`, cap mobile rendering cost, and provide a complete static path when WebGL is unavailable.
- A model error or timeout affects only that model; it must not blank the homepage or block Storefront navigation.
- Add SPDX headers, update `CHANGELOG.md` and `docs/dependencies.md`, and keep commits atomic with Conventional Commits.

## Approved Model Assets

| Local file | Source | License | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `smartphone.glb` | `https://poly.pizza/m/4DRZmTs3jq` | CC0 1.0 | 19,104 | `868e2d7b191defae7b7c8e2908d3cd41d1c7be1a940945737010590e89b35e90` |
| `laptop.glb` | `https://poly.pizza/m/GnbwSUiVty` | CC0 1.0 | 12,932 | `387328b3c6530213770fb579545fa8cc27cc4ee6cf710f3f01bb28873da99b5e` |
| `headphones.glb` | `https://poly.pizza/m/PSsWSIAYIL` | CC0 1.0 | 42,780 | `8b34489472f7c23795d9e286ade2996c7f7e602f643a58ef3af20dbe4d73e75c` |
| `game-controller.glb` | `https://poly.pizza/m/8QtaCh2s3sm` | CC BY 3.0 | 72,868 | `28147ad3bdcc1dbb447d7b55439159069425383b866df399acf68f98b8bf0e54` |

The runtime must use the committed local copies under
`apps/storefront/public/models/homepage/`; it must not hotlink Poly Pizza.

## File Map

```text
apps/storefront/
  package.json                                      # Three/R3F dependencies
  public/models/homepage/
    ATTRIBUTIONS.md                                 # asset provenance and licenses
    smartphone.glb                                  # CC0 model
    laptop.glb                                      # CC0 model
    headphones.glb                                  # CC0 model
    game-controller.glb                             # CC BY model
  src/features/catalog/
    components/homepage-experience/
      experience-canvas.tsx                         # Canvas and scene composition
      experience-error-boundary.tsx                 # fatal canvas isolation
      experience-loading-status.tsx                 # bounded critical-load UI
      experience-scene-navigation.tsx               # accessible scene shortcuts
      homepage-product-overlay.tsx                  # real Catalog summary/CTA
      homepage-scene-section.tsx                    # semantic section shell
      model-fallback.tsx                            # neutral 3D fallback geometry
      showroom-environment.tsx                      # theme-aware lights/environment
      static-homepage-experience.tsx                # no-WebGL complete journey
      scenes/
        intro-scene.tsx
        smartphone-scene.tsx
        computing-scene.tsx
        audio-scene.tsx
        gaming-scene.tsx
        featured-scene.tsx
    data/homepage-model-assets.ts                    # typed local asset manifest
    hooks/use-homepage-catalog.ts                    # Catalog scene data
    hooks/use-homepage-model.ts                      # bounded GLB lifecycle
    hooks/use-homepage-preferences.ts                # WebGL/tier/reduced motion
    hooks/use-homepage-scroll.ts                     # RAF scroll coordinator
    lib/homepage-model-loader.ts                     # fetch/parse/cache/disposal
    lib/homepage-quality.ts                          # pure device policy
    lib/homepage-scene-progress.ts                   # pure scene math
    pages/intro-home-page.tsx                        # composition page
    types/homepage-experience.types.ts               # shared feature contracts
    tests/homepage-assets.test.ts
    tests/homepage-catalog.test.tsx
    tests/homepage-experience.test.tsx
    tests/homepage-model-loader.test.ts
    tests/homepage-scene-progress.test.ts
  src/app/app-router.tsx                             # inject Catalog dependencies
  src/app/app.test.tsx                               # homepage route regression
  src/shared/styles/globals.css                      # responsive showroom tokens/layout
scripts/dev/storefront-browser-check.mjs             # 3D/static/theme viewport evidence
docs/dependencies.md                                 # dependency license/purpose
CHANGELOG.md                                         # Unreleased entry
pnpm-lock.yaml                                       # reproducible dependency graph
```

---

### Task 1: Licensed Assets and Typed Experience Foundation

**Files:**
- Modify: `apps/storefront/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/dependencies.md`
- Create: `apps/storefront/public/models/homepage/ATTRIBUTIONS.md`
- Create: `apps/storefront/public/models/homepage/smartphone.glb`
- Create: `apps/storefront/public/models/homepage/laptop.glb`
- Create: `apps/storefront/public/models/homepage/headphones.glb`
- Create: `apps/storefront/public/models/homepage/game-controller.glb`
- Create: `apps/storefront/src/features/catalog/types/homepage-experience.types.ts`
- Create: `apps/storefront/src/features/catalog/data/homepage-model-assets.ts`
- Test: `apps/storefront/src/features/catalog/tests/homepage-assets.test.ts`

**Interfaces:**
- Consumes: existing Storefront package and Vitest configuration.
- Produces: `HomepageSceneId`, `HomepageModelId`, `HomepageModelAsset`, `HOMEPAGE_SCENE_IDS`, `homepageModelAssets`, and the four local GLB URLs used by later tasks.

- [ ] **Step 1: Write the failing asset-contract test**

Create `homepage-assets.test.ts` with assertions equivalent to:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { homepageModelAssets } from "../data/homepage-model-assets";

describe("homepage model assets", () => {
  it("maps four unique local GLB files with immutable checksums", () => {
    expect(homepageModelAssets.map((asset) => asset.id)).toEqual([
      "smartphone", "laptop", "headphones", "game-controller",
    ]);
    for (const asset of homepageModelAssets) {
      expect(asset.path).toMatch(/^\/models\/homepage\/.+\.glb$/);
      const bytes = readFileSync(
        new URL(`../../../../public${asset.path}`, import.meta.url),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-assets.test.ts
```

Expected: FAIL because `homepage-model-assets.ts` and the local GLB files do not exist.

- [ ] **Step 3: Add the reviewed MIT dependencies**

Run:

```bash
pnpm --filter @opendx/storefront add three@0.185.1 @react-three/fiber@9.7.0
```

Update `docs/dependencies.md` with both exact versions, Storefront ownership,
MIT license, and their responsibilities. State explicitly that native scroll
coordination is used and GSAP is not introduced.

- [ ] **Step 4: Fetch and verify the approved binary assets**

Create only `apps/storefront/public/models/homepage/`, download the four exact
URLs below to their corresponding local names, then run the checksum command:

```bash
curl -L --fail --silent --show-error -o apps/storefront/public/models/homepage/smartphone.glb https://static.poly.pizza/68a8586b-e540-431c-b42e-e3c6bc691e11.glb
curl -L --fail --silent --show-error -o apps/storefront/public/models/homepage/laptop.glb https://static.poly.pizza/8190e659-7079-442f-9ed9-083f67b1746b.glb
curl -L --fail --silent --show-error -o apps/storefront/public/models/homepage/headphones.glb https://static.poly.pizza/b72a848f-b4c6-40fb-ada7-69c4c524bd27.glb
curl -L --fail --silent --show-error -o apps/storefront/public/models/homepage/game-controller.glb https://static.poly.pizza/f0ac374f-c55c-41ac-94e9-531e8a4385f8.glb
sha256sum apps/storefront/public/models/homepage/*.glb
```

Expected: the hashes match the Approved Model Assets table exactly. Stop the
task without committing if any hash differs.

- [ ] **Step 5: Add the types, manifest, and attribution ledger**

Define these contracts:

```ts
export type HomepageSceneId =
  | "intro" | "smartphones" | "computing" | "audio" | "gaming" | "featured";
export type HomepageModelId =
  | "smartphone" | "laptop" | "headphones" | "game-controller";
export interface HomepageModelAsset {
  readonly id: HomepageModelId;
  readonly path: `/models/homepage/${string}.glb`;
  readonly sourceUrl: `https://${string}`;
  readonly license: "CC0-1.0" | "CC-BY-3.0";
  readonly creator: string;
  readonly sha256: string;
}
export const HOMEPAGE_SCENE_IDS: readonly HomepageSceneId[] = [
  "intro", "smartphones", "computing", "audio", "gaming", "featured",
];
```

Populate `homepageModelAssets` in the order used by the test. The attribution
ledger records title, creator (`smallbigsquare`, `Kenney`, `CreativeTrio`, and
`Paul Spooner`), source page, license, local filename, retrieval date
`2026-08-11`, SHA-256, and the note `Unmodified GLB download`.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-assets.test.ts
pnpm --filter @opendx/storefront typecheck
git diff --check
```

Expected: all commands exit `0`.

```bash
git add apps/storefront/package.json pnpm-lock.yaml docs/dependencies.md apps/storefront/public/models/homepage apps/storefront/src/features/catalog/types/homepage-experience.types.ts apps/storefront/src/features/catalog/data/homepage-model-assets.ts apps/storefront/src/features/catalog/tests/homepage-assets.test.ts
git commit -m "feat(storefront): add licensed homepage models"
```

---

### Task 2: Deterministic Scene Progress and Quality Policy

**Files:**
- Create: `apps/storefront/src/features/catalog/lib/homepage-scene-progress.ts`
- Create: `apps/storefront/src/features/catalog/lib/homepage-quality.ts`
- Test: `apps/storefront/src/features/catalog/tests/homepage-scene-progress.test.ts`

**Interfaces:**
- Consumes: `HomepageSceneId`, `HOMEPAGE_SCENE_IDS` from Task 1.
- Produces: `clampProgress`, `sceneAtProgress`, `localSceneProgress`, `progressForScene`, `lerpKeyframes`, `ExperienceTier`, `DeviceSignals`, `ExperienceBudget`, `selectExperienceTier`, and `budgetForTier`.

- [ ] **Step 1: Write RED boundary and quality tests**

Cover these exact expectations:

```ts
expect(sceneAtProgress(-1)).toBe("intro");
expect(sceneAtProgress(1 / 6)).toBe("smartphones");
expect(sceneAtProgress(0.999)).toBe("featured");
expect(sceneAtProgress(4)).toBe("featured");
expect(localSceneProgress(progressForScene("gaming"), "gaming")).toBe(0);
expect(localSceneProgress(1, "featured")).toBe(1);
expect(lerpKeyframes(0.5, [[0, 0], [1, 10]])).toBe(5);

expect(selectExperienceTier({
  webgl: false, reducedMotion: false, width: 1440, memoryGb: 8, cores: 8,
})).toBe("static");
expect(selectExperienceTier({
  webgl: true, reducedMotion: true, width: 1440, memoryGb: 8, cores: 8,
})).toBe("low");
expect(selectExperienceTier({
  webgl: true, reducedMotion: false, width: 390, memoryGb: 4, cores: 4,
})).toBe("low");
expect(selectExperienceTier({
  webgl: true, reducedMotion: false, width: 1024, memoryGb: 8, cores: 8,
})).toBe("medium");
expect(selectExperienceTier({
  webgl: true, reducedMotion: false, width: 1440, memoryGb: 8, cores: 8,
})).toBe("high");
```

Assert exact budgets:

```ts
expect(budgetForTier("high")).toEqual({ dpr: 1.75, shadows: true, idleMotion: true });
expect(budgetForTier("medium")).toEqual({ dpr: 1.25, shadows: false, idleMotion: true });
expect(budgetForTier("low")).toEqual({ dpr: 1, shadows: false, idleMotion: false });
expect(budgetForTier("static")).toEqual({ dpr: 1, shadows: false, idleMotion: false });
```

- [ ] **Step 2: Run the test and verify RED**

Run the focused test and expect missing-module failures:

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-scene-progress.test.ts
```

- [ ] **Step 3: Implement pure math and exact quality thresholds**

Use six equal intervals, clamp every public progress input to `0..1`, treat
`1` as the end of `featured`, and linearly interpolate sorted numeric
keyframes. Select `static` without WebGL; `low` for reduced motion, width below
`768`, memory at most `4`, or cores at most `4`; `medium` for width below
`1280` or known memory below `8`; otherwise select `high`. Missing memory/core
signals do not downgrade by themselves.

- [ ] **Step 4: Verify GREEN and commit**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-scene-progress.test.ts
pnpm --filter @opendx/storefront typecheck
git add apps/storefront/src/features/catalog/lib/homepage-scene-progress.ts apps/storefront/src/features/catalog/lib/homepage-quality.ts apps/storefront/src/features/catalog/tests/homepage-scene-progress.test.ts
git commit -m "feat(storefront): define homepage scene policy"
```

---

### Task 3: Backend-Authoritative Homepage Catalog and Static Journey

**Files:**
- Create: `apps/storefront/src/features/catalog/hooks/use-homepage-catalog.ts`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/homepage-product-overlay.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/homepage-scene-section.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/static-homepage-experience.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/intro-home-page.tsx`
- Modify: `apps/storefront/src/app/app-router.tsx`
- Modify: `apps/storefront/src/app/app.test.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/intro-home-page.test.tsx`
- Test: `apps/storefront/src/features/catalog/tests/homepage-catalog.test.tsx`

**Interfaces:**
- Consumes: `StorefrontCatalogApi`, `StorefrontProduct`, `HomepageSceneId`, existing `formatVnd`, `catalogApi`, and `apiBaseUrl` from the application composition root.
- Produces: `HomepageCatalogState`, `useHomepageCatalog(api)`, `HomepageProductOverlay`, `HomepageSceneSection`, `StaticHomepageExperience`, and `IntroHomePage({ api, apiBaseUrl })`.

- [ ] **Step 1: Write RED Catalog-hook tests**

Use a fake `StorefrontCatalogApi` and assert the hook requests these exact
validated query sets in parallel:

```text
category=phones&sort=best_selling&page=1&pageSize=1
category=laptops&sort=best_selling&page=1&pageSize=1
query=headphones&sort=best_selling&page=1&pageSize=1
query=controller&sort=best_selling&page=1&pageSize=1
sort=best_selling&page=1&pageSize=4
```

The success assertion verifies that phone, laptop, headphones, controller, and
four featured products are returned without reshaping price or availability.
The failure assertion verifies `error === "Không thể tải sản phẩm nổi bật."`,
all six scene definitions remain available, no invented product appears, and
`retry()` invokes the same requests again.

- [ ] **Step 2: Write RED semantic fallback tests**

Render `StaticHomepageExperience` in a `MemoryRouter` and assert:

```ts
expect(screen.getAllByTestId("homepage-scene")).toHaveLength(6);
expect(screen.getByRole("heading", { name: /bước vào tương lai/i })).toBeVisible();
expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute("href", "/products");
expect(screen.getByRole("link", { name: "Khám phá danh mục" })).toHaveAttribute("href", "/products#categories");
expect(screen.getByRole("link", { name: /xem nova laptop pro/i })).toHaveAttribute("href", "/products/nova-laptop-pro");
```

Also cover a product with no variants: render `Giá đang cập nhật` instead of
`Infinity`, and render `Tạm hết hàng` when every variant is non-purchasable.

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-catalog.test.tsx src/features/catalog/tests/intro-home-page.test.tsx
```

Expected: FAIL for missing hook/components and the old prop-free homepage.

- [ ] **Step 4: Implement Catalog state and semantic presentation**

Define:

```ts
export interface HomepageCatalogState {
  readonly loading: boolean;
  readonly error?: string;
  readonly sceneProducts: Readonly<Partial<Record<HomepageSceneId, StorefrontProduct>>>;
  readonly featuredProducts: readonly StorefrontProduct[];
  readonly retry: () => Promise<void>;
}
```

Use existing `api.products(new URLSearchParams(...))` calls only. The homepage
section copy and links always render. Loading uses `role="status"`; failure uses
`role="alert"` plus a retry button and Catalog link. Calculate a displayed
minimum price only when `variants.length > 0`; availability is true only when
at least one variant has `purchasable === true`.

- [ ] **Step 5: Inject the existing Catalog dependencies at `/`**

Change the router element from `<IntroHomePage />` to:

```tsx
<IntroHomePage
  api={dependencies.catalogApi}
  apiBaseUrl={dependencies.apiBaseUrl}
/>
```

Update app and homepage tests with deterministic Catalog responses; do not add
a second API client or fetch directly from a component.

- [ ] **Step 6: Verify GREEN and commit**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-catalog.test.tsx src/features/catalog/tests/intro-home-page.test.tsx src/app/app.test.tsx
pnpm --filter @opendx/storefront typecheck
git add apps/storefront/src/features/catalog/hooks/use-homepage-catalog.ts apps/storefront/src/features/catalog/components/homepage-experience apps/storefront/src/features/catalog/pages/intro-home-page.tsx apps/storefront/src/features/catalog/tests/homepage-catalog.test.tsx apps/storefront/src/features/catalog/tests/intro-home-page.test.tsx apps/storefront/src/app/app-router.tsx apps/storefront/src/app/app.test.tsx
git commit -m "feat(storefront): add semantic homepage journey"
```

---

### Task 4: Native Scroll Director and Accessible Scene Navigation

**Files:**
- Create: `apps/storefront/src/features/catalog/hooks/use-homepage-scroll.ts`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/experience-scene-navigation.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/intro-home-page.tsx`
- Test: `apps/storefront/src/features/catalog/tests/homepage-experience.test.tsx`

**Interfaces:**
- Consumes: Task 2 scene math and `HOMEPAGE_SCENE_IDS`.
- Produces: `HomepageScrollDirector`, `useHomepageScroll(containerRef)`, and `ExperienceSceneNavigation({ activeScene, onSelect })`.

- [ ] **Step 1: Write the failing navigation test**

Render a six-section test harness. Mock `requestAnimationFrame`, set the journey
bounding rectangle and scroll height, then assert normalized progress drives
`activeScene`. Click the `Gaming` shortcut and assert the `gaming` section
receives:

```ts
expect(scrollIntoView).toHaveBeenCalledWith({
  behavior: "smooth",
  block: "start",
});
expect(screen.getByRole("button", { name: "Gaming" })).toHaveAttribute(
  "aria-current", "location",
);
```

When `reducedMotion` is true, assert `behavior: "auto"`.

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-experience.test.tsx
```

Expected: FAIL because the scroll hook and navigation component do not exist.

- [ ] **Step 3: Implement the RAF-coalesced scroll director**

Return this contract:

```ts
export interface HomepageScrollDirector {
  readonly progress: React.MutableRefObject<number>;
  readonly activeScene: HomepageSceneId;
  readonly selectScene: (scene: HomepageSceneId) => void;
}
```

One passive `scroll` listener and one `resize` listener schedule at most one
animation-frame calculation. Progress is based on the journey element's
document top and `scrollHeight - innerHeight`. Mutate `progress.current` on
every update but update React state only when `activeScene` changes. Remove
listeners and cancel a scheduled frame during cleanup.

- [ ] **Step 4: Add accessible scene shortcuts and verify GREEN**

Use compact labeled buttons with `aria-current="location"`; do not hide the
labels from screen readers when the visual desktop treatment uses dots.

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-experience.test.tsx
pnpm --filter @opendx/storefront typecheck
git add apps/storefront/src/features/catalog/hooks/use-homepage-scroll.ts apps/storefront/src/features/catalog/components/homepage-experience/experience-scene-navigation.tsx apps/storefront/src/features/catalog/pages/intro-home-page.tsx apps/storefront/src/features/catalog/tests/homepage-experience.test.tsx
git commit -m "feat(storefront): direct homepage scroll scenes"
```

---

### Task 5: Bounded GLB Loading, Cache, and Disposal

**Files:**
- Create: `apps/storefront/src/features/catalog/lib/homepage-model-loader.ts`
- Create: `apps/storefront/src/features/catalog/hooks/use-homepage-model.ts`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/model-fallback.tsx`
- Test: `apps/storefront/src/features/catalog/tests/homepage-model-loader.test.ts`

**Interfaces:**
- Consumes: `HomepageModelAsset`, Three.js `GLTFLoader`, and browser `fetch`.
- Produces: `HomepageModelLoadError`, `fetchGlbBytes`, `parseGlbBytes`, `preloadHomepageModel`, `clearHomepageModelCache`, `disposeObject3D`, and `useHomepageModel(asset, timeoutMs)`.

- [ ] **Step 1: Write RED loader lifecycle tests**

Use fake timers and injected fetch/parse functions. Cover:

```ts
await expect(fetchGlbBytes("/model.glb", { timeoutMs: 10, fetcher })).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
await expect(fetchGlbBytes("/model.glb", { timeoutMs: 100, fetcher: failingFetch })).rejects.toMatchObject({ code: "MODEL_HTTP_ERROR" });
await expect(fetchGlbBytes("/model.glb", { timeoutMs: 100, fetcher: successFetch })).resolves.toEqual(expectedBytes);
```

Call `preloadHomepageModel` twice with the same URL and assert one fetch/parse.
Call `clearHomepageModelCache()` between tests. Build a Three `Group` with one
geometry, material, and texture; spy on each `dispose()` and assert
`disposeObject3D(group)` calls each exactly once.

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-model-loader.test.ts
```

- [ ] **Step 3: Implement abortable fetch and GLTF parsing**

Use an `AbortController`, a `10_000` ms default timeout, and
`GLTFLoader.parseAsync(arrayBuffer, modelDirectory)`. Translate abort, non-2xx,
network, and parse failures into these stable codes:

```ts
type HomepageModelErrorCode =
  | "MODEL_TIMEOUT"
  | "MODEL_HTTP_ERROR"
  | "MODEL_NETWORK_ERROR"
  | "MODEL_PARSE_ERROR";
```

Cache only successful/in-flight promises by local URL. Delete a rejected entry
so a retry can load it again. The hook returns `{ status, scene, error }`,
ignores late resolution after unmount, and clones the loaded scene while keeping
geometry, material, and texture resources owned by the cache. Render clones
with `dispose={null}`; do not let one scene dispose resources shared by another
scene. `clearHomepageModelCache({ dispose: true })` disposes every cached model
template exactly once when the complete homepage canvas unmounts.

- [ ] **Step 4: Add neutral failure geometry**

`ModelFallback` accepts `modelId` and renders a low-poly neutral composition
from Three primitives. It contains no product text and does not imitate a
specific brand. Model loading and failure are announced by the matching HTML
scene, not inside the canvas.

- [ ] **Step 5: Verify GREEN and commit**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-model-loader.test.ts
pnpm --filter @opendx/storefront typecheck
git add apps/storefront/src/features/catalog/lib/homepage-model-loader.ts apps/storefront/src/features/catalog/hooks/use-homepage-model.ts apps/storefront/src/features/catalog/components/homepage-experience/model-fallback.tsx apps/storefront/src/features/catalog/tests/homepage-model-loader.test.ts
git commit -m "feat(storefront): load homepage models safely"
```

---

### Task 6: Theme-Aware Canvas, Capability Policy, and Intro Scene

**Files:**
- Create: `apps/storefront/src/features/catalog/hooks/use-homepage-preferences.ts`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/experience-error-boundary.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/showroom-environment.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/experience-loading-status.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/experience-canvas.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/intro-scene.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/intro-home-page.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/homepage-experience.test.tsx`

**Interfaces:**
- Consumes: current `useTheme()`, Task 2 quality policy, Task 4 progress ref, Task 5 model hook, and the laptop asset.
- Produces: `HomepagePreferences`, `useHomepagePreferences`, `ExperienceErrorBoundary`, `ShowroomEnvironment`, `ExperienceLoadingStatus`, `ExperienceCanvas`, and `IntroScene`.

- [ ] **Step 1: Add RED preference and fallback assertions**

Mock `HTMLCanvasElement.getContext`, `matchMedia`, `navigator.deviceMemory`,
`navigator.hardwareConcurrency`, and viewport width. Assert:

- no WebGL renders `StaticHomepageExperience` and no `<canvas>`;
- reduced motion selects the low budget;
- changing the existing theme changes the canvas wrapper from
  `data-showroom-theme="dark"` to `data-showroom-theme="light"`;
- a thrown canvas child error replaces only the 3D layer with the static path;
- critical loading shows `role="progressbar"` with clamped values and never
  covers the Storefront header.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-experience.test.tsx
```

- [ ] **Step 3: Implement capability and preference detection**

`useHomepagePreferences()` reads the existing theme, system reduced-motion,
viewport width, optional device memory, hardware concurrency, and a guarded
WebGL context probe. Subscribe to the media query and resize event; remove both
listeners on cleanup. Return:

```ts
export interface HomepagePreferences {
  readonly theme: "dark" | "light";
  readonly reducedMotion: boolean;
  readonly tier: ExperienceTier;
  readonly budget: ExperienceBudget;
}
```

- [ ] **Step 4: Implement the canvas and theme-aware environment**

Configure one React Three Fiber `Canvas` with camera position `[0, 0, 7]`, FOV
`42`, capped DPR from the budget, antialias disabled for low tier, and shadows
only for high tier. Dark environment uses a near-black clear color, cool key
light, restrained cyan fill, and scarce `#5e6ad2` rim light. Light environment
uses a neutral near-white clear color, soft key/fill lights, and no broad color
wash. The canvas is `aria-hidden="true"` and `pointer-events: none`.

- [ ] **Step 5: Implement the intro scene and fatal boundary**

The intro uses the laptop model, maps local scene progress to a controlled
position/rotation, and applies pointer parallax only when the budget permits
idle motion. The error boundary calls a single `onFatalError` callback and
switches the page to `StaticHomepageExperience`; it does not swallow header or
Catalog errors.

- [ ] **Step 6: Verify GREEN and commit**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-experience.test.tsx
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
git add apps/storefront/src/features/catalog/hooks/use-homepage-preferences.ts apps/storefront/src/features/catalog/components/homepage-experience apps/storefront/src/features/catalog/pages/intro-home-page.tsx apps/storefront/src/features/catalog/tests/homepage-experience.test.tsx
git commit -m "feat(storefront): render homepage showroom canvas"
```

---

### Task 7: Complete Six Scene Composition and Product Overlays

**Files:**
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/smartphone-scene.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/computing-scene.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/audio-scene.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/gaming-scene.tsx`
- Create: `apps/storefront/src/features/catalog/components/homepage-experience/scenes/featured-scene.tsx`
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/experience-canvas.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/intro-home-page.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/homepage-experience.test.tsx`

**Interfaces:**
- Consumes: all four model assets, normalized/global/local progress, current theme, rendering budget, and Task 3 Catalog slots.
- Produces: all six canvas scenes and the complete interactive homepage composition.

- [ ] **Step 1: Expand the RED experience test**

Assert all scene components receive their matching local progress interval and
the page exposes these section headings:

```text
Bước vào tương lai
Điện thoại cho mọi kết nối
Hiệu năng cho công việc
Âm thanh trong từng khoảnh khắc
Sẵn sàng cho cuộc chơi
Sản phẩm nổi bật
```

Assert phone, laptop, headphones, and controller overlays link to their real
product slugs when supplied. Assert an empty audio slot links to
`/products?query=headphones#catalog` and renders no fabricated price.

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-experience.test.tsx
```

Expected: FAIL because five scene components and their model composition are
missing.

- [ ] **Step 3: Implement category scenes with deterministic transforms**

Each scene receives only:

```ts
interface HomepageSceneProps {
  readonly progress: React.MutableRefObject<number>;
  readonly theme: "dark" | "light";
  readonly budget: ExperienceBudget;
}
```

Use `useFrame` to derive transforms from Task 2 pure functions. Smartphone uses
`smartphone.glb`; computing uses `laptop.glb`; audio uses `headphones.glb`;
gaming uses `game-controller.glb`; featured stages clones of all four. Do not
mutate another scene's objects, React state, or Catalog data. Gaming may use
stronger local RGB lights, but cap their intensity and turn them off outside
the gaming interval.

- [ ] **Step 4: Compose semantic overlays independently of the canvas**

Each HTML section includes eyebrow, heading, concise Vietnamese copy, category
or product CTA, explicit loading/error text when applicable, and no
canvas-rendered text. Featured uses at most four existing products. All product
images resolve `primaryMedia.contentUrl` against `apiBaseUrl`.

- [ ] **Step 5: Verify GREEN and commit**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-experience.test.tsx src/features/catalog/tests/homepage-catalog.test.tsx src/features/catalog/tests/intro-home-page.test.tsx
pnpm --filter @opendx/storefront typecheck
git add apps/storefront/src/features/catalog/components/homepage-experience/scenes apps/storefront/src/features/catalog/components/homepage-experience/experience-canvas.tsx apps/storefront/src/features/catalog/pages/intro-home-page.tsx apps/storefront/src/features/catalog/tests/homepage-experience.test.tsx
git commit -m "feat(storefront): complete 3D homepage scenes"
```

---

### Task 8: Progressive Loading, Responsive Styling, Browser Evidence, and Exit Gate

**Files:**
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/experience-canvas.tsx`
- Modify: `apps/storefront/src/features/catalog/components/homepage-experience/experience-loading-status.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/intro-home-page.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/homepage-experience.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`
- Modify: `scripts/dev/storefront-browser-check.mjs`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: complete homepage implementation from Tasks 1–7 and existing root validation/browser commands.
- Produces: bounded preload behavior, responsive theme styling, visibility lifecycle, browser evidence, and final repository documentation.

- [ ] **Step 1: Add RED lifecycle assertions**

Mock the model preloader and visibility state. Assert:

- initial mount preloads only the laptop used by `intro`;
- progress `>= 0.08` preloads smartphone and laptop;
- progress `>= 0.40` preloads headphones and controller;
- repeated updates do not issue duplicate loads;
- `document.hidden === true` pauses idle animation;
- returning visible schedules one render update;
- reduced motion disables continuous idle rotation and uses automatic scene
  scrolling;
- unmount removes visibility and resize/scroll listeners.

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm --filter @opendx/storefront test -- src/features/catalog/tests/homepage-experience.test.tsx
```

- [ ] **Step 3: Implement progressive loading and visibility lifecycle**

Use the existing successful-promise model cache. Start the critical loading
gate with the intro laptop only; reveal semantic content immediately and remove
the in-hero progress status when that model loads or fails. Preload the next
groups at the exact progress thresholds in Step 1. Pause render-intensive idle
motion while hidden and resume without resetting scroll progress.

- [ ] **Step 4: Replace static intro CSS with responsive showroom styles**

Keep styles under the existing Storefront stylesheet and use feature-prefixed
selectors. Required layout behavior:

```css
.homepage-experience { position: relative; isolation: isolate; }
.homepage-experience-canvas { position: fixed; inset: 0; pointer-events: none; }
.homepage-scene { min-height: 100svh; display: grid; align-items: center; }
@media (prefers-reduced-motion: reduce) {
  .homepage-scene { scroll-behavior: auto; }
}
```

Add theme-specific showroom CSS variables under the existing
`:root[data-theme]` blocks. Ensure overlays have bounded readable widths and
opaque-enough surfaces without decorative gradients. At `<= 768px`, move
overlays below the visual center, reduce heading size, keep buttons at least
`44px` high, hide visual shortcut labels while preserving accessible names,
and prevent horizontal overflow. Remove only obsolete `.intro-*` rules after
their last source usage is gone.

- [ ] **Step 5: Extend deterministic browser evidence**

Update `verifyIntroHomepage` and the viewport loop to assert:

```text
six [data-testid="homepage-scene"] sections
one canvas or an explicit static fallback
no role="alert" after fixtures settle
document scroll width <= viewport width
visible keyboard focus
dark and light data-theme values
working /products and /products#categories CTAs
```

Capture homepage screenshots for `390x844`, `768x1024`, and `1440x900` in
both themes. Add one run with a new-document script that makes
`HTMLCanvasElement.prototype.getContext` return `null`; assert the static path
still exposes six sections and both primary Catalog links.

- [ ] **Step 6: Update the changelog and run focused verification**

Add one `[Unreleased]` entry covering the six-scene homepage, licensed local
models, real Catalog overlays, theme adaptation, reduced motion, progressive
loading, and static fallback.

```bash
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront typecheck
pnpm --filter @opendx/storefront build
git diff --check
pnpm audit:repo
```

Expected: every command exits `0` with no failed test.

- [ ] **Step 7: Run browser and full-source exit gates**

With the documented local stack running:

```bash
pnpm check:storefront-browser
pnpm check
```

Expected: browser evidence contains all six viewport/theme combinations plus
the static fallback record; the full repository gate exits `0`. If the local
stack is unavailable, do not claim browser or full integration completion.

- [ ] **Step 8: Commit the final integration unit**

```bash
git add apps/storefront/src/features/catalog apps/storefront/src/shared/styles/globals.css scripts/dev/storefront-browser-check.mjs CHANGELOG.md
git commit -m "feat(storefront): finish Nexora 3D homepage"
```

After committing, verify `git status --short` is empty and record the focused,
browser, and full-gate evidence in the handoff.
