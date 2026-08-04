<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# MVP Status

## Current Phase

Phase 2 is complete. Phase 3 Commerce Product Foundation focused design is
approved and its implementation plan is written for execution.

Active commerce master plan:
`docs/superpowers/plans/2026-08-04-novacommerce-commerce-platform.md`.

## Phase Status

| Phase | Status | Active Spec | Active Plan | Exit Decision |
| --- | --- | --- | --- | --- |
| Phase 1: Foundation | Complete | `docs/superpowers/specs/2026-07-30-app-foundation-design.md` | `docs/superpowers/plans/2026-07-30-app-foundation.md` | Complete after validation |
| Phase 2: Company Operating Core | Complete | `docs/superpowers/specs/2026-08-04-code-structure-refactor-design.md` | `docs/superpowers/plans/2026-08-04-api-clean-architecture-refactor.md` | Complete after single-company validation |
| Phase 3: Commerce Product Foundation | Ready for implementation | `docs/superpowers/specs/2026-08-05-commerce-product-foundation-design.md` | `docs/superpowers/plans/2026-08-05-commerce-product-foundation.md` | Pending implementation and exit gate |
| Phase 4: Inventory and Product Publication | Not started | Master design only | Not created | Not decided |
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

## Open Risks

- Real SSO login flow is not implemented.
- Product catalog, commerce persistence, and public storefront are not
  implemented.
- SePay production requires a hosted public HTTPS endpoint and production
  merchant credentials; local development uses sandbox.
- Shipping, refunds, returns, and electronic invoices are outside the current
  roadmap.
- Workflow, agent runtime, and GraphRAG are deferred until commerce Phase 8 is
  complete.
