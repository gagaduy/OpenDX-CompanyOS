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
- Intelligence Layer: governed Agent control and durable workflow execution;
  model-backed tools and GraphRAG remain later phases.

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

Temporal 1.31.2 and the Python Temporal SDK 1.30.0 provide the isolated durable
workflow runtime. Phase C adds 17 fixed, typed, read-only Department tools
behind six service identities, public Commerce read ports, and three restricted
Reporting views. pgvector, graph projection storage, model
providers, and GraphRAG remain future directions and do not alter Commerce
truth.

## Single-Company Boundary

One deployment operates one configured company. The Company Operating Core
does not use Company IDs, company selectors, multi-company repositories, or
tenant-scoped routes. Identity and policy checks still restrict access by
department, role, resource, action, data classification, workflow context, and
risk level.

## Backend Modules

- Existing: PostgreSQL-backed Company Operating Core, Catalog, Inventory,
  Customer, Cart, Promotion, Checkout, Order, and Payment.
- Commerce roadmap: CRM, Support, Reporting, and broader Audit surfaces.
- Post-commerce: Agent governance, the first durable workflow, and bounded
  Department Commerce reads are implemented; Skills, model execution, Graph, and broad
  Integration remain later phases.

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

Phase A implements the Agent governance control plane in PostgreSQL: seven
service identities, non-executing tasks, immutable configuration revisions,
deny-first policy, tool descriptors/grants, budgets, approvals, revocations,
audit, and provenance.

Phase B adds the versioned `StoreHealthReviewWorkflowV1`, Temporal persistence,
an authenticated AI Runtime gateway, a separately authenticated worker, safe
PostgreSQL projections, approval/cancellation signals, replay, metrics, and a
three-database recovery set. See
[`agentic-workflow-runtime.md`](agentic-workflow-runtime.md). It uses bounded
  fake activities and no model provider or Commerce tool.

Phase C adds 17 immutable version-one Tool Registry descriptors and six
separate Department Agent client-credentials identities. The API recalculates
identity, task, revision, grant, policy, revocation, quota, schema, freshness,
size, idempotency, audit, and provenance before returning bounded results.
Adapters import owner contracts only through public module APIs. Analytics use
an isolated pool whose role can select exactly three approved Reporting views.
Commerce truth remains read-only and the Temporal workflow still has no model
or real Department-analysis activity.

Commerce payment, inventory, and order correctness remains independent and is
enforced through PostgreSQL transactions, idempotency, state machines,
reconciliation, and an outbox where asynchronous processing is required.

## GraphRAG Boundary

GraphRAG is post-commerce. PostgreSQL commerce records remain source of truth;
future graph projections and model context may only derive from authorized,
provenance-bearing records.

## Commerce Boundaries

- One B2C store, physical goods, one inventory location, and VND only.
- Guest discovery and cart plus Google customer accounts required for checkout.
- Keycloak authenticates staff; customer authentication remains in Commerce.
- No shipping-provider integration, refunds, returns, or electronic invoices.
- Browser redirects never prove payment; authenticated SePay IPN or successful
  reconciliation is required.

## Implemented Runtime Topology

The local runtime runs PostgreSQL 18, Keycloak, MinIO, Temporal, the FastAPI AI
Runtime and Temporal worker, an Express API, React Console, and React Storefront
through Docker Compose. One-shot jobs apply
Catalog, Company Core, Inventory, Customer, Cart, Promotion, Checkout, Order,
then Payment migrations, bootstrap MinIO, and seed Company Core, Catalog,
Inventory, then Promotion before API readiness can succeed.
Production composition uses PostgreSQL repositories only and has no in-memory
fallback.

Catalog owns publication rules and depends inward on the public
`InventoryAvailabilityReader` port; the Inventory module does not import
Catalog internals. Anonymous `/v1/storefront` reads pass through public Catalog
DTOs, include live Inventory availability, and authorize media only for
published products. Customer identity remains separate from staff Keycloak;
opaque Commerce sessions, owned profiles/addresses, and backend-authoritative
guest/customer carts feed transactional Checkout. Immutable Order and Payment
state converge through authenticated SePay IPN, bounded reconciliation, expiry,
idempotency, and optimistic versioning. External SePay availability is not a
local readiness dependency.
