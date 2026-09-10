<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Sign-in Video Backdrop Design

The NovaCommerce sign-in page will use the already imported `nova-signal`
Catalog presentation video as its full-bleed background. The video remains
owned by Catalog, stored in MinIO, and discovered through the validated public
Catalog presentation contract; Authentication will not embed a media ID or
copy the 25 MB asset into the Storefront bundle.

The video autoplays muted, loops, and uses `playsInline`. The current
best-selling product image remains beneath it and is also used as the poster,
so an unavailable or unsupported video leaves a complete sign-in screen. The
existing scrim and semantic theme tokens continue to protect panel contrast.
The media element is decorative and hidden from assistive technology.

The homepage explicitly suppresses presentation video while retaining its
existing synchronized image slides. This preserves the prior decision to
remove video from the homepage while allowing the same database-managed media
to serve the authentication backdrop. Tests cover video attributes, resolved
API URLs, fallback behavior, and homepage suppression.
