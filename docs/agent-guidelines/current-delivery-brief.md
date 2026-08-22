<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Current Delivery Brief

Read this brief before any repository change. It is the compact entry point for
agents; consult linked documents only when the change needs their detail.

## Current Focus

Commerce Phases 1-8 are complete. Post-Commerce Agentic Workforce Phase D
(governed OpenRouter runtime) is in progress; its credential-owned live
acceptance remains outstanding. The canonical status, approved scope, and
active branch information are in [`../roadmap/mvp-status.md`](../roadmap/mvp-status.md).

## Non-Negotiable Boundaries

- The product is Company-first, B2C single-store, one inventory location, and
  VND-only. Backend code remains authoritative for price, promotion, inventory,
  order, payment, authorization, and audit truth.
- Do not add marketplace, multi-warehouse, shipping, refund, return,
  e-invoice, GraphRAG, or unapproved workflow/agent behaviour.
- Browser redirects never confirm payment. Only authenticated provider events
  or successful reconciliation may do so.
- Risky actions require human approval. Agents use distinct identities and
  cannot decide permissions or share credentials.
- Preserve Clean Architecture: feature/module ownership, inward dependencies,
  validated boundaries, public APIs between modules, and no business logic in
  transport or framework glue.

## Read by Change Type

| Change | Read before editing |
| --- | --- |
| Product scope or delivery phase | `docs/product/vision.md`, `docs/roadmap/mvp-status.md` |
| Business code, refactor, or new tests | `docs/architecture/clean-architecture.md`, `docs/development/coding-conventions.md`, `docs/development/testing-strategy.md` |
| New module import or public API | `docs/architecture/dependency-rules.md` |
| Agent, workflow, policy, permission, or GraphRAG work | `docs/agent-guidelines/implementation-guardrails.md`, `docs/architecture/system-baseline.md` |
| Frontend work | `docs/design/linear-product-canvas.md` |
| New directory | `docs/project-structure.md` |
| Dependency change | `docs/dependencies.md` |
| Build, validation, Docker, or run command | `docs/build-from-source.md` |

## Validation Defaults

- During normal iteration: `pnpm check` (the fast, source-only gate).
- Before handing off any repository change: `git diff --check` and `pnpm audit:repo`.
- Before merge, release, or changes crossing service/infrastructure boundaries:
  run `pnpm check:full`; use `make check` when the reproducible container gate
  and API integration suite are required.
- Run focused acceptance gates only when their owned module or contract changes.

Do not replace a required payment, authorization, recovery, or agent-governance
gate with the fast gate.
