<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Header Layout Alignment Design

## Context

The NovaCommerce Storefront already has a customer header, discovery taskbar,
and collapsed catalog sidebar. The current header/taskbar layout is visually
uneven: the shortcut pills sit as a separate loose row, the quick-search action
floats toward the far right, and the header does not read as one aligned
commerce navigation system.

The user wants the layout discipline of a retail header similar to the provided
thegioididong reference, but without adopting its yellow brand color.

## Scope

This change is limited to `apps/storefront` UI layout and tests.

In scope:

- Align the top header, main navigation, action icons, and discovery taskbar to
  one shared width and spacing system.
- Keep the existing NovaCommerce color/theme tokens instead of changing to a
  yellow retail theme.
- Rework the discovery taskbar from loose pills into a compact, evenly spaced
  commerce shortcut row.
- Keep `Sản phẩm mới` as the newest shortcut label.
- Keep account, cart, search, theme, and hash navigation behavior intact.
- Preserve the collapsed left sidebar behavior from the prior approved design.
- Preserve responsive behavior without horizontal overflow on mobile, tablet,
  and desktop.

Out of scope:

- Backend, database, seed, auth, checkout, or catalog API changes.
- New retail category data, promotions, location selection, shipping provider,
  marketplace, or payment behavior.
- Rebranding the Storefront to the yellow visual style from the reference.

## Proposed Layout

The Storefront shell keeps the current semantic structure but tightens the
visual system:

1. The header remains a sticky top bar using existing theme tokens.
2. Header content is centered inside a shared maximum-width inner wrapper.
3. The brand stays left aligned, the primary navigation stays centered, and
   action icons stay right aligned.
4. The discovery taskbar becomes a second aligned row under the header, sharing
   the same maximum width.
5. The quick-search control is integrated into that row as a compact action
   instead of floating at the far right edge.
6. On narrow screens, the row scrolls horizontally inside the viewport while
   preserving visible focus states.

## Components and Files

- `apps/storefront/src/app/storefront-shell.tsx`
  - Add lightweight inner wrappers for header and discovery rows if needed.
  - Keep route targets and accessible labels unchanged except where tests assert
    the new aligned structure.
- `apps/storefront/src/shared/styles/globals.css`
  - Update `.topbar`, `.discovery-taskbar`, and taskbar control styles.
  - Use existing semantic CSS variables and avoid new brand colors.
- `apps/storefront/src/app/storefront-shell.test.tsx`
  - Assert that taskbar shortcuts and quick search remain reachable.
  - Assert the aligned taskbar structure exists so future changes do not regress
    into the prior uneven row.

## Data Flow

No data flow changes are introduced. Links continue to use existing route/hash
navigation. Quick search continues to route to `/search`.

## Accessibility

- Keep landmark navigation labels.
- Keep visible focus rings.
- Keep touch targets usable on mobile.
- Do not hide controls from assistive technology merely because the row scrolls.

## Testing

Use the existing Storefront component test pattern:

1. Add or update a failing Storefront shell test for the aligned discovery row.
2. Implement the minimum layout changes.
3. Run Storefront tests, typecheck, build, browser check, repository audit, and
   full repo check before handoff.
