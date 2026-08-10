<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# MVP Phases

## Phase 1: Foundation

Repository, Docker Compose, PostgreSQL, Keycloak, Company model, Department, Human User, RBAC, and Audit.

## Phase 2: Company Operating Core

Organization Graph, Goal, KPI, Task, Event, Decision, and Approval.

## Phase 3: Commerce Product Foundation

Full-container local environment, PostgreSQL persistence and migrations, staff
OIDC, API conventions, root Makefile, general-merchandise catalog, variants,
SKU, VND prices, MinIO media, audit, and Catalog staff workspace.

## Phase 4: Inventory and Product Publication

One-location inventory, stock movements, reservations, product publication,
public product read contracts, and Inventory staff workspace.

## Phase 5: Storefront, Customer, and Cart

Public storefront, discovery, product detail, seven-day guest identity and cart,
Google customer accounts, CRM profile baseline, address book, and an
authenticated checkout gate.

## Phase 6: Checkout, Order, and SePay

Promotion rules, checkout snapshots, order state machine, transactional
inventory reservation, SePay sandbox checkout, authenticated IPN, payment
reconciliation, and order operations.

## Phase 7: Operational CRM, Support, and Dashboard

Customer 360, segments, notes, follow-up tasks, support tickets, interaction
timeline, reporting read models, and commerce dashboard.

## Phase 8: Production Hardening and Hosting Readiness

Security and authorization tests, payment idempotency, inventory concurrency,
backup/restore, observability, accessibility, performance, deterministic
seed/reset, production SePay readiness, and hosted HTTPS documentation.

Phase 8 is the current active phase until `pnpm check:phase8-exit`, root
`pnpm check`, local commerce acceptance, and the production SePay acceptance
decision are recorded.

## Post-Commerce

Workflow/iPaaS, Digital Employees, Skill and Tool registries, GraphRAG, company
memory, and AI-assisted operations receive a new master design after Phase 8.
