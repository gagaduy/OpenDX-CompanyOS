<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agent Instructions

These instructions apply to AI coding agents working in this repository.

## Read First

Before changing code or documentation, read:

- `docs/product/vision.md`
- `docs/architecture/system-baseline.md`
- `docs/architecture/clean-architecture.md` before creating or moving code
- `docs/architecture/dependency-rules.md` before introducing module imports
- `docs/roadmap/mvp-status.md`
- `docs/agent-guidelines/implementation-guardrails.md`
- `docs/design/linear-product-canvas.md` for frontend work
- `docs/build-from-source.md` for validation commands
- `docs/dependencies.md` before adding dependencies
- `docs/project-structure.md` before creating new directories
- `docs/development/coding-conventions.md` for TypeScript, Python, and React work
- `docs/development/testing-strategy.md` before behavior changes or refactors
- `.agents/skills/opendx-companyos-development/SKILL.md` for the repo-local AI development workflow

## Workflow

- Work from `develop` or a feature branch created from `develop`.
- Keep commits atomic and use Conventional Commits.
- Update `CHANGELOG.md` under `[Unreleased]` in the same unit as the change.
- Do not edit `main` directly unless explicitly requested.
- Do not create phase sub-specs or sub-plans until the user explicitly kicks off that phase.
- Do not interpret a repository-structure request as approval to refactor
  existing application code. Code migration requires an explicit, focused spec
  and plan.
- Do not create empty architecture trees, `.gitkeep` placeholders, or
  speculative modules. Add directories with their first approved source or
  test file.

## Clean Architecture

- Organize business code by owning module or frontend feature.
- Keep dependencies inward: presentation and infrastructure depend on
  application/domain contracts, never the reverse.
- Keep business logic out of routes, controllers, repositories, React
  presentational components, and framework configuration.
- Keep database access in repository implementations and external SDK access
  behind inward-facing ports.
- Validate untrusted input and map internal entities to purpose-specific public
  DTOs.
- Use constructor injection or explicit factories; add a DI framework only for
  a demonstrated need.
- Import another module or feature through its public API, not private files.
- Apply architecture pragmatically. Do not add pass-through layers or
  interfaces without an active responsibility or substitution boundary.

## Open-Source Readiness

The OLP 2026 open-source criteria reward public source control, OSI-approved licensing, releases, build-from-source quality, dependency clarity, documentation, and issue tracking.

Preserve these properties:

- Keep Apache-2.0 license files and SPDX headers current.
- Keep build and validation commands runnable from source.
- Do not vendor dependencies into the repository.
- Document new dependencies in `docs/dependencies.md`.
- Keep README and build documentation accurate.
- Keep GitHub issue templates usable.
- Keep repo-local skills in `.agents/skills` aligned with product, design, and open-source rules.

## Product Guardrails

- Company is the center of the system, not an agent or chatbot.
- Authorization must be enforced in backend/runtime layers, not only the frontend.
- Agents must not share credentials or decide their own permissions.
- Risky actions require human approval.
- GraphRAG must filter by actor, department, role, resource, and data
  classification before LLM context construction.
- Important operations need audit and provenance.
