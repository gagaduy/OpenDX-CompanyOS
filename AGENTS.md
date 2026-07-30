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
- `docs/roadmap/mvp-status.md`
- `docs/agent-guidelines/implementation-guardrails.md`
- `docs/design/linear-product-canvas.md` for frontend work
- `docs/build-from-source.md` for validation commands
- `docs/dependencies.md` before adding dependencies
- `docs/project-structure.md` before creating new directories
- `.agents/skills/opendx-companyos-development/SKILL.md` for the repo-local AI development workflow

## Workflow

- Work from `develop` or a feature branch created from `develop`.
- Keep commits atomic and use Conventional Commits.
- Update `CHANGELOG.md` under `[Unreleased]` in the same unit as the change.
- Do not edit `main` directly unless explicitly requested.
- Do not create phase sub-specs or sub-plans until the user explicitly kicks off that phase.

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
- GraphRAG must filter by tenant and permission before LLM context construction.
- Important operations need audit and provenance.
