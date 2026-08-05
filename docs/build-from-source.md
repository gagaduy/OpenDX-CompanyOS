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
- Vite console production build
- Python tests for `services/ai-runtime`
- Repository governance audit
- Docker Compose config validation

The faster host gate remains available after installing dependencies:

```bash
pnpm check
```

## Run Local Services

Start the full local stack, including migration and seed jobs:

```bash
make up
```

Run the console:

```bash
pnpm --filter @opendx/console dev
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
