<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Dark-Theme 3D Material Contrast

- **Status:** Implemented
- **Date:** 2026-08-11
- **Scope:** NovaCommerce Storefront homepage 3D model color treatment in dark mode

## Problem

The homepage showroom changes its background and lights when the Storefront
theme changes, but it renders the GLB materials without a theme-specific
appearance policy. Several source materials are nearly black. Against the
approved `#010102` dark canvas, the smartphone and game controller lose their
silhouette and surface detail; dark sections of the headphones are also hard to
read.

The cached model template is cloned per scene with `Object3D.clone(true)`, which
does not create independent material instances. Mutating those shared materials
would leak dark-theme colors into other scenes and into light mode. Raising all
scene lights would also wash out the already-visible surfaces without fixing
the underlying lack of material contrast.

## Approved Outcome

- Dark mode gives every 3D product a restrained, recognizable product color:
  smartphone blue, laptop silver, headphones copper-orange, and controller
  light graphite with a subtle cool cast.
- Model silhouettes and major surface divisions remain visible against the
  dark canvas throughout their approved scroll turns.
- Light mode preserves the authored GLB appearance.
- Switching themes never changes the cached template or another scene's
  materials.
- Geometry, pose, viewport fit, scroll motion, reduced-motion behavior, static
  fallback, model licensing, and GLB binaries remain unchanged.

## Design

### Appearance policy

The existing homepage presentation policy gains one dark-theme base color per
model:

| Model | Dark base color | Intent |
| --- | --- | --- |
| Smartphone | `#6578d9` | Clear blue device silhouette without competing with primary actions |
| Laptop | `#b7bdc8` | Neutral silver hardware |
| Headphones | `#c46a32` | Copper-orange that preserves the current product character |
| Game controller | `#969eb2` | Light graphite with a restrained cool cast |

These values belong to the 3D presentation policy, not global CSS theme tokens.
They describe product rendering and must not be reused for controls or broad
decorative surfaces.

### Theme-safe material preparation

A pure homepage-model appearance helper receives a loaded scene, model ID, and
theme and returns a scene prepared for that theme.

- It clones the scene and clones each distinct material once, preserving
  intentional material sharing within that returned scene.
- In light mode it retains every authored material property and color.
- In dark mode, color-bearing materials receive the model's approved base color.
  A bounded shade derived from the authored material luminance preserves
  differences between panels and parts while enforcing a visible minimum.
- Because the smartphone and headphones contain dark base-color textures,
  textured emissive-capable materials also receive the same palette color at a
  restrained `0.28` emissive intensity. This prevents dark texels from
  cancelling the palette while retaining the texture map.
- Texture maps, transparency, side mode, metalness, and roughness remain
  intact. Authored emissive values remain unchanged in light mode.
- The cached loader template and its materials are never mutated.
- Materials without a color channel pass through as independent clones rather
  than being coerced into a different Three.js material class.

The helper remains in the Catalog homepage feature's existing `lib` directory.
It introduces no runtime dependency and does not change the model-loader public
contract.

### Rendering integration

`HomepageModelScene` prepares the ready model for the current theme before
normalization and rendering. Theme changes produce a new theme-specific scene;
the existing pose and viewport-fit calculation then operates on that scene.
Lighting remains responsible for three-dimensional shading, while the material
policy supplies enough base contrast for the lights to reveal the object.

The current dark and light showroom environment values remain unchanged. No
global or per-scene lighting adjustment is approved by this design.

## Ownership and Structure

All production and test changes stay within the existing
`apps/storefront/src/features/catalog` homepage experience, plus the existing
Storefront browser-check script and `[Unreleased]` changelog entry. No new
directory, dependency, API, Catalog contract, asset file, or architecture layer
is introduced.

## Verification

Development follows RED-GREEN-REFACTOR:

1. Add failing unit tests proving the exact dark palette, independent material
   clones, bounded shade preservation, light-theme color preservation, and
   immunity of the cached source scene to theme preparation.
2. Implement the minimum appearance policy and integrate it before model
   normalization.
3. Run all Storefront tests, TypeScript checks, production build, repository
   audit, and diff check.
4. Rebuild the Storefront and capture dark/light browser evidence at 390x844
   and 1440x900 for smartphone, laptop, headphones, and controller scenes.
5. Inspect that dark models remain recognizable without clipping or panel
   overlap, and that light-mode model colors remain unchanged.

## Out of Scope

- Editing, replacing, or duplicating the licensed GLB binaries.
- Recoloring product photography or non-homepage UI.
- Changing global Storefront theme tokens, semantic product panels, or CTA
  colors.
- Adding post-processing, environment maps, shaders, animation libraries, or
  new lighting systems.
- Changing model geometry, pose, scale, camera, scroll behavior, or scene order.
