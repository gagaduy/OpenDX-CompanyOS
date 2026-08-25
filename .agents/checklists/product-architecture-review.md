<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Product Architecture Review

Use this checklist before shipping product model, API, workflow, infrastructure, or module-boundary changes.

- The change reinforces Company-first modeling instead of making Agent the primary product object.
- The change serves a documented MVP phase or one of the NovaCommerce demo flows.
- The change stays within the active B2C single-store, physical-goods,
  one-location commerce boundary.
- Business logic is not stored only in prompts or frontend state.
- Catalog prices, promotions, inventory, order transitions, payment
  confirmation, and reporting metrics remain authoritative in backend code and
  PostgreSQL.
- Browser redirects never prove payment; only authenticated provider events or
  successful reconciliation can confirm it.
- Shipping providers, refunds, returns, and electronic invoices are not added
  without a separately approved design.
- Single-company actor, department, role, resource, classification, and risk
  boundaries are enforced by the backend for every data access path.
- Workflow behavior that must survive restarts is designed for durable execution.
- Operational graph data remains a projection of source-of-truth records.
- Semantic graph or extracted relationships include provenance and confidence where applicable.
- New module directories contain real implementation, tests, and documentation; no empty future placeholders.
- New infrastructure is justified by current phase needs, not architectural appearance.
