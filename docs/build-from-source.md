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

```bash
pnpm check
```

This runs:

- `git diff --check`
- TypeScript lint gates
- TypeScript typecheck gates
- TypeScript tests and Next.js production build
- Python tests for `services/ai-runtime`
- Repository governance audit
- Docker Compose config validation

## Run Local Services

Start local infrastructure:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
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

## Configuration

Copy `.env.example` to `.env` for local development if needed. Do not commit `.env` or real credentials.

The example credentials in `infra/docker/docker-compose.yml` are local-only and must not be reused in production.
