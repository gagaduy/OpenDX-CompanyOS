<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# MVP Status

## Current Phase

Phase 5 Storefront, Customer, and Cart is complete and merged into `develop`.
Phase 6 Checkout, Order, and SePay is complete and merged into `develop`.
Backend checkout, immutable
orders, SePay payment processing, expiry, reconciliation, customer Storefront
journey, staff Console operations, deterministic fixtures, container lifecycle,
operational documentation, independent review, deterministic exit gates, and
real SePay sandbox acceptance all pass.

Phase 7 Operational CRM, Support, and Dashboard is complete on `phuong` after
focused API, PostgreSQL/MinIO/ClamAV, browser, lifecycle, full-source, Compose,
and documentation exit evidence.

Phase 8 Production Hardening and Hosting Readiness is complete on `phuong`
after exit preflight, root source validation, local commerce acceptance, and an
explicit decision not to run real production SePay acceptance without real
merchant/VPS prerequisites and human confirmation.

Active commerce master plan:
`docs/superpowers/plans/2026-08-04-novacommerce-commerce-platform.md`.

The Post-Commerce Agentic Workforce master design and plan are approved. Phase
A governance and Phase B durable Store Health workflow are complete. Phase C
implementation, exit gates, independent review, and atomic closure commit are
complete on `feat/agentic-department-read-tools`. Phases D-E are complete on
`develop`; Phase F Slice 1 is complete on `feat/ai-ceo-coordination` and has
been integrated directly into `feat/console-digital-workforce`. Phase G is
complete on that branch after its focused API, PostgreSQL, Console, replay,
responsive browser, authorization, audit, and source gates. Phase H remains
unstarted:
`docs/superpowers/specs/2026-08-14-post-commerce-agentic-workforce-design.md`
and
`docs/superpowers/plans/2026-08-14-post-commerce-agentic-workforce.md`.

## Phase Status

| Phase | Status | Active Spec | Active Plan | Exit Decision |
| --- | --- | --- | --- | --- |
| Phase 1: Foundation | Complete | `docs/superpowers/specs/2026-07-30-app-foundation-design.md` | `docs/superpowers/plans/2026-07-30-app-foundation.md` | Complete after validation |
| Phase 2: Company Operating Core | Complete | `docs/superpowers/specs/2026-08-04-code-structure-refactor-design.md` | `docs/superpowers/plans/2026-08-04-api-clean-architecture-refactor.md` | Complete after single-company validation |
| Phase 3: Commerce Product Foundation | Complete | `docs/superpowers/specs/2026-08-05-commerce-product-foundation-design.md` | `docs/superpowers/plans/2026-08-05-commerce-product-foundation.md` | Complete after full validation |
| Phase 4: Inventory and Product Publication | Complete | `docs/superpowers/specs/2026-08-05-inventory-product-publication-design.md` | `docs/superpowers/plans/2026-08-05-inventory-product-publication.md` | Complete after oversell, publication, public-read, Docker, and full validation |
| Phase 5: Storefront, Customer, and Cart | Complete | `docs/superpowers/specs/2026-08-05-storefront-customer-cart-design.md` | `docs/superpowers/plans/2026-08-05-storefront-customer-cart.md` | Complete after real Google login, full validation, independent review, and PR merge |
| Phase 6: Checkout, Order, and SePay | Complete; merged into `develop` | `docs/superpowers/specs/2026-08-06-checkout-order-sepay-design.md` | `docs/superpowers/plans/2026-08-06-checkout-order-sepay.md` | Complete after deterministic gates, independent review, and real sandbox acceptance |
| Phase 7: Operational CRM, Support, and Dashboard | Complete on `phuong` | `docs/superpowers/specs/2026-08-10-crm-support-dashboard-design.md` | `docs/superpowers/plans/2026-08-10-crm-support-dashboard.md` | Complete after focused API, PostgreSQL/MinIO/ClamAV, browser, lifecycle, full-source, Compose, and documentation exit evidence |
| Phase 8: Production Hardening and Hosting Readiness | Complete on `phuong` | `docs/superpowers/specs/2026-08-10-commerce-hardening-hosting-design.md` | `docs/superpowers/plans/2026-08-10-commerce-hardening-hosting.md` | Complete after `pnpm check:phase8-exit`, root `pnpm check`, local commerce acceptance, and recorded production SePay decision |
| Post-Commerce: Agentic Workforce | Phases A-G complete on their recorded delivery branches | `docs/superpowers/specs/2026-08-14-post-commerce-agentic-workforce-design.md` | `docs/superpowers/plans/2026-08-14-post-commerce-agentic-workforce.md` | Phase G completes the governed Digital Workforce Console over the directly integrated Phase F base; schedules, Company Memory, GraphRAG, and Phase H remain deferred |

Focused Agentic delivery status:

| Phase | Status | Focused Spec | Focused Plan | Exit Decision |
| --- | --- | --- | --- | --- |
| Phase A: Agent Governance Foundation | Complete on `phuong` | `docs/superpowers/specs/2026-08-14-agent-governance-foundation-design.md` | `docs/superpowers/plans/2026-08-14-agent-governance-foundation.md` | Complete after focused unit, PostgreSQL concurrency, migration lifecycle, API, identity, and repository gates |
| Phase B: Durable Store Health Workflow | Complete on `feat/store-health-temporal` | `docs/superpowers/specs/2026-08-14-store-health-temporal-workflow-design.md` | `docs/superpowers/plans/2026-08-14-store-health-temporal-workflow.md` | Complete after unit/integration/replay, worker-kill lifecycle, production topology, and three-database destroy/restore/resume gates |
| Phase C: Read-only Department Tools | Complete on `feat/agentic-department-read-tools` | `docs/superpowers/specs/2026-08-16-agentic-department-read-tools-design.md` | `docs/superpowers/plans/2026-08-16-agentic-department-read-tools.md` | Complete after 17-tool six-identity acceptance, exact analytics grants, zero-leakage, lifecycle, recovery, full-source gates, and independent review |
| Phase D: OpenRouter Agent Runtime | Complete on `develop` | `docs/superpowers/specs/2026-08-19-openrouter-agent-runtime-design.md` | `docs/superpowers/plans/2026-08-19-openrouter-agent-runtime.md` | Complete after credential-owned Catalog live acceptance |
| Phase E: File Intake and Bulk Preview | Complete on `develop` | `docs/superpowers/specs/2026-08-22-agentic-file-intake-design.md` | `docs/superpowers/plans/2026-08-22-agentic-file-intake.md` | Complete after controlled ClamAV infected/outage, authenticated CSV/TXT intake, exactly-once approval, and source gates |
| Phase F: AI CEO Coordination | Slice 1 complete on `feat/ai-ceo-coordination` | `docs/superpowers/specs/2026-08-22-ai-ceo-coordination-memory-design.md` | `docs/superpowers/plans/2026-08-22-ai-ceo-orchestration.md` | Slice 1 complete after six-Department descriptor DAG, private API settlement, isolated execution identities, cancellation/replay/restart evidence, and zero Commerce mutation; schedules and Company Memory remain deferred |
| Phase G: Console Digital Workforce | Complete on `feat/console-digital-workforce` | `docs/superpowers/specs/2026-08-25-console-digital-workforce-design.md` | `docs/superpowers/plans/2026-08-25-console-digital-workforce.md` | Complete after actor-bound intake replay, task/approval/employee/audit surfaces, 358 focused API tests, 61 PostgreSQL integration tests, 135 Console tests, Phase F restart/replay acceptance, 390/768/1440 browser acceptance, role denial, repository audit, and zero Company Memory, chat, schedules, GraphRAG, or Commerce mutation |

Phase F Slice 1 is complete: governed AI CEO planning, six descriptor-bound
Department analyses, mediated collaboration, provenance-only synthesis,
replay-safe Temporal dispatch, and isolated execution identities pass their
deterministic gates. It is integrated directly into the Phase G feature branch
while remaining unmerged in `develop`. Phase G is complete on its feature
branch; schedules, Company Memory, GraphRAG, and Phase H remain explicitly
deferred.

## Latest Validation Evidence

- Phase G closure evidence on 2026-08-25: `pnpm
  check:agentic-phase-g-exit` passed 358 focused Agentic API tests, 61 isolated
  PostgreSQL integration tests, 135 Console tests, the Console production
  build, Phase F static orchestration and hard-stopped-worker restart/replay
  acceptance, repository audit, and `git diff --check`. Headless Chrome passed
  every approved Digital Workforce route at 390x844, 768x1024, and 1440x900,
  including six Department branches, an honest partial report, task/file
  replay, one approval decision, workflow-replay provenance, keyboard focus,
  responsive overflow checks, and a Commerce-only role denied before any
  Agentic API call. Redacted evidence contains route, role, dimension, heading,
  and boolean results only.

- Phase F Slice 1 closure evidence on 2026-08-25: all five unchanged Phase B
  histories and a new descriptor history replay; planning, dispatch,
  Department, and synthesis cancellation drain; six fake Department branches
  converge after a test worker process is hard-stopped after committed side
  effects, then a replacement worker completes the same history with one collaboration/report and
  no duplicate tool, model, result, or report effects. The topology gate
  verifies one AI CEO plus six distinct worker-only execution credentials and
  zero Commerce mutation.

- Phase E closure evidence on 2026-08-22: local PostgreSQL migrations applied;
  authenticated governance-admin acceptance uploaded clean CSV/TXT, produced
  private bounded previews, and replayed each exact approval into one `draft`
  task. Unsupported, NUL-invalid, and oversized uploads rejected. A canonical
  EICAR preview returned `400 FILE_CONTENT_INVALID` without crashing the API;
  a controlled stopped ClamAV returned `503 FILE_SCAN_FAILED`, after which
  ClamAV was restored healthy. `pnpm check:agentic-phase-e-exit` then passed
  with controlled ClamAV evidence, as did root `pnpm check`, `git diff --check`,
  and `pnpm audit:repo` (748 API, 113 Console, and 74 Storefront tests).

- Phase D closure evidence on 2026-08-22: `pnpm check:agentic-phase-d-exit`
  passed, and the credential-owned Catalog live acceptance completed with 671
  input tokens, 989 output tokens, a settled cost of 2,146 micros, and three
  audit/provenance records. The governed task cap remained 100,000 micros.

- Phase C pre-commit closure evidence on 2026-08-19 includes 206 passing API
  integration tests across 54 files, 588 API unit tests, 113 Console tests, 74
  Storefront tests, and 102 Python tests. Production/Agentic Compose,
  backup/restore, six-identity 17-tool acceptance, worker/service/database
  restart, three-database recovery/replay, repository audit, and the static
  Phase C exit gate all pass. Independent re-review reports no Critical or
  Important findings, and the atomic closure commit is recorded on the branch.

- The Post-Commerce Agentic Workforce design defines rule-first AI CEO
  delegation, six read-only Department Agents, Temporal orchestration,
  OpenRouter model governance, Tool Registry mediation, file-preview approval,
  Quality Gate, scoped memory, and a Store Health Review acceptance workflow.
- Its master plan sequences Agent Governance, Temporal workflow, read-only
  department tools, OpenRouter runtime, file intake, AI CEO coordination,
  Console surfaces, and deterministic acceptance behind focused phase gates.
- Phase A adds PostgreSQL governance and a staff administration API. Phase B
  adds Temporal execution with bounded fake activities only; it deliberately
  does not add OpenRouter, file intake, Commerce tool adapters, or an Agentic UI.
- Phase A defines four human Agentic roles, seven distinct Keycloak service
  identities, owner-admin versioned configuration governance, deterministic deny-first policy,
  task/configuration pinning, emergency revocation, Tool Registry authorization,
  budget accounting, bound approvals, and append-only audit/provenance without
  starting runtime execution.
- Its focused implementation plan defines eight TDD tasks covering identity,
  domain rules, PostgreSQL governance, policy/tools/budgets, workflow-action
  approvals, non-executing tasks, staff APIs, composition, and phase-exit gates.
- Phase B closure evidence on 2026-08-16 includes successful
  the complete command sequence below. The host has Python 3.12, so the
  documented pinned Python 3.13.12 checks image supplied `python3`; the Vitest
  worker limit avoids this machine's 5-second UI-test contention.

  ```bash
  pnpm install --frozen-lockfile
  pnpm audit:repo
  pnpm audit:env
  pnpm audit:secrets
  pnpm lint
  pnpm typecheck
  VITEST_MAX_WORKERS=1 pnpm test
  docker build --target checks -t opendx-ai-runtime-checks -f services/ai-runtime/Dockerfile .
  PATH=/tmp/opendx-python313:$PATH pnpm test:py
  pnpm check:production-compose
  pnpm check:agentic-production-compose
  pnpm check:agentic-workflow
  pnpm check:backup-restore
  pnpm check:agentic-workflow-recovery
  pnpm check:agentic-phase-b-exit
  PATH=/tmp/opendx-python313:$PATH VITEST_MAX_WORKERS=1 pnpm check
  git diff --check
  git status --short
  ```

  These gates passed all 535 API, 113 Console, 74 Storefront, and 102 Python
  tests plus both frontend production builds. The lifecycle gate
  SIGKILLed/recreated the worker during a reserved invocation. The recovery gate
  destroyed/restored suffixed `opendx`, `temporal`, and
  `temporal_visibility` databases, resumed the waiting run exactly once, and
  replayed the exported history against current workflow code.
- Phase B relevant pins: Node `22.22.0`, Python `3.13.12`, PostgreSQL `18.3`,
  Keycloak `26.4.2`, Temporal Server/admin-tools `1.31.2`, Temporal Python SDK
  `1.30.0`, Caddy `2.10.2`, MinIO `RELEASE.2025-04-22T22-12-26Z`, and ClamAV
  `1.5.3`; container images are digest-pinned in the Compose/Dockerfiles.

- Phase 8 focused design:
  `docs/superpowers/specs/2026-08-10-commerce-hardening-hosting-design.md`.
- Phase 8 implementation plan:
  `docs/superpowers/plans/2026-08-10-commerce-hardening-hosting.md`.
- Phase 8 commit range on `phuong`: `2d093e1..e1676d6`, plus final closure
  evidence commit.
- Phase 8 preflight evidence on 2026-08-10: `pnpm check:phase8-exit` passed
  with production Compose, authorization matrix, SePay production guard tests,
  backup/restore safety, browser accessibility, performance, env/secret audits,
  repository audit, and `git diff --check`; root `pnpm check` also passed.
- Phase 8 local commerce acceptance on 2026-08-10:
  `POSTGRES_PORT=55432 pnpm check:commerce-exit` passed and wrote evidence to
  `/tmp/opendx-commerce-exit/deterministic.json`.
- Production SePay real-money acceptance was not run: no real VPS/domain,
  merchant production credentials, and explicit human confirmation were
  provided. The opt-in guard test `pnpm test:sepay-production-acceptance`
  passed and remains outside default CI/exit gates.
- Phase 7 focused design is complete for least-privilege CRM, staff-created
  support tickets, continuous SLA, private ClamAV-scanned attachments,
  deterministic customer segments, aggregate PostgreSQL-backed reporting, and
  Customer/Support/Dashboard Console workspaces. Exit evidence includes
  `make check-crm-support-dashboard`, `pnpm check:crm-support-dashboard-browser`,
  `pnpm check:crm-support-dashboard-lifecycle`, root `pnpm check`, and fresh
  `make down && make up`.
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
- Phase 5 customer-facing visual acceptance was expanded with an editorial
  Storefront redesign, persistent light/dark themes, customer sign-in, account,
  address, cart, catalog, and product-detail surfaces. Full `make check` passed,
  the real Google-backed account journey was exercised, and pull request #4 was
  merged into `develop` on 2026-08-06.
- Phase 6 focused design and its 13-task file-level TDD plan were drafted on
  2026-08-06 after checking the current official SePay sandbox, checkout
  signing, IPN authentication, and order-detail reconciliation contracts.
- Phase 6 implementation through Task 9 adds constrained Promotion, Checkout,
  immutable Order, Payment attempt/event/reconciliation persistence; atomic
  Inventory and Promotion transitions; server-signed SePay initiation;
  authenticated exactly-once IPN processing; bounded checkout expiry; and
  automatic/manual reconciliation. API source gates passed 265 unit tests and
  63 PostgreSQL/MinIO integration tests before Storefront work began.
- Phase 6 Storefront Task 10 adds address and promotion checkout input,
  immutable review totals, ordered provider form submission, bounded backend
  payment-state polling, and customer order list/detail timelines. On
  2026-08-09, 27 Storefront tests, strict typecheck, production build, and
  Chrome acceptance passed. Checkout and order surfaces rendered in light and
  dark modes without horizontal overflow at 390x844, 768x1024, and 1440x900;
  the same run retained real seeded-product catalog and guest-cart checks.
- Phase 6 Console Task 11 adds role-aware Order and Payment workspaces, legal
  optimistic order transitions, redacted payment-event evidence, and manual
  reconciliation review. Console tests, strict typecheck, production build,
  and Chrome acceptance cover administrator, Operations, Finance, denied staff,
  loading/error/empty/stale/success states, visible focus, and no horizontal
  overflow at 390x844 and 1440x900.
- Phase 6 Task 12 adds repeatable active/inactive Promotion fixtures, separate
  Checkout worker timing, health-waiting full-container startup, complete
  Checkout/Order/Payment/Promotion and SePay operations documentation, and a
  true all-module rollback. Disposable-database acceptance proved clean
  migrate, repeated seed, custom backup/restore, complete rollback, reapply,
  and seed without modifying contributor runtime data.
- Phase 6 Task 13 deterministic acceptance runs 20 checkouts against ten units,
  proves exact-once paid effects under 20 IPN replays, converges IPN,
  reconciliation, and expiry races, rejects amount/ownership/auth/role failures,
  restores one paid order from a custom archive, and fully rolls migrations down
  and up on disposable databases. It also found and fixed Customer rollback of
  audit rows that the older actor constraint cannot represent. Real sandbox
  evidence remains intentionally open.
- Phase 6 independent review reported no Critical findings and six Important
  findings. Regression fixes now coordinate cancellation across all checkout
  resources, enforce one checkout per cart snapshot, preserve post-checkout cart
  mutations, validate SePay transaction money evidence, persist truthful
  reconciliation outcomes, and use overflow-safe VND arithmetic. Repeated
  disposable-database acceptance also verified a consistent financial lock
  order without deadlock. Two Minor provider-event persistence refinements are
  deferred to Phase 8 and documented in the focused Phase 6 plan.
- Phase 6 real-provider acceptance on 2026-08-09 used contributor-owned SePay
  sandbox credentials and a temporary public HTTPS callback. A 1,290,000 VND
  checkout received one authenticated IPN event, transitioned to `paid`, and
  retained `paid` after one reconciliation. The opt-in runner returned
  `passed`; no credentials, customer data, provider payloads, or temporary URL
  were persisted in repository evidence.

## Open Risks

- Real Google login acceptance requires a contributor-owned OAuth client ID and
  is intentionally unavailable in credential-free CI; all verifier and local
  session behavior remains deterministically tested at the real application port.
- SePay production requires a hosted public HTTPS endpoint and production
  merchant credentials; local development uses sandbox.
- SePay production still requires hosted public HTTPS endpoints, production
  credentials, operational monitoring, and the Phase 8 go-live review.
- Shipping, refunds, returns, and electronic invoices are outside the current
  roadmap.
- Workflow and agent runtime remain unimplemented while Phase A is ready for
  its approved TDD implementation. GraphRAG remains deferred to a later focused
  phase.
