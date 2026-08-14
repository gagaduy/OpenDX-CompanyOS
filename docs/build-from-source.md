<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Build From Source

This document records the source-build path for OpenDX CompanyOS. Commands should work from a clean checkout without editing source files for configuration.

## Prerequisites

- Node.js 22 or newer.
- Corepack.
- Python 3.13 or newer.
- Docker with Docker Compose.

## Install Dependencies

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install
cd services/ai-runtime && python3 -m pip install -e ".[dev]"
```

The editable Python install requires Python 3.13 or newer. When the host does
not provide Python 3.13, use the pinned reproducible checks image instead of
lowering the project's Python requirement:

```bash
docker build --target checks -t opendx-ai-runtime-checks \
  -f services/ai-runtime/Dockerfile .
docker run --rm opendx-ai-runtime-checks
```

This installs the published `temporalio==1.30.0` wheel. Building the Temporal
SDK itself from source is an upstream-maintainer workflow requiring Rust,
Protobuf, and `uv`; those tools are not required to build OpenDX CompanyOS.

## Validate From Source

From the repository root:

The reproducible container gate requires Docker, but does not require host
Node.js or Python:

```bash
make check
```

GitHub CI runs source lint, typecheck, TypeScript tests, repo audit, and
production Compose topology validation without deployment secrets. The security
workflow runs environment documentation and committed secret-fixture audits:

Agent governance uses the same source gates and no extra package install. Its
focused PostgreSQL check uses an isolated database:

```bash
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local_password@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts \
  src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts \
  src/modules/agentic/tests/agentic.api.integration.test.ts
```

Use `pnpm --filter @opendx/api db:migrate:agentic` and
`db:rollback:agentic:all` for the isolated migration. The normal `*:all`
commands include Agentic after Support on migrate and before Support on rollback.

```bash
pnpm audit:env
pnpm audit:secrets
```

This runs:

- `git diff --check`
- TypeScript lint gates
- TypeScript typecheck gates
- TypeScript unit and PostgreSQL/MinIO integration tests
- Vite Console and Storefront production builds
- Python tests for `services/ai-runtime`
- Repository governance audit
- Docker Compose config validation
- ClamAV and private Support attachment bucket readiness through the Compose API
  health checks

The faster host gate remains available after installing dependencies:

```bash
pnpm check
```

With the full stack running and Chrome or Chromium installed, repeat the
responsive Storefront browser acceptance with:

```bash
pnpm check:storefront-browser
```

The check uses Chrome DevTools Protocol without an additional package. It
validates seeded image delivery, semantic content, keyboard-visible focus,
dark/light theme switching, and horizontal overflow at 390x844, 768x1024, and
1440x900. Dark and light screenshots are written to
`/tmp/opendx-storefront-browser` by default. Set `CHROME_BIN`,
`STOREFRONT_URL`, or `BROWSER_EVIDENCE_DIR` when local paths differ.

Repeat the responsive Console commerce-operations acceptance with:

```bash
pnpm check:console-browser
```

This check injects a deterministic staff session and redacted API fixtures at
the browser boundary. It covers authentication, Catalog, Inventory, Orders,
Payments, and Company Overview across 390x844, 768x1024, and 1440x900 in both
night and light themes. It verifies visible keyboard focus, responsive
navigation modes, disabled future controls, role denial before API access,
horizontal overflow, dense product rows, named product-editor groups, and
technical payment identifiers. Screenshots are written to `/tmp/opendx-console-browser`
by default. Set `CONSOLE_URL` or `BROWSER_EVIDENCE_DIR` when local paths differ.

Run the Phase 8 combined browser accessibility gate and API performance gate
with the local stack running:

```bash
pnpm check:phase8-accessibility
pnpm check:phase8-performance
```

The accessibility gate delegates to the existing Storefront, Console
orders/payments, and CRM/Support/Dashboard browser checks. The performance gate
checks p95 latency for public catalog, categories, and anonymous cart API
requests.

Run the Phase 8 exit preflight with the local stack and Chrome available:

```bash
pnpm check:phase8-exit
```

This gate intentionally excludes `pnpm check:sepay-production`; real-money
SePay acceptance remains an explicit operator decision.

Run the deterministic Phase 6 financial exit gate against isolated PostgreSQL
databases with:

```bash
pnpm check:commerce-exit
```

If local PostgreSQL is exposed on a non-default host port, pass it explicitly:

```bash
POSTGRES_PORT=55432 pnpm check:commerce-exit
```

It runs 20-way checkout concurrency, exact-once payment replay,
IPN/reconciliation/expiry races, fail-closed API boundaries, a paid-order
custom-format backup/restore, and full migration rollback/reapply. Evidence is
written to `/tmp/opendx-commerce-exit` by default. The script requires the
local PostgreSQL Compose service but never changes the normal `opendx`
database. This deterministic gate does not replace the credential-owned SePay
sandbox acceptance documented in `docs/integrations/sepay.md`.

Run the Phase 7 CRM, Support, and Dashboard focused exit preflight with:

```bash
make check-crm-support-dashboard
```

It builds the API image from the current source, requires isolated PostgreSQL,
MinIO, ClamAV, and reporting-scale test resources, runs the Phase 7 focused API,
PostgreSQL/MinIO/ClamAV, Console, source/build, audit, and query-plan checks,
and prints a run UUID without exposing credentials or customer PII. Full Phase 7
closure additionally requires the browser, restart, backup/restore, and
rollback/forward migration evidence documented in
`docs/operations/crm-support-dashboard.md`.

When the Console dev server is running with the documented Vite environment,
run the Phase 7 browser check with:

```bash
pnpm check:crm-support-dashboard-browser
```

This second Console check covers Customers, Customer 360, Support list/detail,
and the executive Dashboard at the same three responsive widths and in both
themes. Together, the two Console browser checks exercise all 17 registered
Console routes, semantic landmarks, keyboard focus, visible-control collision,
responsive navigation, truthful Coming Soon states, the executive Dashboard
hierarchy, unavailable Support SLA disclosure, and denied-route API isolation.
Screenshots are written to
`/tmp/opendx-crm-support-dashboard-browser` by default.

Run the Phase 7 PostgreSQL lifecycle check with:

```bash
pnpm check:crm-support-dashboard-lifecycle
```

## Run Local Services

Start the full local stack, including all migrations through Support and the
Company Core → Catalog → Inventory → Promotion → Dashboard Demo seed jobs:

```bash
make up
```

`make up` automatically refreshes a deterministic development-only 60-day
commerce fixture for Dashboard charts. The seed updates only its documented
demo UUID namespace and does not delete or replace contributor-created rows.
To refresh only this fixture while the local database is running, use:

```bash
pnpm --filter @opendx/api db:seed:dashboard-demo
```

Run the console:

```bash
pnpm --filter @opendx/console dev
```

Run the storefront:

```bash
pnpm --filter @opendx/storefront dev
```

Run the API:

```bash
pnpm --filter @opendx/api dev
```

Run the AI runtime:

```bash
cd services/ai-runtime
python3 -m uvicorn app.main:app --reload --port 8000
```

The AI runtime is not a long-running service in the Commerce Foundation Compose
topology; its image is used by `make check`.

## Configuration

Copy `.env.example` to `.env` for local development if needed. Do not commit `.env` or real credentials.

The example credentials in `infra/docker/docker-compose.yml` are local-only and must not be reused in production. See `development/catalog-local-environment.md` and `development/database-operations.md` for operations and data-loss boundaries.

Phase 8 production readiness uses a separate production environment contract
documented in [`deployment/production.md`](deployment/production.md). Production
mode requires HTTPS origins, secure cookies, real non-placeholder domains,
explicit SePay production settings, and PII-safe observability settings.
GitHub Actions checks do not deploy to a VPS in Phase 8.

The API readiness probe verifies every PostgreSQL migration family through
CRM/Support, Keycloak, ClamAV, the product-media MinIO bucket, and the private
`support-attachments` bucket. It does not contact SePay. Runtime persistence
remains PostgreSQL-only; there is no memory database switch.

Runtime logs, readiness checks, and optional `/metrics` operations are
documented in [`operations/observability.md`](operations/observability.md).
PostgreSQL and MinIO backup/restore safety scripts are documented in
[`operations/backup-restore.md`](operations/backup-restore.md).

ClamAV uses the pinned local Compose image and keeps virus signatures on a
persistent Docker volume. First startup can spend several minutes downloading
signatures and should have about 4 GB of Docker memory available. Support
attachment uploads fail closed while scanning is unavailable: files remain
quarantined and cannot be downloaded until a clean scan is recorded.

See `development/storefront-local-environment.md` for optional real Google
identity setup. The normal stack and health checks do not require Google.

See `integrations/sepay.md` for optional sandbox credentials and public HTTPS
IPN setup. Normal startup does not require payment credentials. When configured,
the API starts Checkout expiry and Payment reconciliation workers inside the
same modular-monolith process and stops them during graceful shutdown.
