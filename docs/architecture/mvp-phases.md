<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# MVP Phases

## Phase 1: Foundation

Repository, Docker Compose, PostgreSQL, Keycloak, Company model, Department, Human User, RBAC, and Audit.

## Phase 2: Company Operating Core

Organization Graph, Goal, KPI, Task, Event, Decision, and Approval.

## Phase 3: Commerce Data Foundation

Commerce data foundation: PostgreSQL persistence, migrations, API conventions,
Money and pagination primitives, audit persistence, staff OIDC, and test
infrastructure.

## Phase 4: Catalog and Inventory

Catalog, categories, variants, SKU, media, VND pricing, publication, one-location
inventory, stock movements, reservations, and staff workspaces.

## Phase 5: Storefront, Customer, and Cart

Public storefront, discovery, product detail, guest identity, optional customer
accounts, CRM profile baseline, address book, and cart.

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

## Post-Commerce

Workflow/iPaaS, Digital Employees, Skill and Tool registries, GraphRAG, company
memory, and AI-assisted operations receive a new master design after Phase 8.
