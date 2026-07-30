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

Read the smallest relevant set before acting:

- `AGENTS.md` for agent workflow and guardrails.
- `docs/product/vision.md` for Company-first product intent.
- `docs/architecture/system-baseline.md` for system boundaries and technology baseline.
- `docs/architecture/mvp-phases.md` for phase scope.
- `docs/roadmap/mvp-status.md` for current completion status.
- `docs/design/linear-product-canvas.md` before frontend work.
- `docs/project-structure.md` before creating directories or moving code.
- `docs/dependencies.md` before adding runtime, build, test, or infrastructure dependencies.
- `docs/build-from-source.md` before changing setup, validation, or run commands.
- `docs/agent-guidelines/implementation-guardrails.md` before agent, workflow, policy, GraphRAG, or permission work.

## Product Rules

- Keep `Company` as the center of the system. Do not turn the product into a chatbot or agent persona playground.
- Treat Digital Employees as governed company workers with identity, role, skills, tools, memory scope, permissions, budget, audit, and approval rules.
- Put authorization in backend/runtime layers. Frontend checks are only UX helpers.
- Require human approval for risky financial, legal, production, publishing, or permission-changing actions.
- Filter GraphRAG retrieval by tenant, role, resource, data classification, and policy before building LLM context.
- Record provenance for important graph, retrieval, and generated outputs.

## Frontend Rules

- Follow the Linear-inspired dark operational canvas in `docs/design/linear-product-canvas.md`.
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
- Do not create a release until a stable, demonstrable milestone is complete.

## Validation

Use the cheapest relevant checks during iteration. Before handing off completed repository work, run:

```bash
git diff --check
pnpm audit:repo
```

For code or build changes, prefer the full gate:

```bash
pnpm check
```
