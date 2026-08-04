<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Frontend Design Review

Use this checklist before shipping frontend UI changes.

- The screen is a usable product surface, not a marketing-only landing page.
- Public customer journeys belong in `apps/storefront`; staff operations belong
  in `apps/console`, with no shared authentication assumptions.
- Company, department, workflow, approval, agent, audit, or graph state is visible when relevant.
- Storefront screens expose clear loading, empty, unavailable-stock, checkout,
  payment-pending, payment-failed, and payment-confirmed states where relevant.
- Console screens prioritize operational scanning, filtering, status, audit,
  and role-appropriate actions.
- Canvas uses `#010102`; lavender `#5e6ad2` is scarce and reserved for primary action, focus, brand, or link emphasis.
- UI hierarchy uses charcoal surfaces, hairline borders, compact controls, and dense information layouts.
- The design avoids decorative gradients, atmospheric backgrounds, broad purple fills, and unrelated accent colors.
- Text does not overlap or overflow controls on desktop, tablet, or mobile layouts.
- Fixed-format UI elements have stable dimensions or responsive constraints.
- Buttons use appropriate icons where a familiar icon improves scanning.
- Frontend permission affordances are backed by backend/runtime authorization.
