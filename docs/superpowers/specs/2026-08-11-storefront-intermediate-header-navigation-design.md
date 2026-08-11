<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Intermediate Header Navigation

- **Status:** Approved design, awaiting written-spec review
- **Date:** 2026-08-11
- **Scope:** NovaCommerce Storefront header between mobile and wide desktop widths

## Problem

The Storefront header uses a three-column grid with a centered four-link
navigation and a right-side action group containing a minimum `190px` search
field plus three icons. Between `769px` and `1199px`, the combined
intrinsic widths exceed the grid. The navigation then overflows into the search
field, causing the `Khám phá` label and search control to overlap.

The existing mobile navigation only activates at `768px`. Browser reproduction
confirms overlap at `800`, `900`, `1024`, and `1100px`, while `1200px` renders
without overlap. This is a header breakpoint gap, not a routing, search, copy,
or page-content defect.

## Approved Outcome

- At `1200px` and wider, the current wide-desktop header remains unchanged.
- From `769px` through `1199px`, the desktop navigation is collapsed behind the
  existing hamburger control.
- The intermediate header keeps the brand on the left and the hamburger,
  search field, theme toggle, account, and cart actions on the right.
- Opening the hamburger shows the existing four navigation links in a vertical
  panel directly below the `76px` header.
- At `768px` and below, the current mobile header and page layout remain
  unchanged.
- Search behavior, navigation destinations, theme behavior, copy, discovery
  taskbar, and page layouts remain unchanged.
- No header item overlaps another or creates horizontal document overflow.

## Design

Add a focused CSS media query for
`(min-width: 769px) and (max-width: 1199px)`. Inside that query:

- change `.topbar-inner` to the existing two-column brand/actions layout;
- remove `.main-nav` from grid flow and position it across the viewport below
  the header;
- keep `.main-nav` hidden until its existing `.open` class is present;
- render an open menu as the existing vertical, bordered surface;
- show `.mobile-menu` without hiding `.theme-toggle` or `.account-button`;
- preserve the `76px` header height and the discovery taskbar's existing sticky
  offset.

The `max-width: 768px` rules remain responsible for smaller header dimensions,
the `64px` dropdown offset, narrow search width, and hidden theme/account
controls. No JavaScript breakpoint logic or duplicate navigation component is
introduced.

## Ownership and Structure

The implementation stays in the existing Storefront shell styling and browser
regression script. The React shell already contains the required hamburger
state and accessible label, so no component behavior change is approved. No
new directory, dependency, API, token, or architecture layer is introduced.

## Verification

Development follows RED-GREEN-REFACTOR:

1. Extend the real browser check with intermediate widths and assertions that
   the hamburger is visible, the closed desktop navigation is hidden, the
   search field is visible, and their rectangles do not overlap.
2. Run the browser check before the CSS change and record its expected failure.
3. Add the minimum intermediate media query and rerun the browser check.
4. Verify the hamburger opens the four-link vertical menu at an intermediate
   width.
5. Run all Storefront tests, typecheck, production build, repository audit, and
   diff check.
6. Rebuild the Storefront and inspect dark/light screenshots at `800`, `1024`,
   `1100`, and `1200px`, plus the existing `390` and `768px` evidence.

## Out of Scope

- Changing navigation labels, destinations, search behavior, or action icons.
- Moving the search field to another row or hiding it at intermediate widths.
- Changing mobile page layout or globally raising the mobile breakpoint.
- Refactoring `StorefrontShell`, adding resize observers, or measuring layout
  in React.
- Redesigning the discovery taskbar or any page content.
