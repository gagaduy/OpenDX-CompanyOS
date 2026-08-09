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
- Storefront: `apps/storefront/package.json`
- API: `apps/api/package.json`
- Shared packages: `packages/*/package.json`
- Lockfile: `pnpm-lock.yaml`

Current major dependencies:

| Package | Used by | Purpose |
| --- | --- | --- |
| `react`, `react-dom` | `apps/console`, `apps/storefront` | Console and Storefront UI rendering |
| `vite`, `@vitejs/plugin-react` | `apps/console`, `apps/storefront` | Frontend development and production builds |
| `lucide-react` | `apps/console`, `apps/storefront` | Icon set for product UI controls and status surfaces |
| `vitest`, `jsdom` | `apps/console`, `apps/storefront` | Frontend unit test runner and browser-like test environment |
| `@testing-library/react`, `@testing-library/jest-dom` | `apps/console`, `apps/storefront` | User-facing component assertions |
| `express` | `apps/api` | HTTP API shell |
| `typescript` | workspace | Type checking |
| `vitest` | packages, API, Console, and Storefront | TypeScript tests |
| `supertest` | `apps/api` | API endpoint tests |
| `tsx` | `apps/api` | Local TypeScript server execution |
| `pg`, `@types/pg` | `apps/api` | PostgreSQL driver and TypeScript contracts (MIT) |
| `node-pg-migrate` | `apps/api` | Versioned PostgreSQL migrations (MIT) |
| `zod` | API, Console, and Storefront | Runtime environment, request, and response boundary validation (MIT) |
| `jose` | `apps/api` | OIDC JWT and JWKS verification (MIT) |
| `minio` | `apps/api` | S3-compatible product media storage adapter (Apache-2.0) |
| `multer`, `@types/multer` | `apps/api` | Bounded multipart media upload parsing (MIT) |
| `file-type` | `apps/api` | Uploaded image byte-signature detection (MIT) |
| `cors`, `@types/cors` | `apps/api` | Explicit browser-origin policy (MIT) |
| `cookie` | `apps/api` | Standards-based HTTP cookie parsing and serialization for Commerce sessions (MIT) |
| `express-rate-limit` | `apps/api` | Bounded abuse protection for selected customer-authentication endpoints (MIT) |
| `oidc-client-ts` | `apps/console` | Staff Authorization Code with PKCE client (Apache-2.0) |
| `react-router-dom` | `apps/console`, `apps/storefront` | Console and Storefront routing (MIT) |
| `@testing-library/user-event` | `apps/console`, `apps/storefront` | User-level interaction tests (MIT) |

The Commerce Foundation API runs as one process, so `express-rate-limit` initially uses its
built-in memory store for Google authentication abuse protection. A hosted
multi-replica deployment must configure a reviewed shared store during Phase 8;
the in-memory limiter is not treated as a cross-replica quota authority.

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
| `node:22.22.0-bookworm-slim` | Non-root API, Console, and Storefront development images |
| `python:3.13.12-slim-bookworm` | Non-root AI validation image |
| `postgres:18.3-bookworm` | Operational and integration-test PostgreSQL |
| `quay.io/keycloak/keycloak:26.4.2` | Local staff identity provider |
| `minio/minio:RELEASE.2025-04-22T22-12-26Z` | Local product-media object storage |
| `minio/mc:RELEASE.2025-04-16T18-13-26Z` | Idempotent local bucket bootstrap |

Compose and Dockerfiles pin these reviewed tags to immutable image digests.
Temporal and pgvector are not runtime dependencies of the Commerce Product
Foundation.

Phase 6 reuses Node `crypto`, native `fetch`, PostgreSQL transactions, existing
Zod validation, and the existing React test/build stack for SePay, Checkout,
Order, Payment, and browser acceptance. No SePay SDK, scheduler, queue, tunnel,
or additional package is bundled. A contributor may run an external HTTPS
tunnel locally, but it is not a repository dependency.

## Dependency Policy

- Prefer established open-source libraries over hand-rolled infrastructure.
- Do not vendor dependency source code into this repository.
- Do not modify third-party dependency source.
- Add dependencies only when they support a current phase or documented near-term phase.
- Update this document when adding runtime, build, test, or infrastructure dependencies.
- Keep lockfiles committed so builds are reproducible.
