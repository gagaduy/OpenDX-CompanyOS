<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Product Vision

## Product Statement

DX-OS is the open-source operating platform for NovaCommerce, a B2C
single-store commerce business. It combines a public storefront, commerce
operations, customer relationships, staff governance, and later digital
workforce capabilities in one system.

## Core Formula

```text
NovaCommerce Company Core
+ Storefront
+ Catalog and Inventory
+ Customer and Cart
+ Checkout, Order, and SePay
+ Operational CRM and Support
+ Commerce Dashboard
+ Staff Identity and Governance
= DX-OS Commerce Foundation

DX-OS Commerce Foundation
+ Workflow and Digital Employees
+ GraphRAG and Company Memory
= Future Intelligent CompanyOS
```

## Product Positioning

DX-OS first owns NovaCommerce's commerce source-of-truth workflows and product
surfaces. Workflow automation, AI agents, and GraphRAG are later operating
capabilities built on top of stable commerce data and contracts.

It is not a chatbot, marketplace, multi-store SaaS, generic workflow builder,
full ERP, full marketing CRM, shipping platform, or autonomous company that
removes human accountability.

## Design Principles

- Company-first.
- Human-governed.
- Process-driven.
- Identity-aware.
- Permission-aware.
- Graph-grounded.
- Model-agnostic.
- Open and extensible.
- Auditable by default.

## MVP Scope

The active MVP is the NovaCommerce Commerce Foundation: two frontend surfaces,
PostgreSQL-backed catalog and one-location inventory, guest discovery and cart,
Google-registered customers, authenticated checkout, orders, SePay payments,
Operational CRM, support, dashboard, staff identity, authorization, and audit.

The implemented boundary now includes public discovery, product detail,
seven-day guest carts, Google-verified customer sessions, customer-owned
profiles and addresses, explicit cart resolution, checkout readiness,
backend-authoritative promotion evaluation, transactional reservation,
immutable orders, signed SePay sandbox initiation, trusted payment convergence,
and role-aware Order/Payment operations. Production payment activation remains
deferred to the active Phase 8 hardening and hosting-readiness work until exit
evidence and a production SePay acceptance decision are recorded.

## Company Model

Each OpenDX CompanyOS deployment operates one configured company. `Company`
remains the product's aggregate root, but no Company ID or company selector is
exposed. Access control is evaluated through actor identity, department, role,
resource, action, data classification, workflow context, and risk.

## MVP Non-Goals

The active MVP will not build marketplace behavior, multiple warehouses,
shipping-provider integration, refunds, returns, electronic invoices,
subscriptions, marketing automation, multiple currencies, mobile apps,
Kubernetes, Workflow Builder, Digital Employee execution, or GraphRAG.

## Acceptance Chain

1. Staff signs in through Keycloak with backoffice permissions.
2. Staff publishes a product and records stock for its SKU.
3. A guest discovers the product and adds it to a cart.
4. Google registration/login establishes a Commerce-owned customer session,
   then checkout validates customer, address, pricing, promotion, and
   availability.
5. PostgreSQL transaction reserves inventory and creates a pending order.
6. Backend initiates a signed SePay checkout.
7. Authenticated SePay IPN confirms the payment exactly once.
8. Order becomes paid and inventory reservation is consumed.
9. CRM receives the customer, order, and interaction timeline.
10. Staff completes internal order processing.
11. Dashboard metrics include the paid order.
12. Audit records every important staff, inventory, payment, and order action.

The complete commerce design and 15-step acceptance chain are defined in
`docs/superpowers/specs/2026-08-04-novacommerce-commerce-platform-design.md`.
