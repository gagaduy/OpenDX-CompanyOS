<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# MVP Status

## Current Phase

Phase 4 Inventory and Product Publication is complete. Phase 5 Storefront,
Customer, and Cart implementation plus credential-free acceptance are complete.
The only remaining acceptance dependency is a contributor-owned Google OAuth
client for one real login cycle before the pull request is merged.

Active commerce master plan:
`docs/superpowers/plans/2026-08-04-novacommerce-commerce-platform.md`.

## Phase Status

| Phase | Status | Active Spec | Active Plan | Exit Decision |
| --- | --- | --- | --- | --- |
| Phase 1: Foundation | Complete | `docs/superpowers/specs/2026-07-30-app-foundation-design.md` | `docs/superpowers/plans/2026-07-30-app-foundation.md` | Complete after validation |
| Phase 2: Company Operating Core | Complete | `docs/superpowers/specs/2026-08-04-code-structure-refactor-design.md` | `docs/superpowers/plans/2026-08-04-api-clean-architecture-refactor.md` | Complete after single-company validation |
| Phase 3: Commerce Product Foundation | Complete | `docs/superpowers/specs/2026-08-05-commerce-product-foundation-design.md` | `docs/superpowers/plans/2026-08-05-commerce-product-foundation.md` | Complete after full validation |
| Phase 4: Inventory and Product Publication | Complete | `docs/superpowers/specs/2026-08-05-inventory-product-publication-design.md` | `docs/superpowers/plans/2026-08-05-inventory-product-publication.md` | Complete after oversell, publication, public-read, Docker, and full validation |
| Phase 5: Storefront, Customer, and Cart | External acceptance | `docs/superpowers/specs/2026-08-05-storefront-customer-cart-design.md` | `docs/superpowers/plans/2026-08-05-storefront-customer-cart.md` | Pending real Google login and PR merge |
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
  validation completed on 2026-08-05.
- Phase 4 source/container gates: 138 API unit tests, 41 console tests, four
  shared-package tests, one Python test, and 36 PostgreSQL/MinIO integration
  tests passed. Console production build, repository audit, Compose config,
  `pnpm check`, and `POSTGRES_PORT=55433 make check` passed.
- Reservation concurrency launched 20 one-unit requests against 10 available
  units: exactly 10 committed, 10 rejected, balance ended at 10 reserved, and
  exactly 10 reservation movements existed. Concurrent same-reference retries
  converged once; conflicting lines were rejected; racing expiry workers and a
  batch boundary finalized each reservation group exactly once. Late consume
  returned `RESERVATION_EXPIRED`.
- Full-container acceptance reported healthy PostgreSQL, Keycloak, MinIO, API,
  and console. The deterministic runtime contained six categories, twelve
  technology products, ten published products, 24 Inventory items, four
  sold-out variants, and five active fixture reservations.
- Real HTTP/OIDC acceptance returned 200 for Inventory reads, readiness,
  publication, anonymous published reads, movement history, health, console,
  receipt and adjustment operations; unauthorized cross-role mutations returned
  403 `FORBIDDEN`; unpublished public detail returned 404
  `PRODUCT_NOT_PUBLISHED`. Receipt retry was idempotent, and restock changed a
  sold-out variant from non-purchasable to purchasable without republishing.
- Chrome OIDC acceptance routed the Inventory Manager to `/inventory`, rendered
  20 stock rows and authorized receipt/adjustment controls, and had no document
  overflow at 1440×900 or 390×844. PostgreSQL custom backup/restore changed an
  observed `on_hand` value from 0 to 7 and restored it to 0 in
  `infra/backups/opendx-20260805-174545.dump`.
- Independent review of `125e987..2492548` found no Critical issues. Five
  Important findings covering reservation-group concurrency, late expiry,
  expiry batching, stock-filter pagination, and module imports were reproduced,
  fixed with tests, and verified through commit `283b94c`.
- Phase 5 focused design approved for a catalog-first technology storefront,
  seven-day guest cart, Google customer registration, 30-day Commerce-owned
  sessions, explicit cart resolution, address ownership, and an authenticated
  checkout gate.
- Phase 5 file-level implementation plan defines eleven ordered TDD units for
  the Storefront scaffold, Customer/Cart schemas, secure sessions, authoritative
  cart behavior, customer UI, Docker, documentation, and exit acceptance.
- Phase 5 implementation adds the React Storefront, URL-backed Catalog filters,
  product detail, opaque guest/customer sessions, Google verification,
  profiles/addresses, PostgreSQL carts, explicit resolution, and a customer-only
  checkout-readiness contract.
- Phase 5 source gates on 2026-08-06 passed 166 API unit tests, 52 API
  PostgreSQL/MinIO integration tests across 24 files, 41 Console tests, 13
  Storefront tests, four shared-package tests, one Python test, strict
  TypeScript checks, both frontend production builds, repository audit,
  `git diff --check`, and Compose validation.
- Full-container acceptance reported healthy PostgreSQL, Keycloak, MinIO, API,
  Console, and Storefront. A guest cart retained the same cart ID, two-item
  quantity, and 65,980,000 VND total across `make down`/`make up`. An atomic
  custom-format restore stopped application writes and restored a probe from 2
  to 1 using `infra/backups/opendx-20260806-003458.dump`.
- Browser acceptance at 390x844, 768x1024, and 1440x900 rendered ten seeded
  products with complete 1254x1254 images, semantic `main`, visible keyboard
  focus, and no horizontal overflow. The same Chrome run created a real guest,
  injected and migrated a legacy CSRF path cookie, added one available product,
  displayed the success state, and updated the cart counter to one. Evidence is
  reproducible with `pnpm check:storefront-browser`.
- Independent review found seven Important issues in CORS isolation,
  idempotency concurrency/retry, invalid-cookie fallback, cart media URLs,
  environment validation, restore safety, and failed-login compensation. All
  were fixed with regression coverage; re-review found no remaining Critical or
  Important Phase 5 findings.

## Open Risks

- Real Google login acceptance requires a contributor-owned OAuth client ID and
  is intentionally unavailable in credential-free CI; all verifier and local
  session behavior remains deterministically tested at the real application port.
- SePay production requires a hosted public HTTPS endpoint and production
  merchant credentials; local development uses sandbox.
- Shipping, refunds, returns, and electronic invoices are outside the current
  roadmap.
- Workflow, agent runtime, and GraphRAG are deferred until commerce Phase 8 is
  complete.
