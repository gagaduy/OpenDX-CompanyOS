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

## Validate From Source

From the repository root:

The reproducible container gate requires Docker, but does not require host
Node.js or Python:

```bash
make check
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
validates seeded image delivery, semantic content, keyboard-visible focus, and
horizontal overflow at 390x844, 768x1024, and 1440x900. Screenshots are written
to `/tmp/opendx-storefront-browser` by default. Set `CHROME_BIN`,
`STOREFRONT_URL`, or `BROWSER_EVIDENCE_DIR` when local paths differ.

## Run Local Services

Start the full local stack, including Catalog → Company Core → Inventory →
Customer → Cart migrations and Company Core → Catalog → Inventory seed jobs:

```bash
make up
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

The API readiness probe verifies PostgreSQL migration state for Catalog,
Company Core, Inventory, Customer, and Cart plus the MinIO bucket. Runtime
persistence remains PostgreSQL-only; there is no memory database switch.

See `development/storefront-local-environment.md` for optional real Google
identity setup. The normal stack and health checks do not require Google.
