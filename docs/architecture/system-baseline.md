<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# System Baseline

## Functional Layers

OpenDX CompanyOS has six functional layers:

- Commerce Experience Layer: public storefront and staff console.
- Commerce Core: catalog, inventory, customer, cart, promotion, checkout, order,
  payment, CRM, support, and reporting.
- Identity Plane.
- Company Operating Core.
- Audit and Governance.
- Future Intelligence Layer: workflow, agents, and GraphRAG after commerce.

## MVP Deployment

- Frontends: React + TypeScript with Vite for `apps/storefront` and
  `apps/console`.
- Backend: Express + TypeScript modular monolith.
- Identity provider: Keycloak.
- Operational database: PostgreSQL.
- Object storage: MinIO.
- AI service: Python.
- Observability: structured logs, OpenTelemetry, metrics.
- Deployment: Docker Compose.
- Payments: SePay Payment Gateway, sandbox locally and production on hosted
  HTTPS.

Temporal, pgvector, graph projection storage, and Python AI capabilities remain
available architecture directions but do not block the commerce foundation.

## Single-Company Boundary

One deployment operates one configured company. The Company Operating Core
does not use Company IDs, company selectors, multi-company repositories, or
tenant-scoped routes. Identity and policy checks still restrict access by
department, role, resource, action, data classification, workflow context, and
risk level.

## Backend Modules

- Existing: PostgreSQL-backed Company Operating Core and Catalog.
- Commerce roadmap: Identity, Inventory, Customer, Cart, Promotion,
  Checkout, Order, Payment, CRM, Support, Reporting, and Audit.
- Post-commerce: Workflow, Agent, Skill, Policy, Graph, and Integration.

## Core Entity Families

- Company, Department, Position, User, HumanEmployee, DigitalEmployee.
- Role, Permission, Policy.
- Goal, KPI, Task, Decision.
- Product, Category, ProductVariant, SKU, ProductMedia, Price.
- InventoryItem, InventoryReservation, StockMovement.
- CustomerProfile, CustomerAccount, GuestIdentity, CustomerAddress.
- Cart, CartItem, CheckoutSession, Promotion, PromotionRedemption.
- Order, OrderLine, Payment, PaymentAttempt, PaymentEvent,
  PaymentReconciliation.
- CustomerNote, CustomerSegment, FollowUpTask, InteractionEvent, SupportTicket.
- BusinessEvent, ApprovalRequest, AuditEvent, Notification.

## Durable Workflow Boundary

Temporal is reserved for the post-commerce workflow roadmap. Commerce payment,
inventory, and order correctness is implemented first through PostgreSQL
transactions, idempotency, state machines, reconciliation, and an outbox where
asynchronous processing is required.

## GraphRAG Boundary

GraphRAG is post-commerce. PostgreSQL commerce records remain source of truth;
future graph projections and model context may only derive from authorized,
provenance-bearing records.

## Commerce Boundaries

- One B2C store, physical goods, one inventory location, and VND only.
- Guest checkout plus optional customer accounts.
- Keycloak authenticates staff; customer authentication remains in Commerce.
- No shipping-provider integration, refunds, returns, or electronic invoices.
- Browser redirects never prove payment; authenticated SePay IPN or successful
  reconciliation is required.

## Implemented Runtime Topology

The local Commerce Product Foundation runs PostgreSQL 18, Keycloak, MinIO, an
Express API, and the React console through Docker Compose. One-shot jobs apply
Catalog then Company Core migrations, bootstrap MinIO, and seed Company Core
then Catalog before API readiness can succeed. Production composition uses
PostgreSQL repositories only and has no in-memory Company Core fallback.
