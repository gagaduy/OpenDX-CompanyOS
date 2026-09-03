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
| `esbuild` | `apps/api` | Bundle the production API server for direct Node execution |
| `pg`, `@types/pg` | `apps/api` | PostgreSQL driver and TypeScript contracts (MIT) |
| `node-pg-migrate` | `apps/api` | Versioned PostgreSQL migrations (MIT) |
| `zod` | API, Console, and Storefront | Runtime environment, request, and response boundary validation (MIT) |
| `jose` | `apps/api` | OIDC JWT and JWKS verification (MIT) |
| `minio` | `apps/api` | S3-compatible product media storage adapter (Apache-2.0) |
| `multer`, `@types/multer` | `apps/api` | Bounded multipart media upload parsing (MIT) |
| `file-type` | `apps/api` | Uploaded image byte-signature detection (MIT) |
| `sharp` `0.35.4` | `apps/api` | Bounded Marketing PNG-to-JPEG conversion for private Instagram publication variants (Apache-2.0; Node.js >=20.9) |
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

Marketing document and spreadsheet deliverable generators
(`campaign_brief_docx`, `facebook_content_docx`,
`facebook_publication_log_xlsx`, `marketing_final_report_pdf`) remain
implemented in pure TypeScript with Node standard library utilities. Marketing
uses the pinned `sharp` image SDK only at its bounded infrastructure boundary
to convert an approved private PNG asset into the deterministic private JPEG
variant required for Instagram publication.

`cloudflared` is an optional, developer-operated external HTTPS tunnel for
localhost Instagram acceptance. It is not an application runtime dependency,
is not installed through the workspace lockfile, and is not part of the
production topology.

## Python

Dependency manifest:

- `services/ai-runtime/pyproject.toml`

Current major dependencies:

| Package | Used by | Purpose |
| --- | --- | --- |
| `fastapi` | `services/ai-runtime` | AI runtime HTTP service shell |
| `uvicorn` | `services/ai-runtime` | Local ASGI server |
| `httpx` | `services/ai-runtime` | FastAPI test client dependency |
| `temporalio` `1.30.0` | `services/ai-runtime` | MIT-licensed Temporal workflow, activity, client, worker, replay, and time-skipping SDK |
| `PyJWT[crypto]` `2.13.0` | `services/ai-runtime` | MIT-licensed JWT validation for internal workload identities; the `crypto` extra uses the reviewed `cryptography` dependency |
| `pydantic` `2.13.4` | `services/ai-runtime` | MIT-licensed strict validation for Agentic transport and orchestration contracts |
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
| `clamav/clamav:1.5.3-debian13-slim` | Local Support attachment malware scanning |
| `caddy:2.10.2-alpine` | Phase 8 VPS HTTPS reverse proxy example |
| `temporalio/server:1.31.2` | Phase B durable workflow history, timers, task queues, retries, and signals |
| `temporalio/admin-tools:1.31.2` | Explicit Phase B Temporal database schema and namespace administration jobs |

Compose and Dockerfiles pin these reviewed tags to immutable image digests.
Phase A Agent Governance adds no package dependency. Phase B adds the Temporal
Python SDK and server image only to the isolated AI Runtime and orchestration
topology. OpenRouter SDKs and pgvector remain absent from the Commerce Product
Foundation.

Phase C adds no package or image dependency. Its typed schemas, fixed adapters,
bounded observability, disposable acceptance runner, PostgreSQL views, and
client-credentials checks reuse Zod, Node.js, PostgreSQL, Keycloak, and Docker
Compose already present in the repository.

Phase D adds no package or image dependency. The provider-neutral OpenRouter
gateway uses the existing `httpx` transport; its credential-owned acceptance
runner uses Python's standard library only.

The Phase B compatibility pins are `temporalio==1.30.0` for workflow, worker,
client, time-skipping, and replay code, and `temporalio/server:1.31.2` plus
`temporalio/admin-tools:1.31.2` for persistence/schema/namespace operations.
The server images are private infrastructure, not public UI services; no
Temporal UI image is included.

The repository installs the published `temporalio==1.30.0` wheel; it does not
vendor or rebuild the SDK. Rebuilding that SDK itself requires its upstream
Rust, Protobuf, and `uv` toolchain, which are not OpenDX CompanyOS build
dependencies. Temporal Server and admin tools are consumed as reviewed,
immutable upstream images rather than rebuilt or vendored here. Compose pins
the reviewed multi-architecture image indexes when Phase B infrastructure is
introduced.

Phase 6 reuses Node `crypto`, native `fetch`, PostgreSQL transactions, existing
Zod validation, and the existing React test/build stack for SePay, Checkout,
Order, Payment, and browser acceptance. No SePay SDK, scheduler, queue, tunnel,
or additional package is bundled. A contributor may run an external HTTPS
tunnel locally, but it is not a repository dependency.

Phase 7 CRM, Support, Dashboard, and the exit preflight reuse the existing Node,
React, PostgreSQL, MinIO, ClamAV, Zod, and Console test/build stack. No new
runtime or build dependency is added for the Phase 7 acceptance runner.

Phase 8 production environment validation and deployment documentation reuse
the existing Zod, Docker Compose, PostgreSQL, MinIO, Keycloak, ClamAV, and
Node.js script stack. The production-candidate deployment example adds Caddy as
the approved VPS HTTPS reverse proxy. No new application runtime or package
dependency is added for the production environment contract baseline.

The Storefront Nexora-inspired homepage uses native browser scroll and animation
frame APIs with Three.js and React Three Fiber. It does not introduce GSAP or a
runtime dependency on a third-party model host; reviewed GLB assets are stored
locally with their provenance and licenses.

## Dependency Policy

- Prefer established open-source libraries over hand-rolled infrastructure.
- Do not vendor dependency source code into this repository.
- Do not modify third-party dependency source.
- Add dependencies only when they support a current phase or documented near-term phase.
- Update this document when adding runtime, build, test, or infrastructure dependencies.
- Keep lockfiles committed so builds are reproducible.
