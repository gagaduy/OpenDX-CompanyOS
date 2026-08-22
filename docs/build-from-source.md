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

Phase B durable workflow validation has two live Docker gates:

```bash
pnpm check:agentic-workflow
pnpm check:agentic-workflow-recovery
```

The lifecycle gate starts a governed task, interrupts an in-flight worker, and
proves exactly-once convergence after redelivery. The recovery gate uses only
suffixed disposable PostgreSQL databases, backs up and restores all three
databases, resumes a waiting workflow, and replays its exported Temporal
history. Both acquire the shared database-maintenance lock and fail if another
stack-owning operation is active. Run the static closure contract with:

```bash
pnpm check:agentic-phase-b-exit
```

Phase C adds static and live Department-tool gates:

```bash
pnpm test:agentic-department-tools
pnpm test:agentic-phase-c-exit
make up
pnpm check:agentic-department-tools
pnpm check:agentic-phase-c-exit
```

Phase D has deterministic and credential-owned acceptance gates:

```bash
pnpm check:agentic-model-runtime
pnpm check:agentic-phase-d-exit
```

Phase E file-intake transport contracts can be exercised without credentials or
object-storage access:

```bash
pnpm --filter @opendx/api exec vitest run src/modules/agentic/tests/agentic.api.test.ts
```

The API accepts one CSV (`text/csv`) or TXT (`text/plain`) multipart field
named `file`, held in process memory only while the private object-storage
adapter records it. The transport hard limit is exactly 2 MiB; no public URL or
content-download route is exposed.

For mandatory external acceptance, set `OPENROUTER_API_KEY=<operator-owned-key>`
only in ignored root `.env`, export it with `set -a; . ./.env; set +a`, and set
`OPENROUTER_CONFIGURATION_EXPORT` to the absolute path of a JSON export from
the active, Governance-approved configuration revision. Model IDs must come
from that API/database export, never from environment variables. The accepted
shape is the revision response envelope, its `data`, or its `children`, with
all seven records under `modelConfigurations`:

```json
{
  "data": {
    "children": {
      "modelConfigurations": [
        {
          "agentKind": "catalog",
          "primaryModel": "provider/configured-primary",
          "fallbackModels": ["provider/configured-fallback"]
        }
      ]
    }
  }
}
```

The real export must contain exactly one record for each of `ai_ceo`,
`catalog`, `inventory`, `order`, `finance`, `crm`, and `support`, and every
record must contain exactly one fallback model. Run either:

```bash
export OPENROUTER_CONFIGURATION_EXPORT=/absolute/path/configuration-revision.json
pnpm check:openrouter-live
make check-openrouter-live OPENROUTER_CONFIGURATION_EXPORT=/absolute/path/configuration-revision.json
```

The runner sends synthetic `internal` context and writes aggregate temporary
evidence only; it never prints the key, prompt, configuration contents, or
provider response. Phase D remains in progress until this passes.

For a deliberately narrow, local smoke acceptance of only the active Catalog
configuration, run the static guard first, then explicitly opt in:

```bash
set -a; . ./.env; set +a
export OPENROUTER_LIVE_ACCEPTANCE_CONFIRM=run-one-catalog
pnpm test:catalog-live-acceptance
pnpm run:catalog-live-acceptance
```

This command reads the active Catalog record from the local Compose PostgreSQL
service, pins a disposable ready Catalog task to it, and starts a one-shot
worker container. It makes at most one provider generation: neither model
fallback nor Quality Gate correction retry is permitted. Its configured task
budget remains authoritative (currently $0.10); non-accepted quality results
settle as `partial`. No public endpoint is added, and output contains only run
ID, status, token counts, and settled cost. The normal worker remains disabled
unless separately configured; remove the confirmation variable after use. The
wrapper signs in to the local `opendx` realm as `admin@novacommerce.example`;
set `AGENTIC_LIVE_ACCEPTANCE_ADMIN_USERNAME` only when the local staff
administrator uses a different username.

To inspect an existing terminal run without calling a provider, use the
read-only local diagnostic:

```bash
pnpm diagnose:catalog-live -- --run-id 3c55ada2-7c52-4663-bd77-38d427171e1f
```

It reads only the persisted model run, audit count, and provenance count. Its
category is intentionally `provider_unknown` when the historical run retained
only a generic provider-rejection code; it never guesses a schema/model cause,
prints a provider body, or creates another model run.

The live runner acquires `/tmp/opendx-database-maintenance.lock`, creates a
suffixed disposable PostgreSQL database and API process, obtains six distinct
local Keycloak client credentials without printing them, invokes all 17 tools,
denies cross-department and AI CEO calls, checks provenance and summary sharing,
and destroys only its disposable records and database. It hashes Commerce data
before and after invocation to prove the tools are read-only. No OpenRouter or
SePay credential is required. Use `make check-agentic-department-tools` as the
Make equivalent.

Production preflight must additionally pass `pnpm check:production-compose`,
`pnpm check:agentic-production-compose`, and `pnpm check:backup-restore` so the
six Agent secrets, isolated analytics credential, private route, migrations,
and recovery set remain valid.

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

The fast host gate remains available after installing dependencies:

```bash
pnpm check
```

It runs source-integrity checks, TypeScript lint/typecheck, TypeScript tests,
and the repository audit. It intentionally excludes Python, frontend builds,
and Agentic exit contracts so an unrelated change can iterate quickly.

Before merge, run the broader host gate:

```bash
pnpm check:full
```

Use `make check` when a reproducible container gate and API integration suite
are required. Run lifecycle, recovery, browser, financial, and provider gates
only when their documented ownership or contract is affected.

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

Run the AI runtime gateway and worker on the host only when Temporal and the
documented environment are already available:

```bash
cd services/ai-runtime
python3 -m uvicorn app.main:app --reload --port 8000
python3 -m app.agentic.worker
```

Normal local development should use `make up`; Compose owns the long-running AI
Runtime and worker, their readiness, namespace registration, and restart order.
No OpenRouter key is required through Phase C.

## Configuration

Copy `.env.example` to `.env` for local development if needed. Do not commit `.env` or real credentials.

The example credentials in `infra/docker/docker-compose.yml` are local-only and must not be reused in production. See `development/catalog-local-environment.md` and `development/database-operations.md` for operations and data-loss boundaries.

Phase 8 production readiness uses a separate production environment contract
documented in [`deployment/production.md`](deployment/production.md). Production
mode requires HTTPS origins, secure cookies, real non-placeholder domains,
explicit SePay production settings, and PII-safe observability settings.
GitHub Actions checks do not deploy to a VPS in Phase 8.

The API readiness probe verifies every PostgreSQL migration family through
Reporting and Agentic, plus Keycloak, ClamAV, the product-media MinIO bucket,
and the private `support-attachments` bucket. It uses the repository's current
minimum migration counts so an older partially migrated stack stays unready.
It does not contact SePay. Runtime persistence remains PostgreSQL-only; there
is no memory database switch.

Runtime logs, readiness checks, and optional `/metrics` operations are
documented in [`operations/observability.md`](operations/observability.md).
PostgreSQL/Temporal and MinIO backup/restore safety scripts are documented in
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
