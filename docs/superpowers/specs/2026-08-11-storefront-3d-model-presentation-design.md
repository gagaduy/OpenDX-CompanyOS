<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront 3D Model Presentation Correction

**Status:** Approved design, awaiting written-spec review  
**Date:** 2026-08-11  
**Scope:** NovaCommerce Storefront homepage 3D model orientation and visual fit

## Problem

The six-scene homepage loads and animates the approved local GLB assets, but
their visible presentation is inconsistent. The smartphone is viewed almost
edge-on, the headphones appear too small, and the game controller is large
enough to be clipped by the viewport. The imbalance makes some models difficult
to identify and competes with the semantic product panels.

Inspection of the source GLB bounds confirms the root cause. The smartphone's
large dimensions are on its local X/Z plane while its Y dimension is only its
thickness, so a camera looking along Z sees an edge unless the asset receives a
fixed orientation correction. The shared scene currently animates only Y
rotation and accepts independent world-space target sizes; it has no per-asset
base orientation or viewport-aware fit policy.

## Approved Outcome

- Every standalone product remains fully visible and targets 30–35% of the
  viewport width at desktop sizes.
- The smartphone is upright, with its front face legible from the camera.
- Laptop, headphones, and controller use stable recognizable three-quarter
  views rather than rotating toward an edge-on silhouette.
- No model overlaps the semantic product panel or the scene navigation.
- Mobile layouts preserve the current model-above-panel composition with a
  smaller bounded visual footprint.
- Light and dark themes retain the same geometry and motion; only the existing
  lighting/theme treatment differs.
- Reduced-motion and static WebGL fallback behavior remain unchanged.

## Design

### Presentation metadata

Each approved model receives an explicit presentation definition owned by the
homepage experience feature:

- a fixed three-axis base rotation describing its recognizable pose;
- a bounded start/end Y turn used by scroll animation;
- a desktop and compact viewport width fraction;
- a maximum viewport height fraction;
- a scene-side placement that preserves the alternating content layout.

The smartphone base rotation turns its source X/Z face toward the camera and
maps its source Z height to screen-space Y. Scene animation is applied after
that fixed correction, so scroll motion cannot undo the upright pose.

### Centering and fit

The loaded model is placed inside a dedicated normalization group. The model's
base orientation is applied before measuring its bounds. The oriented bounds
are then centered inside the group, and one uniform scale is calculated from
both constraints:

```text
width scale  = available viewport width * requested width fraction / model width
height scale = viewport height * maximum height fraction / model height
uniform scale = min(width scale, height scale)
```

This replaces independent magic target sizes for standalone scenes. The same
pure calculation is used for every asset, while presentation metadata captures
the unavoidable semantic difference between an upright phone and a horizontal
controller. The featured scene uses a smaller explicit fraction per model but
shares the same orientation and fit definitions.

### Motion

Scroll-driven rotation remains native and deterministic. Its Y range is reduced
to a subtle three-quarter turn, and pointer idle motion remains a small offset
around the approved base pose. No new animation library or dependency is
introduced. Hidden-tab suspension, reduced-motion demand rendering, progressive
loading, and model-cache disposal remain intact.

### Responsive behavior

The fit function consumes the React Three Fiber viewport dimensions rather than
browser pixel dimensions, keeping the calculation compatible with the existing
camera. Compact viewports use a smaller width fraction and a stricter height
cap. Scene placement remains within the visual half opposite the content panel;
it does not rely on CSS breakpoints inside the canvas.

## Ownership and Structure

The change remains inside the existing
`apps/storefront/src/features/catalog` feature and its homepage tests. The pure
presentation/fit policy is added under the feature's existing `lib` directory.
No directory, dependency, API, Catalog contract, GLB binary, or repository
architecture changes are approved.

## Verification

Development follows RED–GREEN–REFACTOR:

1. Add failing unit assertions for per-model base poses and bounded fit output.
2. Add a failing component assertion proving the smartphone receives its
   upright base rotation independently of animated Y rotation.
3. Implement the minimum shared normalization and presentation metadata.
4. Run all Storefront tests, typecheck, production build, repository audit, and
   diff check.
5. Rebuild the local Storefront and capture dark/light evidence at 390x844 and
   1440x900. Inspect the intro, smartphone, audio, gaming, and featured scenes
   for recognizable orientation, balanced footprint, panel separation, and no
   clipping or horizontal overflow.

## Out of Scope

- Replacing or editing the licensed GLB files.
- Changing homepage copy, Catalog data, navigation, panels, theme tokens, or
  six-scene ordering.
- Adding camera controls, drag gestures, physics, post-processing, or another
  animation dependency.
- Redesigning non-homepage Storefront pages.
