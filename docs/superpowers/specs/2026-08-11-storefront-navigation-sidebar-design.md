<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Navigation Sidebar Design

## Purpose

Improve the NovaCommerce Storefront customer browsing experience by adding a
compact discovery taskbar below the header and a collapsible left sidebar for
category and product filters.

This is a Storefront-only UI change. It must not change backend pricing,
inventory, catalog, checkout, customer session, order, or payment authority.

## Scope

In scope:

- `apps/storefront` layout and styling.
- A top taskbar below the existing header with customer discovery shortcuts:
  `Sản phẩm mới`, `Bán chạy`, `Đang giảm`, `Còn hàng`, and `Hỗ trợ`.
- Quick browsing controls in the taskbar where they fit the existing responsive
  layout, such as search or filter entry points.
- A left sidebar that is collapsed to icons by default on desktop.
- Desktop hover expansion for the sidebar. The expanded sidebar overlays the
  page content and does not push or reflow the product layout.
- Sidebar content combining product categories and catalog filters.
- Mobile and tablet behavior that uses an explicit open/close control instead
  of hover.
- Storefront tests covering visible navigation behavior and responsive-safe
  states.
- `CHANGELOG.md` update.

Out of scope:

- New backend endpoints, database schema, or seed data.
- Marketplace, multi-store, shipping-provider, refund, return, or electronic
  invoice behavior.
- Replacing the existing Storefront route structure.
- Changing checkout, payment, customer session, or cart ownership logic.

## User Experience

The existing Storefront header remains the primary brand and account area:
logo, search, theme toggle, account, and cart stay available.

A secondary taskbar appears under the header. It gives customers one-click
entry points for common discovery intents:

- `Sản phẩm mới`
- `Bán chạy`
- `Đang giảm`
- `Còn hàng`
- `Hỗ trợ`

The left sidebar is always visually available on desktop as a narrow icon rail.
When a customer hovers over it, the sidebar expands over the page content. This
keeps the product grid stable and avoids layout jumps. The expanded panel shows
category navigation and product filters using the existing catalog query
parameters where possible.

On mobile and tablet, hover is not assumed. The sidebar opens through an
explicit control and can be dismissed without blocking core browsing.

## Architecture

The change belongs to `apps/storefront`.

Likely ownership:

- `src/app/storefront-shell.tsx` owns shell-level taskbar and sidebar placement.
- `src/features/catalog` continues to own category and product filter controls.
- `src/shared/styles/globals.css` owns the existing Storefront CSS system.

The implementation should reuse current Storefront catalog state:

- categories from the existing Storefront catalog API;
- filter query parameters already used by the catalog page;
- existing product availability semantics for `Còn hàng`.

If a shell-level sidebar needs category data, the preferred implementation is to
pass or fetch through the existing public Storefront catalog API boundary. Do
not import backend code or private module files.

## Data Flow

Taskbar and sidebar actions should navigate through existing Storefront routes
and URL query parameters.

Examples:

- `Còn hàng` applies the existing availability/product filter if supported by
  the current catalog API contract, or links to the catalog section with a
  documented UI-only pending state if no exact parameter exists.
- Category selections update the existing `category` query parameter and scroll
  to the catalog section.
- Search remains routed through the existing search/catalog flow.

The backend remains the authority for product publication, pricing, inventory,
checkout readiness, and payment.

## Responsive Behavior

Desktop:

- Header remains sticky.
- Taskbar remains directly below the header.
- Sidebar icon rail is fixed or sticky on the left.
- Expanded sidebar overlays content and must not cause horizontal overflow.

Mobile/tablet:

- Sidebar does not depend on hover.
- A compact control opens and closes the sidebar.
- The taskbar can horizontally scroll if needed, but must not create page-level
  horizontal overflow.

## Accessibility

- Sidebar and taskbar controls must be keyboard reachable.
- Icons need accessible names.
- Mobile sidebar open/close state must be represented with appropriate ARIA
  attributes.
- Focus rings follow the Storefront theme tokens.
- Existing skip link and `main` landmark must remain intact.

## Testing

Add or update Storefront tests to cover:

- taskbar discovery links render with the approved Vietnamese labels;
- desktop sidebar renders collapsed controls and exposes category/filter content
  when expanded/opened;
- mobile/tablet open-close behavior does not depend on hover;
- category/filter actions preserve the current catalog URL/query flow;
- existing header actions, account, cart, and hash navigation continue to work.

Before handoff, run the focused Storefront checks, production build, repository
diff check, and repository audit. A browser check is preferred when layout
behavior changes are material.

## Acceptance Criteria

- Storefront shows the new taskbar below the header.
- Storefront shows a left icon sidebar on desktop.
- Hovering the desktop sidebar opens category and product filters over the
  content without shifting the product grid.
- Mobile/tablet users can open and close the sidebar explicitly.
- Existing Storefront navigation, catalog browsing, cart, account, checkout,
  theme toggle, and hash-scroll behavior are not regressed.
- No backend or database changes are introduced.
