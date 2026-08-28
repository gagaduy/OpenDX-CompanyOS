<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Collapsible Sign-in Panel Design

The sign-in route keeps its full-bleed Catalog video and image fallback, but
replaces the initially visible authentication panel with one compact Google
trigger centered in the same stage. Activating that trigger reveals the
existing NovaCommerce sign-in panel; it does not start OAuth directly. This
keeps the video visually available while preserving the established Google
Sign-In flow and safe `returnTo` handling.

The expanded panel is a modal dialog labelled by its existing heading. A close
button sits in its top-right corner. Escape, the close button, or a pointer
interaction on the backdrop closes it, while interactions inside the panel do
not. Opening moves focus to the close button and closing returns focus to the
Google trigger. The trigger and close button have explicit accessible labels,
stable dimensions, and semantic focus styles. The component remains local to
Authentication because no second consumer exists.

The current semantic theme tokens continue to drive the panel. New styles add
only a compact elevated trigger, a bounded dialog transition, and responsive
spacing; no new dependency, global state, or API contract is introduced. The
Google Identity component mounts only while the panel is expanded. Tests cover
the collapsed default, opening, all three closing paths, inside-click
isolation, and focus restoration. Existing tests continue to cover video,
image fallback, return URL safety, session restoration, and Google
configuration errors.
