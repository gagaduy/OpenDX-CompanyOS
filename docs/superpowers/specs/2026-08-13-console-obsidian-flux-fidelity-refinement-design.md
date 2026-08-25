<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# NovaCommerce Console Obsidian Flux Fidelity Refinement

- **Status:** Approved for planning
- **Date:** 2026-08-13
- **Surface:** `apps/console` at `localhost:3000`
- **Reference:** User-provided Stitch Obsidian Flux screens and the completed
  Console redesign

## Goal

Raise the completed Console redesign from a coherent Obsidian Flux adaptation
to a closer high-fidelity match for the supplied Stitch layout language. The
refinement preserves every existing route, feature boundary, API contract,
authorization rule, PostgreSQL-backed operation, and truthful Coming Soon
state.

The Stitch artifacts remain visual references rather than product truth. The
refinement must not add Tailwind, Material Symbols, remote fonts or images,
invented records, Stripe or card data, USD values, multiple sales channels,
shipping operations, or unsupported mutations.

## Visual-System Refinement

- Keep the existing dark canvas `#010102`, elevated surface `#08090a`, and
  scarce primary accent `#5e6ad2`.
- Retain the persisted light theme through the same semantic tokens.
- Give the active desktop sidebar item a two-pixel primary left indicator and
  a restrained tinted surface, matching the Stitch navigation hierarchy.
- Preserve the 240-pixel desktop sidebar, tablet icon rail, and mobile drawer.
- Use a local/system monospace stack for generated identifiers, SKUs,
  timestamps, correlation identifiers, and compact financial metadata. Do not
  introduce a font dependency.
- Reduce operational table rows toward the Stitch 40-pixel density where the
  content remains legible. Mobile record-card layouts retain touch-safe
  controls and do not force 40-pixel desktop density.
- Use four- to eight-pixel control radii and eight- to twelve-pixel panel radii.
  Pills remain reserved for status and metadata.

## Product Editor

The editor keeps the existing five tabs and feature hooks. Only composition
and presentation change.

The Product tab groups existing fields into three visual panels:

1. Basic Details: product name and slug preview;
2. Classification: category and brand;
3. Description and Attributes: existing description and attribute rows.

The create route retains its real 25-percent initial setup rail. Persisted
products do not display fictional completion percentages. Product Tags remain
disabled and visibly marked Coming Soon. Save, validation, concurrency,
variants, prices, media, publication, and audit behavior are unchanged.

## Executive Dashboard

The Dashboard adopts the Stitch composition without synthetic charts:

- the first KPI grid contains gross paid revenue, paid orders, average order
  value, registered customers, and repeat customers from the existing
  authoritative reporting responses;
- Operational Focus displays the existing open-ticket, overdue-follow-up, and
  SLA-breach aggregates without invented order-risk or payment-failure counts;
- Performance Overview contains the real product-performance table plus
  disabled Revenue Trend and Order Volume by Channel Coming Soon panels;
- the existing 1-to-366-day date range, stale-data notice, loading, empty,
  error, and retry behavior remain intact.

The layout may differ from the mockup wherever the backend does not expose an
authoritative metric. Empty space is preferred over fake data.

## Support Ticket Detail

The ticket header makes the existing subject, ticket identifier, status,
priority, version, and legal actions visually explicit. The main workspace
follows the Stitch hierarchy:

- the primary column contains the chronological ticket timeline and real
  customer reply composer;
- the side rail contains purpose-limited support context, attachments, and an
  SLA Monitor;
- Internal Note remains disabled and marked Coming Soon;
- only clean-scanned attachments can be downloaded.

The SLA Monitor derives its display only from fields already returned by the
Support detail contract. It shows the relevant target/breach state and elapsed
or remaining information when available. If the contract contains no usable
deadline or elapsed value for a ticket, the monitor states that SLA timing is
unavailable; it must not calculate or invent a deadline in the browser.

## Payments and Shared Evidence Surfaces

Payment detail retains the existing Provider Events, Reconciliation History,
Payment Record, and Reconciliation Control composition. Refinement is limited
to denser spacing, consistent technical typography, status hierarchy, and
alignment with the Stitch side rail. Values remain SePay/VND facts. Receipt
and export controls remain disabled Coming Soon controls.

The same identifier and timeline typography applies to Order, Customer,
Inventory, Catalog audit, and Support evidence surfaces without moving business
logic into shared presentation code.

## Responsive and Accessibility Requirements

- Desktop at 1280 pixels and above keeps the full sidebar and dense multi-column
  operational layouts.
- Tablet from 768 through 1279 pixels keeps the icon rail and collapses page
  grids without clipping content.
- Mobile below 768 pixels keeps the modal drawer and single-column record-card
  layouts.
- No route may create document-level horizontal overflow or intersect visible
  controls.
- Focus indicators remain visible in dark and light themes.
- Status is never communicated by color alone.
- Heading order, table semantics, labels, dialog focus management, and reduced
  motion behavior remain valid.

## Testing and Evidence

Implementation follows focused red-green-refactor cycles. Component tests must
prove the new visual landmarks and truthful data placement without asserting
implementation-only class lists where semantic roles or labels are available.

The two Console browser checks continue to cover all 17 routes at 390x844,
768x1024, and 1440x900 in both themes. They must continue to verify route
settling, horizontal overflow, visible-control collision, focus visibility,
responsive navigation, authorization denial before API access, and Coming Soon
controls. Representative Product Editor, Dashboard, Support Detail, Payment
Detail, mobile, tablet, dark, and light screenshots must be inspected manually
against the Stitch references.

Final validation includes Console tests, strict typecheck, production build,
both Console browser checks, `git diff --check`, `pnpm audit:repo`, and the root
`pnpm check` gate. The local demonstration stack is rebuilt only after those
checks pass.

## Acceptance Criteria

- The active navigation treatment, operational typography, table density, and
  spacing closely follow the Obsidian Flux reference system.
- Product Editor, Dashboard, Support Detail, and Payment Detail match the
  approved Stitch hierarchy using only existing truthful data and actions.
- SLA presentation is derived from the Support contract or explicitly shown as
  unavailable.
- All existing Console behavior and role boundaries remain intact.
- All 17 routes remain responsive and accessible in both themes.
- No dependency, API, database, migration, Storefront, or repository-structure
  change is introduced.

## Non-Goals

- Pixel-for-pixel copying of Stitch demo content.
- Implementing disabled Coming Soon capabilities.
- Adding backend reporting metrics or Support SLA fields.
- Changing Console routes, feature ownership, authorization, or data contracts.
- Redesigning the Storefront.
