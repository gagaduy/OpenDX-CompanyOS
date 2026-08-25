<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Linear-Style Product Canvas

## Intent

OpenDX CompanyOS frontend surfaces should feel technical, product-focused, and
quietly luxurious. Console surfaces prioritize dense operational panels. The
NovaCommerce Storefront uses the same restrained system in a more editorial,
image-led composition that keeps products as the primary visual material.

## Theme Tokens

The Console retains the dark operational canvas. The Storefront supports both
dark and light themes through semantic CSS tokens and one shared component
implementation. A customer choice must persist without a visible theme flash.

### Dark

- Canvas: `#010102`.
- Primary: `#5e6ad2`.
- Primary hover: `#828fff`.
- Primary focus: `#5e69d1`.
- Ink: `#f7f8f8`.
- Ink muted: `#d0d6e0`.
- Ink subtle: `#8a8f98`.
- Ink tertiary: `#62666d`.
- Surface 1: `#0f1011`.
- Surface 2: `#141516`.
- Surface 3: `#18191a`.
- Surface 4: `#191a1b`.
- Hairline: `#23252a`.
- Hairline strong: `#34343a`.
- Hairline tertiary: `#3e3e44`.

### Light Storefront

- Canvas: `#ffffff`.
- Primary: `#5e6ad2`.
- Primary hover: `#4f5bc4`.
- Ink: `#111214`.
- Ink muted: `#4e535c`.
- Ink subtle: `#747a84`.
- Surface 1: `#f5f6f6`.
- Surface 2: `#ffffff`.
- Surface 3: `#eceef0`.
- Hairline: `#e2e4e8`.
- Hairline strong: `#c8cbd1`.

## Usage Rules

- Use lavender only for brand mark, primary CTA, focus ring, and link emphasis.
- Use surface ladder and hairline borders for hierarchy.
- Do not use atmospheric gradients, decorative orbs, spotlight cards, or multiple bright accents.
- Use product UI panels, screenshots, and operational states as the primary visual material.
- Use 8px radius for controls, 12px for most cards, and 16px for product screenshot panels.
- Do not rely on negative letter spacing in coded UI.
- Do not duplicate components for light and dark Storefront themes or hard-code
  theme colors inside feature components.
- Use full-bleed product imagery for Storefront discovery and authentication,
  while preserving compact operational layouts for catalog filters, cart, and
  account management.

## Product Areas

Mission Control, Workflow Builder, Approval Inbox, Graph Explorer, Audit Explorer, and Digital Workforce should be implemented as dense operational interfaces, not landing-page sections.
