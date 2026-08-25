<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Console Night Mode Toggle Design

## Goal

Add a clear Console control that lets staff switch between a light Console
canvas and a night mode without changing Console routing, permissions, or
business workflows.

## Scope

- Add a visible theme toggle in the Console sidebar footer near staff identity.
- Use `light` as the default Console mode so the night toggle has a visible effect.
- Add a `night` mode with deeper canvas and surfaces while preserving the same
  typography, spacing, navigation, tables, and accent color.
- Persist the staff browser choice in `localStorage` with key
  `opendx.console.theme`.
- Apply the selected mode through a layout-level data attribute so feature pages
  continue using the existing CSS tokens.

## Non-Goals

- Do not change Storefront theming.
- Do not change authentication, roles, API calls, or route structure.
- Do not introduce new dependencies.

## UX Behavior

- Default first load: `light`.
- Toggle button label in `light`: `Bật chế độ night`.
- Toggle button label in `night`: `Tắt chế độ night`.
- The button uses a moon icon in `light` and a sun icon in `night`.
- Invalid stored values fall back to `light`.

## Testing

- Console shell test verifies default `light`, toggle to `night`, persistence,
  and invalid stored value fallback.
- Console typecheck/build must pass.
- Repository audit and diff whitespace checks must pass.
