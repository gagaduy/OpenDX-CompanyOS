---
name: opendx-companyos-development
description: Use when planning, designing, implementing, reviewing, or documenting OpenDX CompanyOS work so product, architecture, frontend design, open-source, and repository rules stay aligned.
---

<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# OpenDX CompanyOS Development

Use this skill before changing OpenDX CompanyOS product behavior, architecture, frontend UI, repository structure, or contributor-facing documentation.

## Read First

Read `AGENTS.md` and
`docs/agent-guidelines/current-delivery-brief.md` before acting. The brief
routes each change type to its smallest relevant set of architecture, product,
design, dependency, testing, or build documentation. Do not load unrelated
historical plans or phase documents for a focused change.

## Product Rules

- Keep `Company` as the center of the system. Do not turn the product into a chatbot or agent persona playground.
- Treat the NovaCommerce Commerce Platform master design as the active delivery
  target until its commerce phases are complete.
- Keep the active commerce boundary to B2C single-store, physical goods, one
  inventory location, VND, guest checkout, optional customer accounts, SePay,
  Operational CRM, support, and dashboard.
- Do not add shipping providers, refunds, returns, electronic invoices,
  marketplace, multi-warehouse, workflow, Digital Employee, or GraphRAG
  implementation without a new approved design.
- Keep pricing, promotions, inventory, order transitions, payment confirmation,
  and reporting metrics authoritative in backend code and PostgreSQL.
- Treat Digital Employees as governed company workers with identity, role, skills, tools, memory scope, permissions, budget, audit, and approval rules.
- Put authorization in backend/runtime layers. Frontend checks are only UX helpers.
- Require human approval for risky financial, legal, production, publishing, or permission-changing actions.
- Filter GraphRAG retrieval by actor, department, role, resource, data classification, and policy before building LLM context.
- Record provenance for important graph, retrieval, and generated outputs.

## Frontend Rules

- Follow the Linear-inspired operational canvas in
  `docs/design/linear-product-canvas.md`. Keep Console dark; preserve the
  Storefront's shared light/dark token system and customer theme preference.
- Use `#010102` as the canvas and `#5e6ad2` as a scarce accent for brand, primary action, focus, and link emphasis.
- Prefer dense product surfaces, tables, timelines, graph views, sidebars, and status panels over marketing hero sections.
- Do not introduce decorative gradients, orbs, broad purple washes, or unrelated chromatic accents.
- Use compact controls, icons where appropriate, stable dimensions, and responsive layouts that prevent text overlap.

## Repository Rules

- Work from `develop` or a feature branch based on `develop`.
- Keep changes atomic and use Conventional Commits.
- Update `CHANGELOG.md` under `[Unreleased]` for each repository-changing unit.
- Add SPDX headers to new license-capable files.
- Do not vendor third-party dependency source.
- Do not create empty future module directories before a phase spec and plan approve them.
- Do not treat approval of a directory map or architecture document as approval
  to migrate existing code. Obtain a focused implementation spec and plan.
- Do not create a release until a stable, demonstrable milestone is complete.
- Keep the root `Makefile` as a discoverable contributor interface over direct
  pnpm, Python, and Docker Compose commands; do not hide business logic in it.
- Commerce phase plans must explicitly cover Docker topology, health checks,
  volumes, environment setup, migrations, seed/reset, and Docker documentation.

## Clean Architecture Workflow

Before implementing or moving code:

1. Identify the owning business module or frontend feature.
2. Confirm the phase and focused implementation spec are approved.
3. Define the observable behavior and write the smallest relevant failing test.
4. Place business rules in domain or application code.
5. Define inward-facing interfaces where persistence, tools, or external
   systems need substitution.
6. Keep concrete adapters in infrastructure and wire them in a composition
   root.
7. Validate transport input before controllers or handlers use it.
8. Map internal entities to purpose-specific response DTOs.
9. Update affected API, architecture, dependency, build, and changelog docs.
10. Run the checks appropriate to every changed workspace.

Do not create every directory from the target tree up front. Create a directory
with its first approved source or test file. Avoid ceremonial interfaces,
pass-through classes, and shared abstractions without proven consumers.

## Validation

Use the cheapest relevant checks during iteration. Before handing off completed repository work, run:

```bash
git diff --check
pnpm audit:repo
```

For broad pre-merge code or build validation, use the full host gate:

```bash
pnpm check:full
```

`pnpm check` is the fast source-only iteration gate. Use `make check` when the
reproducible container gate and API integration suite are required.
