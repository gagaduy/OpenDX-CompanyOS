<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Category Hero Carousel

- **Status:** Approved design, awaiting written-spec review
- **Date:** 2026-08-11
- **Scope:** NovaCommerce Storefront catalog hero and its public Catalog read model

## Problem

The Storefront catalog landing page currently builds its hero from the first
product in the general product page. The image and copy therefore remain tied
to that product, currently Nova Laptop Pro, and do not represent the active
product categories maintained by Catalog.

The hero must rotate through the categories that actually exist in the system.
Each category uses its newest eligible product as the visual and merchandising
representative. The implementation must remain dynamic when staff add, reorder,
archive, publish, or unpublish Catalog records.

## Approved Outcome

- The catalog hero contains one slide per eligible active category.
- Each slide uses the newest published product in its category.
- A category without an eligible published product and primary image is omitted.
- Slides follow the category `sortOrder`, with category identity as a stable
  tie-breaker.
- The hero advances every five seconds in a loop.
- Customers can select a slide by its visible category name.
- Selecting a category changes the slide without navigating.
- The existing `Khám phá ngay` action opens the catalog filtered to the active
  category.
- The experience supports light and dark themes, responsive layouts, keyboard
  input, reduced motion, and graceful fallback.

## Public Catalog Read Model

Catalog owns a purpose-specific public endpoint:

```text
GET /v1/storefront/hero-slides
```

The successful response uses the repository's established public envelope and
returns an ordered array. Each entry contains a public category summary and the
existing purpose-safe Storefront product representation needed by the hero:

```ts
interface StorefrontHeroSlideDto {
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly product: StorefrontProductDto;
}
```

The repository query selects exactly one product per category in PostgreSQL. It
orders eligible products by `products.created_at DESC, products.id ASC` and
orders the resulting slides by
`categories.sort_order ASC, categories.id ASC`. A product is eligible only when:

- its category is active;
- the product is published;
- it has an eligible primary image;
- it can be represented by the existing public Catalog mapper with an active
  variant and currently effective VND price.

The query reuses Catalog's current public media URL and product mapping rules.
It does not expose persistence entities or require another module's private
implementation. Category additions and publication changes are reflected on
the next request. No schema, in-memory database, cache, dependency, or new
architecture layer is introduced.

## Storefront Ownership and Data Flow

The Catalog frontend feature adds a focused API method and hook for hero slides.
The catalog landing page enables the request only when its URL represents the
unfiltered first page where the hero is visible. Filtered and paginated product
views do not fetch carousel data.

The feature flow is:

1. The landing page requests the product discovery page and hero slides through
   existing Storefront HTTP infrastructure.
2. Runtime schemas validate the hero response before the UI consumes it.
3. The carousel owns only presentation state: active slide, timer state, image
   failures, hover/focus pause, and document visibility.
4. Product publication, media eligibility, category ordering, and newest-product
   selection remain authoritative in Catalog and PostgreSQL.

The existing static hero remains a presentational fallback and is not turned
into a data-access component.

## Interaction and Layout

The hero retains its existing full-width image, scrim, centered product copy,
price, discovery action, and category scroll affordance. A category selector is
added below the product action area.

- The active image, product name, description, price, and destination change as
  one slide.
- Slide changes use a short opacity transition without moving the hero geometry.
- The active category button has a clear selected state and `aria-pressed`.
- Selecting a category resets the five-second interval.
- Hovering the hero or focusing any control inside it pauses autoplay.
- Leaving hover or focus resumes autoplay from a full interval.
- A hidden document pauses the interval until it becomes visible again.
- `prefers-reduced-motion: reduce` disables autoplay and the opacity transition;
  customers retain manual category selection.
- Desktop shows the category names as a centered row. Narrow screens use one
  horizontally scrollable row so controls never wrap over the product copy or
  cause document-level horizontal overflow.
- The call to action targets
  `/products?category=<encoded-category-slug>#catalog`.

Automatic slide changes are not announced through a live region. The hero has
an accessible section name, category selectors are real buttons, and focus
remains on the selected button during manual changes.

## Loading, Empty, and Failure Behavior

The catalog product page continues to own its existing loading and error state.
The hero does not render until enough data exists to display it without an
empty shell.

- If hero-slide loading or response validation fails, the page renders the
  existing static hero with the first product from the successfully loaded
  product page.
- If there is no fallback product, the hero is omitted and the product catalog
  remains usable.
- If a slide image fails in the browser, that slide is removed from the current
  presentation set and the carousel advances to the next valid slide.
- If only one valid slide remains, it stays static and autoplay stops.
- If every slide image fails, the existing static fallback behavior applies
  when its image is usable; otherwise the hero is omitted.

Failures do not synthesize category data, reuse an unrelated category image, or
change Catalog truth.

## Testing and Evidence

Development follows RED-GREEN-REFACTOR.

### Catalog and API

- Application/repository tests prove one result per category.
- Real PostgreSQL tests prove newest-product ordering and deterministic
  tie-breaking.
- Tests omit inactive categories, unpublished products, missing primary media,
  and products without public price/variant eligibility.
- API tests prove the public envelope, route, ordering, and purpose-safe DTO.

### Storefront

- Runtime schema tests reject malformed slide responses.
- Component tests use fake timers to prove five-second looping, manual
  selection, interval reset, hover/focus/visibility pause and resume, and the
  single-slide case.
- Component tests prove reduced-motion behavior, image-failure removal,
  fallback, category labels, selected state, and encoded filtered CTA.
- Browser evidence covers light and dark themes at desktop and mobile widths,
  category selection, no document overflow, and the existing header behavior.

Before handoff, run focused Catalog and Storefront tests, real PostgreSQL
integration tests, Storefront typecheck/build, the Storefront browser check,
`git diff --check`, `pnpm audit:repo`, and the full `pnpm check` gate.

## Out of Scope

- Staff-configured hero media, slide copy, or merchandising priority.
- A new category-image field or database migration.
- Promotions, sponsored placement, personalization, analytics, or impression
  tracking.
- Changes to product publication, pricing, inventory, or media ownership.
- Redesigning the surrounding discovery taskbar, sidebar, category showcase, or
  product grid.
