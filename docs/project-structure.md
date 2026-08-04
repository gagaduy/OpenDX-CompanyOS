<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Project Structure

OpenDX CompanyOS is a monorepo. Branches contain the full repository; work is scoped by file changes, not by partial branch contents.

## Current Top-Level Layout

```text
apps/
services/
packages/
infra/
scripts/
docs/
.agents/
.github/
```

## Current Applications

`apps/console` contains the Next.js product console. It owns the Mission Control-style frontend shell and future product UI surfaces.

`apps/api` contains the Express + TypeScript API entrypoint for the future modular monolith.

## Services

`services/ai-runtime` contains the Python FastAPI shell for future document parsing, extraction, embeddings, reranking, and GraphRAG support.

## Shared Packages

`packages/config` contains shared configuration helpers.

`packages/domain` contains minimal shared contracts such as service names and ID helpers. Full Company Core entities should not be added here by default.

`packages/ui` contains design tokens and shared frontend primitives.

## Infrastructure and Scripts

`infra/docker` contains local Docker Compose infrastructure.

`scripts/audit` contains repository governance audit helpers.

`scripts/dev` contains developer validation scripts.

`docs` contains product, architecture, design, roadmap, build, dependency, and planning documentation.

`.agents/skills` contains repo-local skill instructions for AI coding agents.

`.agents/checklists` contains short review checklists for open-source readiness, product architecture, frontend design, and agent safety.

`.github` contains issue and pull request templates for public collaboration.

## Target Code Organization

New business code and explicitly approved refactors follow feature-first Clean
Architecture. The normative structure and responsibilities are documented in:

- [`architecture/clean-architecture.md`](architecture/clean-architecture.md)
- [`architecture/dependency-rules.md`](architecture/dependency-rules.md)
- [`development/coding-conventions.md`](development/coding-conventions.md)
- [`development/testing-strategy.md`](development/testing-strategy.md)

Target trees in those documents describe where implemented files belong. They
are not a request to pre-create every directory.

Do not create empty `modules/*` or `features/*` directories. Create a directory
only when the relevant phase has approved its spec, plan, source, and tests.

## Planned Business Areas

Expected future module areas include:

- `modules/company`
- `modules/organization`
- `modules/workflow`
- `modules/agent`
- `modules/skill`
- `modules/policy`
- `modules/approval`
- `modules/graph`
- `modules/integration`
- `modules/audit`

## Branching Model

- `main` is the stable branch.
- `develop` is the integration branch.
- Feature branches should branch from `develop`.
- Merge completed feature work back into `develop`.
- Merge `develop` into `main` only at stable milestones.
