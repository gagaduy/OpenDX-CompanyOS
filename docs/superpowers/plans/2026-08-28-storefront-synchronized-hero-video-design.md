<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Synchronized Hero Video Design

**Status:** Approved on 2026-08-28

## Objective

Replace the desktop Storefront hero's static background with an optional
Catalog-owned video presentation while keeping the real product, price, copy,
destination, and category truth database-backed. The active product must track
the video's configured chapters, and direct category or carousel navigation
must seek the video to the corresponding chapter.

The supplied local asset is
`BogusHatefulSpools-Aug-28-05-38-22.mp4`. Its embedded watermark remains part
of the source material. A local absolute path must never become application or
database configuration.

## Scope

- Store one active Storefront hero video and its ordered category chapters in
  the Catalog persistence boundary.
- Import an operator-selected MP4 into MinIO through an internal CLI command.
- Expose validated presentation metadata and a byte-range-capable public media
  URL through the Catalog API.
- Synchronize the existing Storefront product carousel with video playback.
- Preserve the full product name, description, price, CTA, category selector,
  and carousel controls.
- Fall back to the existing image carousel on mobile, reduced-motion clients,
  absent configuration, or media failure.

This design does not add a public media-management UI, a public upload route,
video editing, per-product generated videos, or changes to price and inventory
authority.

## Architecture and Data Flow

Catalog owns the feature end to end. PostgreSQL stores hero-media metadata and
ordered chapter records; MinIO stores the MP4 bytes. The database metadata
includes a stable identifier, object key, content type, byte size, duration,
activation state, and timestamps. Each chapter records its category, stable
sort order, inclusive start time, exclusive end time, and accessibility label.

Database constraints reject negative or empty time ranges, duplicate active
sort positions, duplicate category bindings within one presentation, and
chapters outside the declared media duration. Only enabled categories may be
projected into an active public presentation. The service maps the persistence
shape to a purpose-specific public DTO; persistence rows and MinIO object keys
are not exposed directly.

An internal import command accepts the local file and explicit chapter
configuration. It validates the MP4 metadata, uploads the object first, and
then atomically upserts the database configuration. The import is idempotent
for identical content and configuration. A failed upload or transaction leaves
the previously active presentation unchanged. A clean source checkout remains
functional without the optional asset and renders the image carousel.

The public API returns the active presentation with a stable API media URL and
ordered chapters alongside the existing category/product projection. The
media handler resolves only active Catalog-owned media and supports validated
HTTP byte ranges so browser seeking does not download the complete file again.
It returns `Accept-Ranges`, `Content-Range`, an exact content type and bounded
cache headers without accepting an arbitrary object key from the caller.

## Storefront Interaction

On supported tablet and desktop viewports, the MP4 fills the hero canvas with
`object-fit: cover`. It is muted, inline, looping, and loaded with metadata
preload. Native browser controls stay hidden. A dedicated accessible
play/pause control is always available because the animation lasts longer than
five seconds.

The full product panel remains visible above the video. A bounded,
theme-token-based translucent surface on the left protects the eyebrow, name,
description, price, and CTA from text already baked into the video. The right
product stage renders the current database product media in a restrained
framed surface. A short opacity and scale transition makes the real product
appear part of the motion presentation without modifying or synthesizing its
commerce image.

The video time is the automatic-navigation clock. Crossing a chapter start
selects that chapter's category and product. Clicking a category tab or
previous/next control selects the slide and seeks to its configured start time.
Hover or focus within the hero pauses playback so copy and controls remain
stable. Resuming continues from the current chapter. Category controls retain
`aria-pressed`, and all actions remain keyboard accessible.

Mobile layouts and clients with `prefers-reduced-motion: reduce` do not render
the video element, preventing an implicit 25 MB transfer. They retain the
existing image carousel and full product information. Light and night themes
share one component and semantic tokens; neither theme forks the component
tree.

## Failure and Recovery

Missing configuration, a rejected media request, unsupported playback, or a
runtime video error switches the hero to the existing image carousel. Product
copy, price, CTA and navigation remain available during the fallback. A poster
or current product image prevents a blank hero while metadata loads.

The import CLI is the only write path in this phase. It validates file type,
size, duration, ordered non-overlapping chapters, category references, and
chapter bounds before activation. Rollback disables the active video
presentation, returning all clients to image mode. It does not delete products,
customer data, Wishlist data, or the previous MinIO object.

## Testing

Implementation follows red-green-refactor with focused coverage:

- Migration integration tests cover schema creation, constraints, indexes,
  rollback, and reapplication.
- Import application tests cover validation, idempotency, upload failure, and
  atomic activation through fake storage and repository ports.
- Repository and API integration tests prove that only active presentations
  and eligible category/product projections are returned.
- Media integration tests cover full responses, valid single byte ranges,
  rejected malformed or multi-ranges, cache headers, and unavailable objects.
- Storefront component tests cover muted inline playback, chapter-driven slide
  changes, navigation seeking, hover/focus pause, manual play/pause, error
  fallback, and reduced-motion behavior.
- Responsive browser acceptance proves desktop video behavior in both themes,
  mobile image fallback, keyboard focus, stable product/CTA content, and no
  horizontal overflow.

## Rollout

Apply migrations, rebuild the API and Storefront, run the explicit video import
against the operator-owned local MP4, and recreate the affected services. The
rollout must verify API readiness, the public presentation DTO, byte-range
delivery, Storefront HTTP availability, synchronized desktop behavior, and
mobile/reduced-motion fallback. No database reset or restore is required.
