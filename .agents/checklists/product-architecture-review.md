<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Product Architecture Review

Use this checklist before shipping product model, API, workflow, infrastructure, or module-boundary changes.

- The change reinforces Company-first modeling instead of making Agent the primary product object.
- The change serves a documented MVP phase or one of the NovaCommerce demo flows.
- Business logic is not stored only in prompts or frontend state.
- Tenant isolation and backend authorization are represented for any data access path.
- Workflow behavior that must survive restarts is designed for durable execution.
- Operational graph data remains a projection of source-of-truth records.
- Semantic graph or extracted relationships include provenance and confidence where applicable.
- New module directories contain real implementation, tests, and documentation; no empty future placeholders.
- New infrastructure is justified by current phase needs, not architectural appearance.
