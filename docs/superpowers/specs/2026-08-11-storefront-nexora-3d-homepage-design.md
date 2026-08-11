<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Nexora-Inspired 3D Homepage Design

**Date:** 2026-08-11
**Status:** Approved in conversation

## Goal

Redesign only the NovaCommerce Storefront homepage as a continuous six-scene
3D technology showroom inspired by the approved Nexora concept. The homepage
must remain the entry point to the real NovaCommerce catalog and customer
journey, preserve the existing light/dark preference, and degrade to a fully
usable semantic experience when WebGL or individual models fail.

This design supersedes the presentation of the static introduction homepage in
`2026-08-11-storefront-introduction-homepage-design.md`. Its routing and
commerce boundaries remain unchanged: `/` is the introduction homepage and
`/products` owns product discovery.

## Scope

- Redesign the `/` Storefront homepage only.
- Keep the existing Storefront header, search, account, cart, footer, routes,
  backend APIs, and commerce behavior.
- Present one continuous scroll-controlled journey with six scenes:
  introduction, smartphones, computing, audio and wearables, gaming, and
  featured products.
- Use freely licensed GLB models with recorded source and license information.
- Display product names, VND prices, availability, and calls to action from the
  existing backend-authoritative Catalog view models.
- Support light, dark, reduced-motion, mobile, and static-fallback experiences.

The change does not introduce new product, price, promotion, inventory, cart,
checkout, payment, shipping, account, or administration rules.

## Explicit Non-goals

- Rebuilding the `/products` discovery page or another Storefront route.
- Copying proprietary branding, models, textures, animation, or source code.
- Making WebGL state authoritative for catalog or commerce behavior.
- Adding audio, autoplay media, a local-only demo cart, or fake product data.
- Adding marketplace, multi-warehouse, shipping-provider, refund, return, or
  electronic-invoice behavior.
- Requiring a paid API, paid asset service, or paid runtime subscription.

## Experience Structure

The header remains a stable Storefront navigation surface above the experience.
A single fixed WebGL canvas provides visual continuity while six semantic HTML
sections provide scroll length, accessible content, and commerce controls.

### 1. Introduction

- Reveal NovaCommerce and the value statement for a general technology store.
- Stage one representative technology object with slow, restrained motion.
- Offer `Xem sản phẩm` and `Khám phá danh mục` controls targeting the existing
  `/products` route and anchors.

### 2. Smartphones

- Feature a freely licensed phone model and concise category copy.
- Use existing Catalog data to expose an available representative product when
  one exists.
- Link to the corresponding product detail or filtered Catalog result.

### 3. Computing

- Transition to a laptop or desktop-computing model.
- Prefer an opening or controlled rotation animation when the selected model
  supports it; otherwise use camera and lighting motion without fabricating an
  animation.

### 4. Audio and Wearables

- Stage headphones, a watch, or another available representative model.
- Use restrained orbital composition and avoid particles that reduce text
  contrast or obscure controls.

### 5. Gaming

- Feature a keyboard, mouse, controller, or related model.
- Allow slightly stronger RGB lighting while retaining the shared palette and
  the same interaction grammar as the other scenes.

### 6. Featured Products

- Resolve the journey into accessible HTML cards driven by Catalog data.
- Preserve backend-provided price, promotion, publication, and availability
  truth.
- Link customers into the existing product detail and Catalog flows; checkout
  remains outside the homepage.

If a category has no eligible published product, its scene keeps category-level
copy and links to the relevant Catalog filter. It must not invent a price,
availability value, or SKU.

## Visual Direction and Theme

The presentation adopts Nexora's premium showroom character while following
the repository's Storefront design rules.

- Dark mode uses a `#010102`-adjacent canvas with restrained blue, cyan, and
  violet illumination.
- Light mode uses a bright neutral showroom, dark readable typography,
  controlled reflections, and soft shadows.
- The existing `novacommerce-theme` preference remains the single theme source.
- Theme changes update both HTML tokens and 3D lights, environment, materials,
  and fallback artwork without reloading the page.
- `#5e6ad2` remains a scarce accent for primary actions, focus, and active
  navigation.
- No decorative gradients, broad purple washes, glowing orbs, constant glitch
  effects, or dense particles are introduced.
- Product information remains semantic HTML rather than texture-rendered text.
- Focus indicators and text contrast remain visible over both theme variants.

## Component Boundaries

All new source belongs to the existing Storefront Catalog feature unless a
primitive has two proven frontend consumers. No speculative shared layer is
created.

- `IntroHomePage`: composes the showroom and semantic sections; it does not own
  renderer details or catalog business rules.
- `ExperienceCanvas`: owns renderer configuration, camera, lights, quality
  budget, and fatal WebGL fallback.
- `ScrollDirector`: maps document progress deterministically to active scene,
  local scene progress, camera transforms, and overlay visibility.
- Scene components: each owns only its model placement, local lighting cues,
  and progress-to-transform mapping. Scenes do not manipulate each other.
- `ProductOverlay`: renders purpose-specific Catalog view models, prices,
  availability, and route links as semantic HTML.
- `ModelLoader`: centralizes GLB loading progress, timeout, per-model failure,
  preload policy, and disposal.
- `ExperiencePreferences`: derives the current theme, reduced-motion setting,
  device tier, and static fallback choice.
- `StaticExperience`: preserves all six content sections, Catalog links, and
  featured-product cards without requiring WebGL.

No scene imports another Storefront feature's private files. Catalog data is
obtained through the existing Catalog feature API/hook boundary.

## Data and Interaction Flow

```text
Document scroll -> ScrollDirector -> normalized scene progress
                                -> camera and active-scene transforms
                                -> matching HTML overlay visibility

Catalog API -> existing validation/mapping -> homepage scene view models
                                        -> ProductOverlay and featured cards

Theme preference -> HTML design tokens
                 -> 3D environment, lights, and materials

Capability and preferences -> quality policy -> renderer/effect budget
Model or WebGL failure      -> StaticExperience
```

Pointer movement may add small parallax but is never required to discover
content or activate a control. Scene navigation, calls to action, theme toggle,
search, account, and cart remain keyboard accessible.

## Asset and Dependency Strategy

- Select GLB models only from sources whose licenses allow repository use and
  redistribution in the intended form.
- Record asset name, creator, source URL, license, downloaded version/date, and
  modifications in a Storefront asset attribution ledger.
- Keep source files out of the repository when redistribution is prohibited.
- Optimize accepted GLB models and textures before committing them; do not ship
  authoring files or unrelated variants.
- Models are representative category visuals. They do not claim to be an exact
  SKU unless the asset and Catalog item genuinely correspond.
- Prefer a single fixed React Three Fiber canvas over one canvas per section.
- Introduce only the smallest reviewed WebGL and scroll dependencies required
  by the implementation plan. Exact packages and pinned versions must be
  documented in `docs/dependencies.md` with the lockfile update.
- The experience must not depend on Higgsfield or another paid media service.

## Performance and Progressive Enhancement

- Load only critical introduction assets during the initial gate.
- Preload the next scene shortly before it becomes active and lazy-load later
  scenes in bounded groups.
- Cap device pixel ratio and reduce shadows, reflections, texture resolution,
  particles, and post-processing according to device tier.
- Pause render-intensive work while the document is hidden.
- Dispose of scene-owned geometry, materials, and textures during teardown.
- Desktop is the visual benchmark. Mobile keeps all six semantic sections and
  primary actions with a smaller rendering budget.
- Respect `prefers-reduced-motion`; reduced motion avoids rapid camera travel,
  large parallax, and continuous decorative animation.
- If WebGL initialization fails, use `StaticExperience` immediately.
- If one GLB fails or times out, use a scene poster or neutral fallback
  geometry while the remaining experience continues.

No loading state may block header navigation or leave a blank page
indefinitely.

## Error Handling

- A bounded loading gate reports meaningful progress for critical assets.
- Asset timeouts and decode errors are isolated per model and surfaced in
  development without exposing internal error details to customers.
- Catalog loading, empty, recoverable error, and success states remain explicit.
- Catalog failure shows category-level content and a retry or Catalog link; it
  never substitutes locally invented commerce data.
- Corrupted or unavailable preference storage falls back to safe in-session
  defaults without preventing theme or reduced-motion controls.
- Switching to the static experience preserves the user's current scroll area
  and all navigation targets where practical.

## Accessibility

- All meaningful content exists in semantic HTML outside the canvas.
- Canvas visuals are decorative or have concise equivalent descriptions.
- Section shortcuts, header controls, Catalog links, and featured cards support
  keyboard operation and visible focus.
- Motion never communicates unique product or availability information.
- Theme variants meet readable contrast and respect the current color-scheme.
- Reduced-motion and static paths expose the same six sections and primary
  customer actions.

## Verification Strategy

### Automated

- Pure unit tests cover scene-boundary math, interpolation, and quality-tier
  selection.
- Component tests cover all six semantic sections, current Catalog links,
  theme propagation, reduced motion, loading, per-model failure, and complete
  static fallback.
- Router and shell regressions verify `/` remains the homepage and `/products`
  remains Catalog discovery.
- Existing Storefront account, cart, checkout, order, and Catalog tests remain
  green.
- Storefront typecheck, production build, repository audit, and diff check pass.

### Manual and Browser

- Inspect common desktop, tablet, and mobile viewports in light and dark mode.
- Exercise forward/reverse/rapid scrolling, section shortcuts, pointer, touch,
  keyboard, reduced-motion, and theme switching.
- Verify WebGL-disabled, missing-model, slow-model, and Catalog-error fallbacks.
- Confirm homepage calls to action reach the real Catalog/product routes and do
  not alter cart or checkout behavior.
- Review browser console output, initial asset loading, layout shift, memory,
  and responsive text overlap.

## Acceptance Criteria

1. `/` presents six visually continuous scenes through one fixed 3D canvas.
2. Camera and scene animation remain deterministic in both scroll directions.
3. Light and dark selections update the HTML and 3D presentation coherently.
4. Product text, price, availability, and links use existing validated Catalog
   data and remain backend-authoritative.
5. The complete content and navigation journey remains usable on mobile,
   reduced-motion, and static fallback paths.
6. Failure of WebGL or any individual model does not create a blank homepage or
   block access to Catalog, account, search, or cart.
7. Every shipped third-party asset has a recorded source and compatible
   license.
8. Other Storefront routes and commerce behavior remain unchanged.
