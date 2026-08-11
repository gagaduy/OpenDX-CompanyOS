<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Introduction Homepage Design

## Goal

Add a dedicated Storefront `Trang chủ` route that introduces NovaCommerce
before customers browse products.

## Scope

- `/` becomes the Storefront introduction homepage.
- `/products` becomes the product discovery/catalog page currently served at
  `/`.
- Header navigation shows `Trang chủ`, `Sản phẩm`, `Danh mục`, and `Khám phá`.
- Existing catalog hash links move to `/products#categories` and
  `/products#catalog`.
- Existing product query shortcuts continue to target the catalog route.
- The homepage is static marketing/intro content only; it does not create new
  backend APIs, payments, shipping, marketplace, refund, or account behavior.

## Homepage Content

- Hero: introduce NovaCommerce as a B2C technology store for laptops, phones,
  accessories, components, tablets, and smart devices.
- Value points: curated technology products, transparent VND pricing,
  customer support, and secure checkout.
- CTA: `Xem sản phẩm` linking to `/products`.
- Secondary CTA: `Khám phá danh mục` linking to `/products#categories`.

## UX Constraints

- Preserve the Storefront light/dark theme system.
- Preserve compact header/search/cart/account controls.
- Keep product discovery behavior backend-authoritative.
- Do not duplicate catalog fetching on the static homepage.

## Testing

- Storefront router/shell tests verify `/` renders introduction content and
  `/products` renders catalog content.
- Header and taskbar tests verify navigation targets use the new routes.
- Storefront focused tests, typecheck, build, browser check, repo audit, and
  diff check must pass before handoff.
