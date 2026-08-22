<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Commerce Hardening and Hosting Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the NovaCommerce commerce foundation deployable, recoverable, observable, and security-reviewed for a single VPS/VM Docker Compose production candidate.

**Architecture:** Keep the existing Express modular monolith, React Storefront, React Console, PostgreSQL, MinIO, Keycloak, ClamAV, and Docker Compose topology. Add production-specific configuration validation, runtime hardening, Caddy deployment examples, lightweight observability, backup/restore operations, security/payment/accessibility/performance gates, and CI checks without adding Kubernetes, managed cloud services, Redis, email/SMS, Prometheus, or automatic SSH deployment.

**Tech Stack:** TypeScript, Express, React, Vite, PostgreSQL 18, MinIO, Keycloak, ClamAV, Caddy, Docker Compose, GitHub Actions, POSIX shell, Node.js scripts, Vitest, Supertest.

## Global Constraints

- Hosting target is one VPS/VM using Docker Compose.
- HTTPS reverse proxy is Caddy.
- PostgreSQL and MinIO run on the VPS through Docker volumes.
- GitHub Actions runs checks only; it does not SSH into the VPS or deploy.
- No production email or SMS integration is added in Phase 8.
- Observability is structured logs, separated liveness/readiness, bounded metrics endpoint, and runbooks; no Prometheus or Grafana containers.
- Production SePay acceptance is opt-in, requires explicit human confirmation, uses the minimum provider-supported amount or 10,000 VND, and never runs in default CI.
- PostgreSQL and MinIO backups run daily by documentation/default and retain seven days.
- Restore must be verified on a separate database or staging target before touching production data.
- Production docs use `shop.example.com`, `console.example.com`, `api.example.com`, `auth.example.com`, and `storage.example.com` until a real domain is provided.
- MVP VPS performance targets: Storefront initial load under 3 seconds, API read p95 under 300 ms, Dashboard/reporting p95 under 1.5 seconds with approved scale fixture, and no horizontal overflow on mobile.
- Do not add Kubernetes, Helm, Terraform, managed PostgreSQL, managed S3, CDN, object-storage replication, Redis, queue, scheduler service, separate analytics database, marketplace, multi-store, multi-warehouse, Workflow Builder, Digital Employees, GraphRAG, or AI-driven operations.
- Do not commit real credentials, tokens, customer records, provider payloads, production domains, or temporary tunnel URLs.
- Keep local `infra/docker/docker-compose.yml` behavior unchanged unless a task explicitly updates shared validation or documentation.
- Update `CHANGELOG.md` under `[Unreleased]` in the same commit as each repository-changing task.

---

## File Structure

Phase 8 should touch these areas only:

- `apps/api/src/shared/config/`: production environment validation.
- `apps/api/src/shared/http/`: security headers, request limits, health/readiness, metrics, logging middleware.
- `apps/api/src/server.ts`: composition wiring, graceful shutdown, readiness dependency probes, metrics/logging setup.
- `apps/api/src/modules/*/tests/` and existing module tests: authorization and ownership matrix coverage.
- `apps/api/src/modules/payment/`: payment threat-model regressions and production acceptance boundaries.
- `apps/api/Dockerfile`, `apps/console/Dockerfile`, `apps/storefront/Dockerfile`, `services/ai-runtime/Dockerfile`: production target stages and non-root verification.
- `infra/deploy/`: production Compose and Caddy examples for the approved VPS target.
- `scripts/ops/`: backup/restore and production validation scripts.
- `scripts/dev/`: source-runnable Phase 8 checks, accessibility/performance/production-payment acceptance runners.
- `.github/workflows/`: CI and security workflows.
- `docs/deployment/`, `docs/operations/`, `docs/security/`: production, backup/restore, observability, authorization, and payment threat model docs.
- Existing docs: `SECURITY.md`, `.env.example`, `Makefile`, `docs/build-from-source.md`, `docs/dependencies.md`, `docs/roadmap/mvp-status.md`, `CHANGELOG.md`.

Do not create empty future module trees. Create `infra/deploy/`, `scripts/ops/`, `docs/deployment/`, or new test folders only with the first real file in the relevant task.

---

### Task 1: Production Environment Contract and Documentation Baseline

**Files:**
- Modify: `apps/api/src/shared/config/environment.ts`
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Create or modify: `.env.example`
- Create: `docs/deployment/production.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/dependencies.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Existing `parseApiEnvironment(source)` and `ApiEnvironment`.
- Produces: `OPENDX_ENV=production` validation that rejects unsafe HTTPS, cookie, CORS, SePay, placeholder-domain, metrics, and production acceptance settings.
- Produces environment fields for later tasks:
  - `LOG_FORMAT: "pretty" | "json"`
  - `LOG_LEVEL: "debug" | "info" | "warn" | "error"`
  - `METRICS_ENABLED: boolean`
  - `METRICS_PATH: string`
  - `READINESS_TIMEOUT_MS: number`
  - `JSON_BODY_LIMIT: string`
  - `PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND: number`
  - `PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION?: string`

- [ ] **Step 1: Write failing environment tests**

Add tests to `apps/api/src/shared/config/environment.test.ts`:

```ts
it("rejects placeholder production domains", () => {
  expect(() =>
    parseApiEnvironment({
      ...validEnvironment(),
      OPENDX_ENV: "production",
      COOKIE_SECURE: "true",
      CONSOLE_ORIGIN: "https://console.example.com",
      STOREFRONT_ORIGIN: "https://shop.example.com",
      KEYCLOAK_ISSUER: "https://auth.example.com/realms/opendx",
      KEYCLOAK_JWKS_URL:
        "https://auth.example.com/realms/opendx/protocol/openid-connect/certs",
      MINIO_ENDPOINT: "https://storage.example.com",
      SEPAY_ENVIRONMENT: "production",
      SEPAY_CHECKOUT_URL: "https://pay.sepay.vn/v1/checkout/init",
      SEPAY_API_BASE_URL: "https://pgapi.sepay.vn",
      SEPAY_MERCHANT_ID: "merchant",
      SEPAY_SECRET_KEY: "secret",
      SEPAY_IPN_SECRET: "ipn-secret",
      SEPAY_SUCCESS_URL: "https://shop.example.com/payment/return?outcome=success",
      SEPAY_ERROR_URL: "https://shop.example.com/payment/return?outcome=error",
      SEPAY_CANCEL_URL: "https://shop.example.com/payment/return?outcome=cancel",
    }),
  ).toThrow(/placeholder production domain/i);
});

it("parses production observability and body limit settings", () => {
  const environment = parseApiEnvironment({
    ...validProductionEnvironment(),
    LOG_FORMAT: "json",
    LOG_LEVEL: "info",
    METRICS_ENABLED: "true",
    METRICS_PATH: "/metrics",
    READINESS_TIMEOUT_MS: "2500",
    JSON_BODY_LIMIT: "1mb",
    PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND: "10000",
    PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION: "I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT",
  });
  expect(environment.logging).toEqual({ format: "json", level: "info" });
  expect(environment.metrics).toEqual({ enabled: true, path: "/metrics" });
  expect(environment.readinessTimeoutMs).toBe(2500);
  expect(environment.jsonBodyLimit).toBe("1mb");
  expect(environment.productionSePayAcceptance).toEqual({
    amountVnd: 10000,
    confirmation: "I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT",
  });
});
```

If `validEnvironment()` is not broad enough, extend the existing test helper in the same file. Keep test helpers local to the test file.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @opendx/api test -- src/shared/config/environment.test.ts
```

Expected: FAIL because new fields and placeholder-domain validation do not exist.

- [ ] **Step 3: Implement minimal validation**

In `environment.ts`, add typed environment schema fields:

```ts
const bodyLimit = z.string().trim().regex(/^\d+(b|kb|mb)$/i);
const optionalProductionConfirmation = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().optional(),
);
const forbiddenExampleHostnames = new Set([
  "shop.example.com",
  "console.example.com",
  "api.example.com",
  "auth.example.com",
  "storage.example.com",
]);
```

Add production `superRefine` checks:

```ts
for (const [field, rawUrl] of [
  ["CONSOLE_ORIGIN", value.CONSOLE_ORIGIN],
  ["STOREFRONT_ORIGIN", value.STOREFRONT_ORIGIN],
  ["KEYCLOAK_ISSUER", value.KEYCLOAK_ISSUER],
  ["MINIO_ENDPOINT", value.MINIO_ENDPOINT],
] as const) {
  const hostname = new URL(rawUrl).hostname;
  if (forbiddenExampleHostnames.has(hostname)) {
    context.addIssue({
      code: "custom",
      path: [field],
      message: "must not use a placeholder production domain",
    });
  }
}
```

Expose typed fields in `ApiEnvironment`:

```ts
readonly logging: { readonly format: "pretty" | "json"; readonly level: "debug" | "info" | "warn" | "error" };
readonly metrics: { readonly enabled: boolean; readonly path: string };
readonly readinessTimeoutMs: number;
readonly jsonBodyLimit: string;
readonly productionSePayAcceptance: {
  readonly amountVnd: number;
  readonly confirmation?: string;
};
```

Use defaults:

```ts
LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
METRICS_ENABLED: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
METRICS_PATH: z.string().trim().regex(/^\/[a-z0-9/_-]*$/i).default("/metrics"),
READINESS_TIMEOUT_MS: positiveInteger.pipe(z.number().int().min(250).max(10_000)).default(2_000),
JSON_BODY_LIMIT: bodyLimit.default("1mb"),
PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND: positiveInteger.default(10_000),
PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION: optionalProductionConfirmation,
```

- [ ] **Step 4: Update env/docs baseline**

Update `.env.example` with safe names only:

```text
OPENDX_ENV=development
LOG_FORMAT=pretty
LOG_LEVEL=info
METRICS_ENABLED=false
METRICS_PATH=/metrics
READINESS_TIMEOUT_MS=2000
JSON_BODY_LIMIT=1mb
PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND=10000
PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION=
```

Create `docs/deployment/production.md` with:

- VPS prerequisites: Docker, Docker Compose, DNS, firewall for 80/443.
- Domain placeholders and instruction to replace them before production mode.
- Manual deploy outline: copy env, pull source/artifact, `docker compose`, run migrations, seed if first install, health checks.
- Secret handling: `.env.production` stays off Git.
- Explicit local-to-production differences.

Update `docs/build-from-source.md` and `docs/dependencies.md` to mention the Phase 8 production environment contract and no new runtime dependency in this task.

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm --filter @opendx/api test -- src/shared/config/environment.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
pnpm audit:repo
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/config/environment.ts apps/api/src/shared/config/environment.test.ts .env.example docs/deployment/production.md docs/build-from-source.md docs/dependencies.md CHANGELOG.md
git commit -m "feat(deploy): define production environment contract"
```

---

### Task 2: Production Images, Caddy, and VPS Compose Example

**Files:**
- Modify: `apps/api/Dockerfile`
- Modify: `apps/console/Dockerfile`
- Modify: `apps/storefront/Dockerfile`
- Modify: `services/ai-runtime/Dockerfile`
- Create: `infra/deploy/compose.production.yml`
- Create: `infra/deploy/Caddyfile`
- Create: `infra/deploy/README.md`
- Create: `scripts/dev/production-compose-check.mjs`
- Modify: `package.json`
- Modify: `Makefile`
- Modify: `docs/deployment/production.md`
- Modify: `docs/project-structure.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: environment fields from Task 1.
- Produces root script `pnpm check:production-compose`.
- Produces Make target `check-production-compose`.
- Produces production image target convention: `target: production` for API, Console, Storefront, and AI runtime.

- [ ] **Step 1: Write failing production Compose check**

Create `scripts/dev/production-compose-check.mjs`:

```js
#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const composePath = "infra/deploy/compose.production.yml";
const caddyPath = "infra/deploy/Caddyfile";
const compose = readFileSync(composePath, "utf8");
const caddy = readFileSync(caddyPath, "utf8");

const required = [
  "caddy:",
  "api:",
  "console:",
  "storefront:",
  "postgres:",
  "minio:",
  "keycloak:",
  "clamav:",
  "target: production",
  "COOKIE_SECURE: \"true\"",
  "OPENDX_ENV: production",
];
for (const fragment of required) {
  if (!compose.includes(fragment)) throw new Error(`Missing production Compose fragment: ${fragment}`);
}
for (const hostname of ["shop.example.com", "console.example.com", "api.example.com", "auth.example.com"]) {
  if (!caddy.includes(hostname)) throw new Error(`Missing Caddy route for ${hostname}`);
}
const result = spawnSync("docker", ["compose", "-f", composePath, "config", "--quiet"], {
  stdio: "inherit",
  env: {
    ...process.env,
    POSTGRES_PASSWORD: "change-me-postgres",
    MINIO_ROOT_PASSWORD: "change-me-minio",
    KEYCLOAK_ADMIN_PASSWORD: "change-me-keycloak",
    GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    SEPAY_MERCHANT_ID: "merchant",
    SEPAY_SECRET_KEY: "secret",
    SEPAY_IPN_SECRET: "ipn-secret",
  },
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.info("Production Compose check passed.");
```

Make it executable if repository scripts use executable bits; otherwise Node invocation is enough.

- [ ] **Step 2: Run RED**

Run:

```bash
node scripts/dev/production-compose-check.mjs
```

Expected: FAIL because `infra/deploy/compose.production.yml` and `infra/deploy/Caddyfile` do not exist.

- [ ] **Step 3: Add production Docker targets**

Update each Dockerfile with a build target named `production`. Keep existing local dev behavior as the default stage or a named `development` stage.

API production pattern:

```dockerfile
FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV CI=true
WORKDIR /workspace
RUN apt-get update \
  && apt-get install --yes --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.18.0 --activate \
  && mkdir -p /pnpm \
  && chown node:node /pnpm /workspace
COPY --chown=node:node . .
USER node
RUN pnpm install --frozen-lockfile

FROM base AS production
RUN pnpm --filter @opendx/api typecheck
EXPOSE 4000
CMD ["pnpm", "--filter", "@opendx/api", "dev"]
```

Use the current dev command if no compiled API entry exists yet. Do not invent a packaging system in this task. The hardening requirement is named production target, non-root user, pinned base image, and no local source volume in production Compose.

For Console and Storefront production targets, run their build and serve through Vite preview only if existing dependencies support it:

```dockerfile
FROM base AS production
RUN pnpm --filter @opendx/console build
EXPOSE 3000
CMD ["pnpm", "--filter", "@opendx/console", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
```

Use Storefront port `3100`. For AI runtime, preserve current Python dependency style and add a `production` target that runs as non-root.

- [ ] **Step 4: Add production Compose and Caddy**

Create `infra/deploy/compose.production.yml` with services:

- `caddy`: `caddy:2.10.2-alpine`, ports `80:80`, `443:443`, volumes for Caddyfile, data, config.
- `postgres`: pinned existing Postgres image, no public port by default, volume `opendx_postgres`.
- `minio`: pinned existing MinIO image, internal network only by default unless storage host is explicitly routed through Caddy.
- `keycloak`: pinned existing Keycloak image, production-ish `start` command, hostname from `https://auth.example.com`.
- `clamav`.
- `migrate`, `seed`, `api`, `console`, `storefront`.

Use `${VARIABLE:?message}` for required production secrets. Example:

```yaml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
```

Do not mount application source into production app containers.

Create `infra/deploy/Caddyfile`:

```caddyfile
{
	email admin@example.com
}

shop.example.com {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
	}
	reverse_proxy storefront:3100
}

console.example.com {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
	}
	reverse_proxy console:3000
}

api.example.com {
	encode zstd gzip
	request_body {
		max_size 11MB
	}
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
	}
	reverse_proxy api:4000
}

auth.example.com {
	encode zstd gzip
	reverse_proxy keycloak:8080
}
```

Do not expose MinIO in Caddy unless implementation proves a necessary admin path. Product media should continue through API routes.

- [ ] **Step 5: Wire scripts and docs**

Add root package script:

```json
"check:production-compose": "node scripts/dev/production-compose-check.mjs"
```

Add Make target:

```make
check-production-compose:
	pnpm check:production-compose
```

Update `help`.

Document `infra/deploy/README.md` and `docs/deployment/production.md`.

- [ ] **Step 6: Run GREEN**

Run:

```bash
pnpm check:production-compose
docker build --target production -f apps/api/Dockerfile .
docker build --target production -f apps/console/Dockerfile .
docker build --target production -f apps/storefront/Dockerfile .
docker build --target production -f services/ai-runtime/Dockerfile .
git diff --check
pnpm audit:repo
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/Dockerfile apps/console/Dockerfile apps/storefront/Dockerfile services/ai-runtime/Dockerfile infra/deploy package.json Makefile docs/deployment/production.md docs/project-structure.md CHANGELOG.md scripts/dev/production-compose-check.mjs
git commit -m "feat(deploy): add vps production compose"
```

---

### Task 3: Runtime Security Headers, Request Limits, Readiness Timeout, and Graceful Shutdown

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/shared/http/health.routes.ts`
- Modify: `apps/api/src/shared/http/health.routes.test.ts` or create if absent
- Modify: `apps/api/src/server.ts`
- Create: `apps/api/src/shared/http/security-headers.middleware.ts`
- Create: `apps/api/src/shared/http/security-headers.middleware.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `environment.jsonBodyLimit`, `environment.readinessTimeoutMs`.
- Produces: `createApiApp({ jsonBodyLimit, readinessTimeoutMs })`.
- Produces security headers for all API responses without breaking CORS.
- Produces graceful shutdown in `server.ts`.

- [ ] **Step 1: Write failing security/header tests**

Create `apps/api/src/shared/http/security-headers.middleware.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers.middleware";

describe("security headers", () => {
  it("adds production-safe browser hardening headers", async () => {
    const app = express().use(securityHeaders()).get("/probe", (_req, res) => res.json({ ok: true }));
    const response = await request(app).get("/probe").expect(200);
    expect(response.header["x-content-type-options"]).toBe("nosniff");
    expect(response.header["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.header["permissions-policy"]).toContain("camera=()");
    expect(response.header["content-security-policy"]).toContain("default-src 'self'");
  });
});
```

Add `apps/api/src/app.test.ts` cases:

```ts
it("applies the configured JSON body limit", async () => {
  const app = createApiApp({ jsonBodyLimit: "10b" });
  await request(app)
    .post("/v1/storefront/cart/items")
    .set("Content-Type", "application/json")
    .send({ payload: "larger than ten bytes" })
    .expect(413);
});
```

Add health timeout test:

```ts
it("fails readiness when the readiness probe exceeds the configured timeout", async () => {
  const app = createApiApp({
    readinessTimeoutMs: 1,
    readiness: () => new Promise((resolve) => setTimeout(() => resolve({
      postgres: "up",
      keycloak: "up",
      minio: "up",
      migrations: "up",
    }), 50)),
  });
  const response = await request(app).get("/health/ready").expect(503);
  expect(response.body.dependencies.readiness).toBe("down");
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @opendx/api test -- src/app.test.ts src/shared/http/security-headers.middleware.test.ts
```

Expected: FAIL because middleware, body limit option, and timeout behavior are missing.

- [ ] **Step 3: Implement middleware and app options**

Create middleware:

```ts
import type { RequestHandler } from "express";

export function securityHeaders(): RequestHandler {
  return (_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'self'");
    next();
  };
}
```

Update `CreateApiAppOptions`:

```ts
readonly jsonBodyLimit?: string;
readonly readinessTimeoutMs?: number;
```

Use:

```ts
app.use(securityHeaders());
app.use(express.json({ limit: options.jsonBodyLimit ?? "1mb" }));
app.use(createHealthRouter(options.readiness, {
  timeoutMs: options.readinessTimeoutMs ?? 2_000,
}));
```

Update `createHealthRouter(readiness, options)` to race readiness with timeout and return a PII-safe dependency:

```ts
readiness: "down"
```

when timeout occurs.

- [ ] **Step 4: Add graceful shutdown**

In `server.ts`, capture server:

```ts
const server = app.listen(environment.apiPort, () => {
  console.info(`OpenDX API listening on http://localhost:${environment.apiPort}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.info(`Received ${signal}; shutting down`);
  server.close((error) => {
    void pool.end().finally(() => {
      if (error) {
        console.error("HTTP server shutdown failed", error);
        process.exit(1);
      }
      process.exit(0);
    });
  });
  setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

If existing `server.listen` code differs, preserve existing startup behavior and add shutdown around it.

- [ ] **Step 5: Wire environment**

Pass:

```ts
jsonBodyLimit: environment.jsonBodyLimit,
readinessTimeoutMs: environment.readinessTimeoutMs,
```

to `createApiApp`.

- [ ] **Step 6: Run GREEN**

Run:

```bash
pnpm --filter @opendx/api test -- src/app.test.ts src/shared/http/security-headers.middleware.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
pnpm audit:repo
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/app.test.ts apps/api/src/shared/http apps/api/src/server.ts CHANGELOG.md
git commit -m "feat(api): harden runtime health and headers"
```

---

### Task 4: Lightweight Structured Logs and Metrics Endpoint

**Files:**
- Create: `apps/api/src/shared/observability/logger.ts`
- Create: `apps/api/src/shared/observability/metrics.ts`
- Create: `apps/api/src/shared/http/request-logging.middleware.ts`
- Create: `apps/api/src/shared/http/metrics.routes.ts`
- Create: `apps/api/src/shared/observability/observability.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Create: `docs/operations/observability.md`
- Modify: `docs/build-from-source.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `environment.logging`, `environment.metrics`.
- Produces: `createLogger({ format, level })`.
- Produces: `createMetricsRegistry()` with counters/histograms.
- Produces: `GET /metrics` only when enabled and PII-safe.

- [ ] **Step 1: Write failing observability tests**

Create `apps/api/src/shared/observability/observability.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";
import { createMetricsRegistry } from "./metrics";
import { requestLogging } from "../http/request-logging.middleware";
import { createMetricsRouter } from "../http/metrics.routes";

describe("observability", () => {
  it("redacts secret-bearing fields from JSON logs", () => {
    const entries: string[] = [];
    const logger = createLogger({
      format: "json",
      level: "info",
      sink: (line) => entries.push(line),
    });
    logger.info("payment", {
      customerEmail: "buyer@example.com",
      SEPAY_SECRET_KEY: "secret",
      token: "raw-token",
      errorCode: "PAYMENT_PROVIDER_TIMEOUT",
    });
    const line = entries.join("\n");
    expect(line).not.toContain("buyer@example.com");
    expect(line).not.toContain("secret");
    expect(line).not.toContain("raw-token");
    expect(line).toContain("PAYMENT_PROVIDER_TIMEOUT");
  });

  it("exposes bounded request metrics without PII labels", async () => {
    const metrics = createMetricsRegistry();
    const app = express()
      .use(requestLogging(createLogger({ format: "json", level: "info", sink: () => undefined }), metrics))
      .get("/customers/buyer@example.com", (_req, res) => res.json({ ok: true }))
      .use("/metrics", createMetricsRouter(metrics));
    await request(app).get("/customers/buyer@example.com").expect(200);
    const response = await request(app).get("/metrics").expect(200);
    expect(response.text).toContain("opendx_http_requests_total");
    expect(response.text).not.toContain("buyer@example.com");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @opendx/api test -- src/shared/observability/observability.test.ts
```

Expected: FAIL because observability modules do not exist.

- [ ] **Step 3: Implement minimal logger**

Create `logger.ts`:

```ts
type Level = "debug" | "info" | "warn" | "error";
type Format = "pretty" | "json";

const sensitiveKeys = /secret|token|cookie|csrf|password|authorization|email|phone|address|payload|objectKey/i;

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export function createLogger(options: {
  readonly format: Format;
  readonly level: Level;
  readonly sink?: (line: string) => void;
}): Logger {
  const sink = options.sink ?? ((line) => console.log(line));
  const order = { debug: 10, info: 20, warn: 30, error: 40 } satisfies Record<Level, number>;
  function write(level: Level, message: string, fields: Record<string, unknown> = {}) {
    if (order[level] < order[options.level]) return;
    const safeFields = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        sensitiveKeys.test(key) ? "[REDACTED]" : value,
      ]),
    );
    sink(options.format === "json"
      ? JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...safeFields })
      : `${level.toUpperCase()} ${message}`);
  }
  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}
```

Keep redaction conservative; do not log arbitrary request bodies.

- [ ] **Step 4: Implement metrics**

Expose plain text metrics:

```ts
opendx_http_requests_total{method="GET",route="unmatched",status="200"} 1
opendx_http_request_duration_ms_count{method="GET",route="unmatched"} 1
```

Use route patterns or a stable fallback, never raw URLs. If route pattern is unavailable, use `"unmatched"`.

- [ ] **Step 5: Wire app**

Update `CreateApiAppOptions`:

```ts
readonly logger?: Logger;
readonly metrics?: MetricsRegistry;
readonly metricsPath?: string;
```

Use request logging before routes and metrics route only when enabled in `server.ts`.

- [ ] **Step 6: Write observability docs**

Create `docs/operations/observability.md` with commands:

```bash
docker compose -f infra/deploy/compose.production.yml ps
docker compose -f infra/deploy/compose.production.yml logs api
curl -fsS https://api.example.com/health/live
curl -fsS https://api.example.com/health/ready
curl -fsS https://api.example.com/metrics
```

Document redaction rules and incident signals.

- [ ] **Step 7: Run GREEN**

Run:

```bash
pnpm --filter @opendx/api test -- src/shared/observability/observability.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
pnpm audit:repo
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/shared/observability apps/api/src/shared/http apps/api/src/app.ts apps/api/src/server.ts docs/operations/observability.md docs/build-from-source.md CHANGELOG.md
git commit -m "feat(observability): add pii-safe logs and metrics"
```

---

### Task 5: Authorization Matrix and Ownership Regression Gate

**Files:**
- Create: `docs/security/authorization-matrix.md`
- Create: `scripts/dev/authorization-matrix-check.mjs`
- Modify: `package.json`
- Modify: `Makefile`
- Modify: existing API tests where coverage gaps are found:
  - `apps/api/src/modules/customer/tests/customer.api.integration.test.ts`
  - `apps/api/src/modules/cart/tests/cart.api.integration.test.ts`
  - `apps/api/src/modules/checkout/tests/checkout.api.test.ts`
  - `apps/api/src/modules/order/tests/order.api.test.ts`
  - `apps/api/src/modules/payment/tests/*.test.ts`
  - `apps/api/src/modules/crm/tests/*.test.ts`
  - `apps/api/src/modules/support/tests/*.test.ts`
  - `apps/api/src/modules/reporting/tests/*.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing staff auth middleware, customer session middleware, module route tests.
- Produces: `pnpm check:authorization-matrix`.
- Produces a markdown matrix that maps role/resource/action to allow/deny.

- [ ] **Step 1: Write authorization matrix document**

Create `docs/security/authorization-matrix.md` with tables:

```markdown
| Audience | Role/session | Resource | Action | Decision |
| --- | --- | --- | --- | --- |
| staff | administrator | catalog | create/update/publish/archive | allow |
| staff | catalog_manager | catalog | create/update/publish/archive | allow |
| staff | inventory_operator | catalog | create/update/publish/archive | deny |
| customer | customer session | account | read/update own profile | allow |
| customer | customer session | account | read/update another profile | deny |
| public | anonymous | cart | read empty anonymous cart | allow |
| public | anonymous | cart mutation | add/update/remove | deny |
| provider | SePay IPN secret | payment webhook | ingest valid event | allow |
| public | missing/invalid IPN secret | payment webhook | ingest event | deny |
```

Fill all existing roles: `administrator`, `catalog_manager`, `inventory_operator`, `operations_manager`, `finance_operator`, `crm_operator`, `support_operator`, `executive_viewer`, `customer`, `guest`, `anonymous`, and `provider`.

- [ ] **Step 2: Write failing matrix checker**

Create `scripts/dev/authorization-matrix-check.mjs`:

```js
#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from "node:fs";

const matrix = readFileSync("docs/security/authorization-matrix.md", "utf8");
const requiredFragments = [
  "administrator",
  "catalog_manager",
  "inventory_operator",
  "operations_manager",
  "finance_operator",
  "crm_operator",
  "support_operator",
  "executive_viewer",
  "customer session",
  "guest",
  "anonymous",
  "SePay IPN secret",
  "| deny |",
  "| allow |",
];
for (const fragment of requiredFragments) {
  if (!matrix.includes(fragment)) throw new Error(`Authorization matrix missing ${fragment}`);
}
console.info("Authorization matrix check passed.");
```

Add root script:

```json
"check:authorization-matrix": "node scripts/dev/authorization-matrix-check.mjs"
```

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm check:authorization-matrix
```

Expected: FAIL until the matrix contains every required role/audience.

- [ ] **Step 4: Add missing API regressions only where gaps exist**

Audit existing tests with:

```bash
rg -n "expect\\((401|403)|\\.expect\\((401|403)" apps/api/src/modules -g '*.test.ts'
```

For each uncovered matrix row, add the smallest API or service test. Example for a denied customer account read:

```ts
await request(app)
  .get("/v1/storefront/account")
  .set("Cookie", "opendx_customer=foreign-or-invalid-token")
  .expect(401);
```

Example for role denial:

```ts
await request(app)
  .get("/v1/admin/reporting/customers")
  .set("Authorization", bearerTokenFor("support_operator"))
  .expect(403);
```

Do not duplicate tests that already prove the same resource/action decision.

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm check:authorization-matrix
pnpm --filter @opendx/api test
pnpm --filter @opendx/api test:integration
git diff --check
pnpm audit:repo
```

Expected: all pass. If integration infrastructure is unavailable, stop and report it; do not claim the matrix is fully verified.

- [ ] **Step 6: Commit**

```bash
git add docs/security/authorization-matrix.md scripts/dev/authorization-matrix-check.mjs package.json Makefile apps/api/src/modules CHANGELOG.md
git commit -m "test(security): document authorization matrix"
```

---

### Task 6: Payment Threat Model and Production Acceptance Guard

**Files:**
- Create: `docs/security/payment-threat-model.md`
- Create: `scripts/dev/sepay-production-acceptance.mjs`
- Create: `scripts/dev/sepay-production-acceptance.test.mjs`
- Modify: `scripts/dev/sepay-sandbox-acceptance.mjs` only if shared helper extraction is needed
- Modify: `package.json`
- Modify: `Makefile`
- Modify: payment tests if coverage gaps are found:
  - `apps/api/src/modules/payment/**/*.test.ts`
  - `apps/api/src/modules/checkout/**/*.test.ts`
- Modify: `docs/integrations/sepay.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing SePay sandbox acceptance and payment module threat regressions.
- Produces: `pnpm check:sepay-production` script that refuses to run unless all production guard env vars are present.
- Produces: opt-in Make target `check-sepay-production`.

- [ ] **Step 1: Write failing guard tests**

Create `scripts/dev/sepay-production-acceptance.test.mjs`:

```js
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateProductionAcceptanceEnvironment } from "./sepay-production-acceptance.mjs";

test("production acceptance refuses to run without explicit human confirmation", () => {
  assert.throws(() => validateProductionAcceptanceEnvironment({
    SEPAY_ENVIRONMENT: "production",
    PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION: "",
  }), /confirmation/i);
});

test("production acceptance refuses unsafe or tiny amount", () => {
  assert.throws(() => validateProductionAcceptanceEnvironment({
    SEPAY_ENVIRONMENT: "production",
    PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION: "I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT",
    PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND: "9999",
    STOREFRONT_URL: "https://shop.example.com",
    API_BASE_URL: "https://api.example.com",
  }), /amount/i);
});

test("production acceptance accepts explicit safe minimum configuration", () => {
  assert.deepEqual(validateProductionAcceptanceEnvironment({
    SEPAY_ENVIRONMENT: "production",
    PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION: "I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT",
    PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND: "10000",
    STOREFRONT_URL: "https://shop.merchant.example",
    API_BASE_URL: "https://api.merchant.example",
  }), {
    amountVnd: 10000,
    storefrontUrl: "https://shop.merchant.example",
    apiBaseUrl: "https://api.merchant.example",
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/dev/sepay-production-acceptance.test.mjs
```

Expected: FAIL because the production acceptance module does not exist.

- [ ] **Step 3: Implement guard-only runner first**

Create `scripts/dev/sepay-production-acceptance.mjs` with exported validator:

```js
export function validateProductionAcceptanceEnvironment(env) {
  if (env.SEPAY_ENVIRONMENT !== "production") throw new Error("SEPAY_ENVIRONMENT must be production");
  if (env.PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION !== "I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT") {
    throw new Error("Production SePay acceptance requires explicit human confirmation");
  }
  const amountVnd = Number(env.PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND);
  if (!Number.isInteger(amountVnd) || amountVnd < 10_000) {
    throw new Error("Production SePay acceptance amount must be at least 10000 VND");
  }
  for (const key of ["STOREFRONT_URL", "API_BASE_URL"]) {
    const value = env[key];
    if (value === undefined || !value.startsWith("https://") || value.includes("example.com")) {
      throw new Error(`${key} must be a real HTTPS URL`);
    }
  }
  return {
    amountVnd,
    storefrontUrl: env.STOREFRONT_URL,
    apiBaseUrl: env.API_BASE_URL,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = validateProductionAcceptanceEnvironment(process.env);
  console.info(JSON.stringify({
    status: "blocked_until_manual_flow_is_implemented",
    amountVnd: config.amountVnd,
    storefrontUrl: "[REDACTED]",
    apiBaseUrl: "[REDACTED]",
  }));
}
```

Later in this task, replace the blocked status with the existing browser/API flow only if real hosted prerequisites are available. Do not fake a production payment.

- [ ] **Step 4: Add threat-model docs**

Create `docs/security/payment-threat-model.md` with a table:

```markdown
| Threat | Control | Evidence |
| --- | --- | --- |
| Forged IPN | `X-Secret-Key` checked before business processing | payment IPN tests |
| Replay | provider IDs and invoice dedupe | payment tests |
| Amount tampering | backend recalculates cart/order and validates amount | checkout/payment tests |
| Idempotency collision | request fingerprint comparison | checkout tests |
| Secret leakage | redacted logs and no raw payload evidence | observability/payment tests |
| Production misuse | opt-in confirmation and minimum amount guard | sepay production acceptance tests |
```

Reference existing tests by command, not by unverified line claims.

- [ ] **Step 5: Add package and Make scripts**

Add:

```json
"test:sepay-production-acceptance": "node --test scripts/dev/sepay-production-acceptance.test.mjs",
"check:sepay-production": "pnpm test:sepay-production-acceptance && node scripts/dev/sepay-production-acceptance.mjs"
```

Add Make target:

```make
check-sepay-production:
	pnpm check:sepay-production
```

This target is intentionally opt-in and should fail without production env.

- [ ] **Step 6: Add or verify payment regressions**

Run:

```bash
pnpm --filter @opendx/api test -- src/modules/payment src/modules/checkout
```

If no tests directly cover forged IPN, replay, amount mismatch, idempotency conflict, and redaction, add the smallest focused tests in the owning module. Use existing payment fixture helpers where available; do not create a new payment framework.

- [ ] **Step 7: Run GREEN**

Run:

```bash
pnpm test:sepay-production-acceptance
pnpm --filter @opendx/api test -- src/modules/payment src/modules/checkout
git diff --check
pnpm audit:repo
```

Expected: guard tests and payment focused tests pass. `pnpm check:sepay-production` may fail without production env; document that as expected in `docs/integrations/sepay.md`.

- [ ] **Step 8: Commit**

```bash
git add docs/security/payment-threat-model.md docs/integrations/sepay.md scripts/dev/sepay-production-acceptance.mjs scripts/dev/sepay-production-acceptance.test.mjs package.json Makefile apps/api/src/modules/payment apps/api/src/modules/checkout CHANGELOG.md
git commit -m "test(payment): add production sepay safety gate"
```

---

### Task 7: PostgreSQL and MinIO Backup/Restore Operations

**Files:**
- Create: `scripts/ops/postgres-backup.sh`
- Create: `scripts/ops/postgres-restore.sh`
- Create: `scripts/ops/minio-backup.sh`
- Create: `scripts/ops/minio-restore.sh`
- Create: `scripts/dev/backup-restore-check.mjs`
- Modify: `Makefile`
- Create: `docs/operations/backup-restore.md`
- Modify: `docs/development/database-operations.md`
- Modify: `docs/build-from-source.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces safe ops scripts with explicit arguments and path validation.
- Produces Make targets:
  - `backup-postgres`
  - `restore-postgres`
  - `backup-minio`
  - `restore-minio`
  - `check-backup-restore`
- Produces `pnpm check:backup-restore`.

- [ ] **Step 1: Write failing script safety check**

Create `scripts/dev/backup-restore-check.mjs`:

```js
#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from "node:fs";

for (const path of [
  "scripts/ops/postgres-backup.sh",
  "scripts/ops/postgres-restore.sh",
  "scripts/ops/minio-backup.sh",
  "scripts/ops/minio-restore.sh",
]) {
  const source = readFileSync(path, "utf8");
  if (!source.includes("set -euo pipefail")) throw new Error(`${path} must fail closed`);
  if (!source.includes("SPDX-License-Identifier: Apache-2.0")) throw new Error(`${path} missing SPDX`);
  if (source.includes("rm -rf $") || source.includes("rm -rf \"${")) {
    throw new Error(`${path} must not use recursive deletion through variables`);
  }
  if (!source.includes("realpath")) throw new Error(`${path} must resolve target paths`);
}
console.info("Backup/restore safety check passed.");
```

- [ ] **Step 2: Run RED**

Run:

```bash
node scripts/dev/backup-restore-check.mjs
```

Expected: FAIL because ops scripts do not exist.

- [ ] **Step 3: Implement PostgreSQL backup**

Create `postgres-backup.sh`:

```bash
#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

backup_dir="${BACKUP_DIR:?BACKUP_DIR is required}"
database_url="${DATABASE_URL:?DATABASE_URL is required}"
retention_days="${BACKUP_RETENTION_DAYS:-7}"
resolved_dir="$(realpath -m "$backup_dir")"
case "$resolved_dir" in
  */infra/backups|*/infra/backups/*|*/opendx-backups|*/opendx-backups/*) ;;
  *) echo "Backup directory must be an explicit OpenDX backup directory: $resolved_dir" >&2; exit 1 ;;
esac
mkdir -p "$resolved_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$resolved_dir/opendx-postgres-$timestamp.dump"
tmp="$target.partial"
pg_dump "$database_url" --format=custom --file="$tmp"
test -s "$tmp"
mv "$tmp" "$target"
find "$resolved_dir" -maxdepth 1 -type f -name 'opendx-postgres-*.dump' -mtime "+$retention_days" -print
echo "Created $target"
```

Do not delete retention files in the first implementation unless the plan step adds explicit dry-run and target count tests. Listing expired files is safer for MVP readiness.

- [ ] **Step 4: Implement PostgreSQL restore**

Create `postgres-restore.sh` requiring:

```bash
BACKUP_FILE
TARGET_DATABASE_URL
ALLOW_RESTORE_TO_PRODUCTION must not be true by default
```

Rules:

- `BACKUP_FILE` must resolve to an existing `.dump`.
- `TARGET_DATABASE_URL` must not equal `DATABASE_URL` unless `ALLOW_RESTORE_TO_PRODUCTION=I_UNDERSTAND_THIS_CAN_OVERWRITE_PRODUCTION`.
- Use `pg_restore --clean --if-exists --no-owner --exit-on-error --single-transaction`.
- Print target database host/db name only after redacting password.

- [ ] **Step 5: Implement MinIO backup and restore**

Use `mc mirror` with explicit aliases:

```bash
mc alias set source "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mirror --overwrite "source/$MINIO_BUCKET" "$resolved_dir/product-media"
mc mirror --overwrite "source/$MINIO_SUPPORT_BUCKET" "$resolved_dir/support-attachments"
```

Restore must require `TARGET_MINIO_ENDPOINT`, `TARGET_MINIO_ACCESS_KEY`, `TARGET_MINIO_SECRET_KEY`, and target buckets. It must reject target equal to source unless `ALLOW_RESTORE_TO_PRODUCTION=I_UNDERSTAND_THIS_CAN_OVERWRITE_PRODUCTION`.

- [ ] **Step 6: Wire Make and docs**

Add Make targets that call scripts, not inline complex restore logic:

```make
backup-postgres:
	bash scripts/ops/postgres-backup.sh
```

Document all required env vars in `docs/operations/backup-restore.md`.

- [ ] **Step 7: Run GREEN**

Run:

```bash
node scripts/dev/backup-restore-check.mjs
bash -n scripts/ops/postgres-backup.sh scripts/ops/postgres-restore.sh scripts/ops/minio-backup.sh scripts/ops/minio-restore.sh
git diff --check
pnpm audit:repo
```

If local `pg_dump`, `pg_restore`, or `mc` are installed, also run a disposable target restore. If not installed, record that the script syntax/safety gate passed and full runtime restore is covered by Task 12 exit gate.

- [ ] **Step 8: Commit**

```bash
git add scripts/ops scripts/dev/backup-restore-check.mjs Makefile docs/operations/backup-restore.md docs/development/database-operations.md docs/build-from-source.md CHANGELOG.md
git commit -m "feat(ops): add backup and restore runbooks"
```

---

### Task 8: Accessibility and Performance Gates

**Files:**
- Create: `scripts/dev/phase8-accessibility-check.mjs`
- Create: `scripts/dev/phase8-performance-check.mjs`
- Modify: `package.json`
- Modify: `Makefile`
- Modify: `docs/build-from-source.md`
- Modify: `docs/operations/observability.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: running local Storefront, Console, API.
- Produces:
  - `pnpm check:phase8-accessibility`
  - `pnpm check:phase8-performance`
  - Make targets with same names prefixed by `check-`.

- [ ] **Step 1: Write accessibility check**

Base this script on existing browser checks, especially:

```bash
scripts/dev/storefront-browser-check.mjs
scripts/dev/console-browser-check.mjs
scripts/dev/crm-support-dashboard-browser-check.mjs
```

Create checks for:

- Storefront `/`, `/cart`, `/account`, `/checkout`, `/payment/return`, `/orders`.
- Console orders, payments, customers, support, dashboard routes using existing deterministic browser fixture strategy.
- Viewports `390x844`, `768x1024`, `1440x900`.
- Semantic `main`, visible focus after Tab, no horizontal overflow.
- Alerts/status areas for blocked unauthenticated flows.

Use no new npm dependency. Continue using Chrome DevTools Protocol.

- [ ] **Step 2: Write performance check**

Create `scripts/dev/phase8-performance-check.mjs` using Node `fetch` and `performance.now()`:

```js
const targets = [
  { name: "catalog", url: `${apiBaseUrl}/v1/storefront/products?pageSize=12`, p95Ms: 300 },
  { name: "categories", url: `${apiBaseUrl}/v1/storefront/categories`, p95Ms: 300 },
  { name: "anonymous-cart", url: `${apiBaseUrl}/v1/storefront/cart`, p95Ms: 300 },
];
```

Run each target 20 times sequentially, compute p95, fail if p95 exceeds target. Add reporting/dashboard targets only when a deterministic staff token fixture already exists in the repo; otherwise test them through existing Phase 7 focused exit script and document the linkage.

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm check:phase8-accessibility
pnpm check:phase8-performance
```

Expected: FAIL because scripts and package entries do not exist.

- [ ] **Step 4: Wire package and Make scripts**

Add:

```json
"check:phase8-accessibility": "node scripts/dev/phase8-accessibility-check.mjs",
"check:phase8-performance": "node scripts/dev/phase8-performance-check.mjs"
```

Add Make targets:

```make
check-phase8-accessibility:
	pnpm check:phase8-accessibility

check-phase8-performance:
	pnpm check:phase8-performance
```

- [ ] **Step 5: Run GREEN**

With the stack running:

```bash
pnpm check:phase8-accessibility
pnpm check:phase8-performance
git diff --check
pnpm audit:repo
```

Expected: all pass. If Chrome is unavailable, report browser check as blocked and do not mark Phase 8 complete.

- [ ] **Step 6: Commit**

```bash
git add scripts/dev/phase8-accessibility-check.mjs scripts/dev/phase8-performance-check.mjs package.json Makefile docs/build-from-source.md docs/operations/observability.md CHANGELOG.md
git commit -m "test(phase8): add accessibility and performance gates"
```

---

### Task 9: CI and Security Workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/security.yml`
- Create: `scripts/audit/env-example-check.mjs`
- Create: `scripts/audit/no-secret-fixtures.mjs`
- Modify: `package.json`
- Modify: `docs/build-from-source.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces default CI with no deploy.
- Produces security workflow with repository-owned checks only.
- Produces scripts:
  - `pnpm audit:env`
  - `pnpm audit:secrets`

- [ ] **Step 1: Write audit scripts**

Create `scripts/audit/env-example-check.mjs` that compares production env docs and `.env.example` for required names from Task 1:

```js
const required = ["OPENDX_ENV", "LOG_FORMAT", "LOG_LEVEL", "METRICS_ENABLED", "READINESS_TIMEOUT_MS", "JSON_BODY_LIMIT", "PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND"];
```

Fail if any required name is absent.

Create `scripts/audit/no-secret-fixtures.mjs` to scan committed text files for known dangerous patterns:

```js
const forbidden = [/spsk_(live|test)_[A-Za-z0-9]/, /postgres:\/\/[^:\s]+:[^@\s]+@[^/\s]+\/[^\s]+/];
```

Allow `.env.example` placeholder values only. Do not read ignored `.env`.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm audit:env
pnpm audit:secrets
```

Expected: FAIL because scripts are not wired.

- [ ] **Step 3: Add workflows**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [develop, phuong, main]
jobs:
  source:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"
      - run: corepack enable
      - run: corepack prepare pnpm@11.18.0 --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:ts
      - run: pnpm audit:repo
      - run: pnpm check:production-compose
```

Create `.github/workflows/security.yml`:

```yaml
name: Security
on:
  pull_request:
  push:
    branches: [develop, phuong, main]
jobs:
  repository-policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"
      - run: corepack enable
      - run: corepack prepare pnpm@11.18.0 --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit:env
      - run: pnpm audit:secrets
      - run: pnpm audit:repo
```

No SSH keys, server IPs, or deployment secrets are referenced.

- [ ] **Step 4: Wire scripts**

Add:

```json
"audit:env": "node scripts/audit/env-example-check.mjs",
"audit:secrets": "node scripts/audit/no-secret-fixtures.mjs"
```

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm audit:env
pnpm audit:secrets
pnpm check:production-compose
git diff --check
pnpm audit:repo
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows scripts/audit package.json docs/build-from-source.md SECURITY.md CHANGELOG.md
git commit -m "ci: add phase eight source security checks"
```

---

### Task 10: Phase 8 Full Exit Preflight and Documentation Closure

**Files:**
- Create: `scripts/dev/phase8-exit-check.mjs`
- Create: `scripts/dev/phase8-exit-check.test.mjs`
- Modify: `package.json`
- Modify: `Makefile`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `docs/architecture/mvp-phases.md`
- Modify: `docs/product/vision.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/deployment/production.md`
- Modify: `docs/operations/backup-restore.md`
- Modify: `docs/operations/observability.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces `pnpm check:phase8-exit`.
- Produces Make target `check-phase8-exit`.
- Produces Phase 8 roadmap evidence and closure criteria.

- [ ] **Step 1: Write failing exit-check tests**

Create `scripts/dev/phase8-exit-check.test.mjs`:

```js
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import test from "node:test";
import assert from "node:assert/strict";
import { plannedCommands } from "./phase8-exit-check.mjs";

test("phase 8 exit check keeps production payment opt-in out of default gate", () => {
  assert(!plannedCommands().some((command) => command.includes("check:sepay-production")));
});

test("phase 8 exit check includes hardening, backup, accessibility, performance, and source gates", () => {
  const commands = plannedCommands().join("\n");
  for (const expected of [
    "pnpm check:production-compose",
    "pnpm check:authorization-matrix",
    "pnpm test:sepay-production-acceptance",
    "node scripts/dev/backup-restore-check.mjs",
    "pnpm check:phase8-accessibility",
    "pnpm check:phase8-performance",
    "pnpm audit:repo",
  ]) {
    assert(commands.includes(expected), `missing ${expected}`);
  }
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/dev/phase8-exit-check.test.mjs
```

Expected: FAIL because the exit check module does not exist.

- [ ] **Step 3: Implement exit preflight runner**

Create `scripts/dev/phase8-exit-check.mjs`:

```js
#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from "node:child_process";

export function plannedCommands() {
  return [
    "pnpm check:production-compose",
    "pnpm check:authorization-matrix",
    "pnpm test:sepay-production-acceptance",
    "node scripts/dev/backup-restore-check.mjs",
    "pnpm check:phase8-accessibility",
    "pnpm check:phase8-performance",
    "pnpm audit:env",
    "pnpm audit:secrets",
    "pnpm audit:repo",
    "git diff --check",
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runId = `phase8-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  console.info(`Phase 8 exit preflight ${runId}`);
  for (const command of plannedCommands()) {
    console.info(`Running: ${command}`);
    const result = spawnSync(command, { shell: true, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  console.info(`Phase 8 exit preflight passed: ${runId}`);
}
```

Keep production SePay real acceptance out of this default runner.

- [ ] **Step 4: Wire package and Make**

Add:

```json
"test:phase8-exit": "node --test scripts/dev/phase8-exit-check.test.mjs",
"check:phase8-exit": "pnpm test:phase8-exit && node scripts/dev/phase8-exit-check.mjs"
```

Add Make target:

```make
check-phase8-exit:
	pnpm check:phase8-exit
```

- [ ] **Step 5: Update closure docs**

Update roadmap status:

```markdown
- Phase 8 focused design: `docs/superpowers/specs/2026-08-10-commerce-hardening-hosting-design.md`.
- Phase 8 implementation plan: `docs/superpowers/plans/2026-08-10-commerce-hardening-hosting.md`.
- Phase 8 remains in progress until `pnpm check:phase8-exit`, full local commerce acceptance, and explicit production SePay acceptance decision are recorded.
```

Update `docs/architecture/mvp-phases.md` and `docs/product/vision.md` to state that Phase 8 is the current active phase until exit evidence exists.

- [ ] **Step 6: Run GREEN**

Run:

```bash
pnpm test:phase8-exit
pnpm check:phase8-exit
pnpm check
git diff --check
pnpm audit:repo
```

Expected: all pass. If `pnpm check:phase8-exit` is blocked by missing Chrome, Docker, or local services, capture the exact blocker and do not mark Phase 8 complete.

- [ ] **Step 7: Optional production SePay real acceptance**

Only if a real VPS, real HTTPS domains, real merchant credentials, and explicit human confirmation are available, run:

```bash
PRODUCTION_SEPAY_ACCEPTANCE_CONFIRMATION=I_UNDERSTAND_THIS_CREATES_A_REAL_PAYMENT \
PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND=10000 \
SEPAY_ENVIRONMENT=production \
pnpm check:sepay-production
```

Expected: either pass with redacted evidence or fail with a redacted operational reason. Do not run this in default CI or without the explicit confirmation value.

- [ ] **Step 8: Commit**

```bash
git add scripts/dev/phase8-exit-check.mjs scripts/dev/phase8-exit-check.test.mjs package.json Makefile docs/roadmap/mvp-status.md docs/architecture/mvp-phases.md docs/product/vision.md docs/build-from-source.md docs/deployment/production.md docs/operations/backup-restore.md docs/operations/observability.md CHANGELOG.md
git commit -m "docs(phase8): add exit preflight"
```

---

## Final Phase 8 Completion Checklist

Only after all tasks above are committed:

- [ ] Run `git log --oneline` and record the Phase 8 commit range.
- [ ] Run `pnpm check:phase8-exit`.
- [ ] Run `pnpm check`.
- [ ] Run the full local commerce acceptance command documented in `docs/build-from-source.md`.
- [ ] Record whether production SePay acceptance was run or blocked by missing real merchant/VPS prerequisites.
- [ ] Update `docs/roadmap/mvp-status.md` with exact dates, command names, and pass/block evidence.
- [ ] Update `CHANGELOG.md` with the final Phase 8 closure entry.
- [ ] Run `git diff --check`.
- [ ] Run `pnpm audit:repo`.
- [ ] Commit closure with `docs(phase8): complete hardening readiness`.

Do not mark Phase 8 complete because files exist or partial tests pass. Phase 8 closes only when the exit gate evidence exists.

