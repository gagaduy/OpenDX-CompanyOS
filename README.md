<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# OpenDX CompanyOS

DX-OS is an open-source, Company-first commerce operating platform for running
NovaCommerce as a B2C single-store business.

## Status

The repository, PostgreSQL-backed Company Operating Core, Catalog, Inventory,
Storefront, Customer, Cart, Promotion, Checkout, immutable Order, SePay Payment,
and staff commerce operations are implemented. Phase 6 real SePay sandbox
acceptance passes. The active roadmap continues with Operational CRM, support,
dashboard, and production hardening.

## What It Is

DX-OS models NovaCommerce's organization and commerce operations in one governed
system. The commerce foundation is delivered before Digital Employees,
workflow automation, and GraphRAG.

Future AI agents will be represented as Digital Employees inside the company.
They will be governed by role, skill, tools, data scope, permissions, policies,
and human approval after the commerce foundation is complete.

## What It Is Not

- Not a chatbot product.
- Not a generic agent persona playground.
- Not a workflow builder without durable execution and governance.
- Not a full ERP, CRM, HRM, payroll, or accounting suite.
- Not a system that lets AI perform risky financial or legal actions without human approval.

## Active Commerce Direction

The active MVP is organized around:

- Company Core.
- Public storefront and staff console.
- Catalog and one-location inventory.
- Guest discovery/cart, Google customer identity, and authenticated checkout.
- Order and SePay Payment Gateway.
- Operational CRM, support, and dashboard.
- Staff identity, authorization, audit, and production hardening.

Shipping-provider integration, refunds, returns, electronic invoices,
marketplace behavior, Digital Employees, and GraphRAG are not part of the
commerce foundation.

## Architecture

See:

- `docs/product/vision.md`
- `docs/superpowers/specs/2026-08-04-novacommerce-commerce-platform-design.md`
- `docs/superpowers/plans/2026-08-04-novacommerce-commerce-platform.md`
- `docs/architecture/system-baseline.md`
- `docs/architecture/mvp-phases.md`
- `docs/design/linear-product-canvas.md`
- `docs/agent-guidelines/implementation-guardrails.md`
- `docs/project-structure.md`
- `docs/dependencies.md`
- `docs/api/company-operating-core.md`
- `docs/api/catalog.md`
- `docs/api/inventory.md`
- `docs/api/storefront-catalog.md`
- `docs/api/checkout.md`
- `docs/api/order.md`
- `docs/api/payment.md`
- `docs/api/promotion.md`
- `docs/integrations/sepay.md`

## Development

OpenDX CompanyOS uses a pnpm workspace for TypeScript apps and packages, plus a Python FastAPI service for AI runtime support.

Full source-build instructions are maintained in `docs/build-from-source.md`.

### Prerequisites

- Node.js 22 or newer
- Corepack
- Python 3.13 or newer
- Docker

### Install

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install
cd services/ai-runtime && python3 -m pip install -e ".[dev]"
```

### Run the Containerized Stack

```bash
make up
```

Open the staff Console at `http://localhost:3000` and Storefront at
`http://localhost:3100`. The stack includes
PostgreSQL, Keycloak, MinIO, ordered migrations, deterministic product,
Inventory, and Promotion seeds, API, Console, and Storefront. `make up` waits
for the complete stack to become healthy. SePay credentials are optional for
normal local startup.

### Run Validation

```bash
make check
pnpm check:commerce-exit
```

The second command creates isolated PostgreSQL databases, validates the
checkout-to-paid concurrency and failure gates, proves paid-order backup and
restore, then removes its databases. Real SePay sandbox acceptance remains
opt-in through `pnpm check:sepay-sandbox`; see `docs/integrations/sepay.md`.

Database operations are exposed through `make db-migrate`, `make db-rollback`,
`make db-seed`, `make db-backup`, and `make db-restore BACKUP=...`. See
`docs/development/database-operations.md` before restore.

For host-based development after infrastructure is available:

```bash
pnpm --filter @opendx/api dev
pnpm --filter @opendx/console dev
pnpm --filter @opendx/storefront dev
```

## Contributing

See `CONTRIBUTING.md`.

## Security

Do not open public issues for vulnerabilities. See `SECURITY.md`.

## License

Apache-2.0. See `LICENSE`.
