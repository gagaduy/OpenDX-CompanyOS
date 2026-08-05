<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# MVP Status

## Current Phase

Phase 4 Inventory and Product Publication implementation is complete and its
exit validation is active. Phase 5 does not begin until the Phase 4 acceptance
gate has fresh evidence.

Active commerce master plan:
`docs/superpowers/plans/2026-08-04-novacommerce-commerce-platform.md`.

## Phase Status

| Phase | Status | Active Spec | Active Plan | Exit Decision |
| --- | --- | --- | --- | --- |
| Phase 1: Foundation | Complete | `docs/superpowers/specs/2026-07-30-app-foundation-design.md` | `docs/superpowers/plans/2026-07-30-app-foundation.md` | Complete after validation |
| Phase 2: Company Operating Core | Complete | `docs/superpowers/specs/2026-08-04-code-structure-refactor-design.md` | `docs/superpowers/plans/2026-08-04-api-clean-architecture-refactor.md` | Complete after single-company validation |
| Phase 3: Commerce Product Foundation | Complete | `docs/superpowers/specs/2026-08-05-commerce-product-foundation-design.md` | `docs/superpowers/plans/2026-08-05-commerce-product-foundation.md` | Complete after full validation |
| Phase 4: Inventory and Product Publication | Exit validation | `docs/superpowers/specs/2026-08-05-inventory-product-publication-design.md` | `docs/superpowers/plans/2026-08-05-inventory-product-publication.md` | Pending acceptance evidence |
| Phase 5: Storefront, Customer, and Cart | Not started | Master design only | Not created | Not decided |
| Phase 6: Checkout, Order, and SePay | Not started | Master design only | Not created | Not decided |
| Phase 7: Operational CRM, Support, and Dashboard | Not started | Master design only | Not created | Not decided |
| Phase 8: Production Hardening and Hosting Readiness | Not started | Master design only | Not created | Not decided |

## Latest Validation Evidence

- Repository audit: run before each handoff.
- Runtime validation: begins in Phase 1 after application scaffolding exists.
- Phase 1 plan created; implementation validation begins after scaffold execution.
- Phase 1 validation: `git diff --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:py`, `pnpm audit:repo`, and Docker Compose config all passed.
- Phase 2 spec drafted for backend/domain-first Company Operating Core.
- Phase 2 implementation plan drafted for domain contracts, in-memory repository, read-only API routes, documentation, and full validation.
- Phase 2 validation: domain tests, API tests, root TypeScript validation, Python tests, repository audit, Docker Compose config validation, and full `pnpm check` passed.
- Clean Architecture follow-up validation removed Company IDs, moved the
  NovaCommerce seed under production infrastructure ownership, and preserved
  the single-company API contracts.
- NovaCommerce Commerce Platform master design and plan approved for B2C
  storefront, one-location inventory, SePay payments, Operational CRM, and
  dashboard.
- Phase 3 focused design approved conceptually for a PostgreSQL-backed general-
  merchandise catalog; written-spec review remains pending.
- Company Operating Core PostgreSQL persistence companion design approved;
  detailed companion implementation plan written for execution after Commerce
  Tasks 1-4.
- Phase 3 validation: 104 API unit tests, 27 console tests, 24 PostgreSQL/MinIO
  integration tests, four shared-package tests, one Python test, console
  production build, repository audit, and Docker Compose configuration pass.
  Full-container readiness, repeated seed, custom-format backup/restore, PKCE
  login, authenticated seed images, and responsive Chrome acceptance also pass.
- Phase 4 focused design and file-level implementation plan approved for
  one-location PostgreSQL inventory, 15-minute reservations, technology product
  publication, sold-out discovery, and an Inventory console workspace.
- Phase 4 implementation adds PostgreSQL Inventory balances, movements and
  reservations, Catalog publication, anonymous public Catalog reads, technology
  fixtures, and role-aware Inventory/publication console workflows. Exit
  validation remains pending.

## Open Risks

- Customer identity and the public storefront frontend are not implemented;
  the anonymous Storefront Catalog API is implemented.
- SePay production requires a hosted public HTTPS endpoint and production
  merchant credentials; local development uses sandbox.
- Shipping, refunds, returns, and electronic invoices are outside the current
  roadmap.
- Workflow, agent runtime, and GraphRAG are deferred until commerce Phase 8 is
  complete.
