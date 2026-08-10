<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Console Night Mode Toggle Design

## Goal

Add a clear Console control that lets staff switch between the existing dark
operational canvas and a deeper night mode without changing Console routing,
permissions, or business workflows.

## Scope

- Add a visible theme toggle in the Console sidebar footer near staff identity.
- Keep the current Console appearance as the default `dark` mode.
- Add a `night` mode with deeper canvas and surfaces while preserving the same
  typography, spacing, navigation, tables, and accent color.
- Persist the staff browser choice in `localStorage` with key
  `opendx.console.theme`.
- Apply the selected mode through a layout-level data attribute so feature pages
  continue using the existing CSS tokens.

## Non-Goals

- Do not add a light Console theme.
- Do not change Storefront theming.
- Do not change authentication, roles, API calls, or route structure.
- Do not introduce new dependencies.

## UX Behavior

- Default first load: `dark`.
- Toggle button label in `dark`: `Bật chế độ night`.
- Toggle button label in `night`: `Tắt chế độ night`.
- The button uses a moon icon in `dark` and a sun icon in `night`.
- Invalid stored values fall back to `dark`.

## Testing

- Console shell test verifies default `dark`, toggle to `night`, persistence,
  and invalid stored value fallback.
- Console typecheck/build must pass.
- Repository audit and diff whitespace checks must pass.
