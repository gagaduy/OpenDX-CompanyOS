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

`apps/console` contains the React + TypeScript product console built with Vite.
Its `src/app` directory owns application composition,
`src/features/company-overview` owns the current Mission Control-style product
surface, and `src/shared` contains only genuinely shared frontend concerns.

`apps/api` contains the Express + TypeScript modular monolith. Its implemented
`modules/company-operating-core` slice owns domain, application,
infrastructure, presentation, fixtures, and integration tests for the
configured company.

## Services

`services/ai-runtime` contains the Python FastAPI shell for future document parsing, extraction, embeddings, reranking, and GraphRAG support.

## Shared Packages

`packages/config` contains shared configuration helpers.

`packages/domain` currently contains shared service names. Company Core
entities belong to their API module rather than this package.

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
