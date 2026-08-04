<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Dependencies

OpenDX CompanyOS uses upstream open-source packages instead of vendoring dependency source into this repository.

## JavaScript and TypeScript

Dependency manifests:

- Root workspace: `package.json`
- Console: `apps/console/package.json`
- API: `apps/api/package.json`
- Shared packages: `packages/*/package.json`
- Lockfile: `pnpm-lock.yaml`

Current major dependencies:

| Package | Used by | Purpose |
| --- | --- | --- |
| `react`, `react-dom` | `apps/console` | Console UI rendering |
| `vite`, `@vitejs/plugin-react` | `apps/console` | Console development and production builds |
| `lucide-react` | `apps/console` | Icon set for product UI controls and status surfaces |
| `vitest`, `jsdom` | `apps/console` | Console unit test runner and browser-like test environment |
| `@testing-library/react`, `@testing-library/jest-dom` | `apps/console` | User-facing component assertions |
| `express` | `apps/api` | HTTP API shell |
| `typescript` | workspace | Type checking |
| `vitest` | packages, API, and console | TypeScript tests |
| `supertest` | `apps/api` | API endpoint tests |
| `tsx` | `apps/api` | Local TypeScript server execution |

## Python

Dependency manifest:

- `services/ai-runtime/pyproject.toml`

Current major dependencies:

| Package | Used by | Purpose |
| --- | --- | --- |
| `fastapi` | `services/ai-runtime` | AI runtime HTTP service shell |
| `uvicorn` | `services/ai-runtime` | Local ASGI server |
| `httpx` | `services/ai-runtime` | FastAPI test client dependency |
| `pytest` | `services/ai-runtime` | Python tests |

## Local Infrastructure Images

Compose file:

- `infra/docker/docker-compose.yml`

Current images:

| Image | Purpose |
| --- | --- |
| `pgvector/pgvector:pg18` | PostgreSQL with pgvector target |
| `quay.io/keycloak/keycloak:26.4.2` | Local identity provider |
| `temporalio/auto-setup:1.29.1` | Local Temporal development service |
| `minio/minio:latest` | Local object storage only |

`minio/minio:latest` is intentionally limited to local development. Do not use it as a production deployment pin.

## Dependency Policy

- Prefer established open-source libraries over hand-rolled infrastructure.
- Do not vendor dependency source code into this repository.
- Do not modify third-party dependency source.
- Add dependencies only when they support a current phase or documented near-term phase.
- Update this document when adding runtime, build, test, or infrastructure dependencies.
- Keep lockfiles committed so builds are reproducible.
