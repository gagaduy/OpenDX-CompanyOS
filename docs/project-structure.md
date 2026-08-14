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
`src/features/company-overview` owns the Mission Control-style company surface,
`src/features/catalog` owns staff catalog/publication workflows,
`src/features/inventory` owns stock operations, and `src/shared` contains
only genuinely shared frontend concerns.

`apps/api` contains the Express + TypeScript modular monolith. Its implemented
`modules/company-operating-core`, `modules/catalog`, `modules/inventory`,
`modules/customer`, `modules/cart`, `modules/promotion`, `modules/checkout`,
`modules/order`, and `modules/payment` own their respective
domain, application, infrastructure, presentation, seed, and test code. Both
commerce repositories use shared PostgreSQL transaction infrastructure; Catalog
media storage remains behind its inward-facing storage port.

`apps/storefront` contains the React + TypeScript customer commerce surface.
Its feature-owned Catalog, authentication, Cart, customer-account, Checkout,
and Order areas consume runtime-validated API envelopes; `src/app` owns
composition and `src/shared` contains only HTTP, formatting, and global style
concerns used by multiple features.

The Console adds role-aware Order and Payment operation features. Operations
and Finance enter through public feature APIs and cannot import backend or
another feature's private implementation.

## Services

`services/ai-runtime` contains the Python FastAPI shell for future document
parsing, extraction, embeddings, reranking, and GraphRAG support. Its
`app/create_app.py` file is the composition root, `app/main.py` exports the ASGI
application, and `app/shared/health` owns the technical health endpoint and
response schema. Business modules are created only when their implementation
is approved.

## Shared Packages

`packages/config` contains shared configuration helpers.

`packages/domain` currently contains shared service names. Company Core
entities belong to their API module rather than this package.

`packages/ui` contains design tokens and shared frontend primitives.

## Infrastructure and Scripts

`infra/docker` contains the pinned full local Docker Compose topology,
PostgreSQL test-database initialization, and Keycloak realm import.

`infra/deploy` contains the Phase 8 VPS/VM production-candidate Docker Compose
and Caddy examples. It is separate from local development infrastructure and
uses environment variables for all production-specific domains and secrets.

`infra/backups` is the ignored local destination for matching readable SQL and
custom-format PostgreSQL backup pairs created by the root `Makefile`.

`scripts/audit` contains repository governance audit helpers.

`scripts/dev` contains deterministic Storefront and Console browser validation,
an isolated checkout-to-paid database exit gate, and an opt-in real SePay
sandbox runner. Browser fixtures never claim provider payment confirmation;
only the credential-owned sandbox runner waits for authoritative backend state.

`docs` contains product, architecture, design, roadmap, build, dependency, and
planning documentation. `docs/superpowers/specs` and
`docs/superpowers/plans` hold approved implementation direction, while
`docs/superpowers/reports` holds non-normative historical implementation and
validation evidence. Repository documentation must not be stored in hidden
tool-specific directories at the repository root.

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

Approved commerce module areas include:

- `modules/identity`
- `modules/catalog`
- `modules/inventory`
- `modules/customer`
- `modules/cart`
- `modules/promotion`
- `modules/checkout`
- `modules/order`
- `modules/payment`
- `modules/crm`
- `modules/support`
- `modules/reporting`
- `modules/audit`
- `modules/agentic` (Phase A governance control plane; non-executing)

Workflow execution, Skills, Graph, and broad Integration modules remain in the
post-commerce roadmap. Agent governance is owned by the implemented
`apps/api/src/modules/agentic` feature; do not split it before an approved need.

## Branching Model

- `main` is the stable branch.
- `develop` is the integration branch.
- Feature branches should branch from `develop`.
- Merge completed feature work back into `develop`.
- Merge `develop` into `main` only at stable milestones.
