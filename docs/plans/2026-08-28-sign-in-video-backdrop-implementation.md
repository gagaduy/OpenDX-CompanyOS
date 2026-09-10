<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Sign-in Video Backdrop Implementation Plan

**Goal:** Play the database-managed NovaCommerce presentation video behind the sign-in panel without restoring video on the homepage.

**Architecture:** Authentication reads media through the existing public Catalog API contract and renders it as a decorative video over the existing image fallback. The homepage passes an explicit presentation preference to its existing hero component so media remains disabled there.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, semantic CSS tokens, Docker Compose

---

### Task 1: Lock the observable presentation behavior

**Files:**
- Modify: `apps/storefront/src/features/authentication/tests/authentication.test.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/intro-home-page.test.tsx`

1. Add a sign-in test whose Catalog reader returns a relative MP4 URL and assert
   the rendered video is muted, autoplaying, looping, inline, decorative, and
   resolved against the API base URL.
2. Add a homepage test with presentation media and assert no hero video is
   rendered.
3. Run the focused tests and confirm they fail because the new behavior is
   absent.

### Task 2: Implement the minimum Storefront behavior

**Files:**
- Modify: `apps/storefront/src/features/authentication/pages/sign-in-page.tsx`
- Modify: `apps/storefront/src/features/catalog/components/storefront-hero.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/intro-home-page.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`

1. Load presentation media through `SignInCatalogReader.heroPresentation()`.
2. Render the video over the current image fallback and remove it after a media
   error.
3. Add a `videoEnabled` hero input and disable it from `IntroHomePage`.
4. Re-run focused tests, then the complete Storefront test and build gates.

### Task 3: Record, deploy, and verify

**Files:**
- Modify: `CHANGELOG.md`

1. Add the behavior under `[Unreleased]`.
2. Re-import the existing local video and checked-in chapter configuration so
   the public content route is active without hard-coded media IDs.
3. Rebuild and recreate only the Storefront service.
4. Verify HTTP health, media range delivery, the sign-in DOM, repository audit,
   and diff cleanliness before committing atomically.
