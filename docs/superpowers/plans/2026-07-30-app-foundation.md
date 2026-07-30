<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a runnable OpenDX CompanyOS application foundation with console, API, AI runtime, shared packages, local infrastructure, validation commands, and development documentation.

**Architecture:** Use pnpm workspaces without Nx or Turborepo. Create useful directories only: `apps/console`, `apps/api`, `services/ai-runtime`, `packages/config`, `packages/domain`, `packages/ui`, `infra/docker`, `scripts/audit`, and `scripts/dev`.

**Tech Stack:** Node 22, pnpm 11.18.0 through Corepack, Next.js 16.2.12, React 19.2.8, Express 5.2.1, TypeScript 7.0.2, Vitest 4.1.10, Python 3.13, FastAPI 0.141.1, uvicorn 0.52.0, pytest 9.1.1, Docker Compose.

## Global Constraints

- Phase 1 creates runnable service shells and validation, not Company Core business logic.
- Use `apps/console`, not `apps/web`.
- Use `services/ai-runtime`, not a generic `services/ai`.
- Do not create empty `modules/*` directories in Phase 1.
- Do not add Nx, Turborepo, or another monorepo orchestration tool.
- Frontend shell must use the approved Linear-style dark product canvas with canvas `#010102` and sparse accent `#5e6ad2`.
- Frontend shell must be an operational console, not a marketing landing page.
- API health response is `{"status":"ok","service":"opendx-api"}`.
- AI runtime health response is `{"status":"ok","service":"opendx-ai-runtime"}`.
- Do not commit real secrets, private endpoints, `.env`, signing keys, personal data, or production dumps.
- Every repository-changing unit updates `CHANGELOG.md` under `[Unreleased]`.
- Every new license-capable file includes SPDX headers where the format supports comments.
- README commands must match commands verified during implementation.

---

## File Structure

Create or modify these files:

- Root workspace: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`.
- Shared packages: `packages/config/*`, `packages/domain/*`, `packages/ui/*`.
- API: `apps/api/*`.
- Console: `apps/console/*`.
- AI runtime: `services/ai-runtime/*`.
- Infrastructure: `infra/docker/docker-compose.yml`, `infra/docker/README.md`.
- Scripts: `scripts/audit/repo.sh`, `scripts/dev/check.sh`.
- Documentation and tracking: `README.md`, `CHANGELOG.md`, `docs/roadmap/mvp-status.md`.

### Task 1: Workspace and Shared Packages

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `packages/config/package.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/src/index.test.ts`
- Create: `packages/config/tsconfig.json`
- Create: `packages/domain/package.json`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/index.test.ts`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/ui/package.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/index.test.ts`
- Create: `packages/ui/tsconfig.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `@opendx/config`, `@opendx/domain`, and `@opendx/ui`.
- Later tasks consume: `@opendx/ui` design tokens in `apps/console`, `@opendx/domain` service names in health checks.

- [ ] **Step 1: Create root workspace files**

Create `package.json`:

```json
{
  "name": "opendx-companyos",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@11.18.0",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "audit:repo": "bash scripts/audit/repo.sh",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:ts": "pnpm --filter './packages/**' --filter './apps/**' test",
    "test:py": "cd services/ai-runtime && python3 -m pytest",
    "check": "bash scripts/dev/check.sh"
  },
  "devDependencies": {
    "@types/node": "^26.1.2",
    "typescript": "^7.0.2",
    "vitest": "^4.1.10"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

Create `.env.example`:

```dotenv
# Local development sample values only. Do not commit .env.

OPENDX_ENV=development

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=opendx
POSTGRES_USER=opendx_local
POSTGRES_PASSWORD=opendx_local_password

KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=opendx
KEYCLOAK_ADMIN=opendx_admin
KEYCLOAK_ADMIN_PASSWORD=opendx_admin_password

TEMPORAL_ADDRESS=localhost:7233

MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=opendx_minio
MINIO_SECRET_KEY=opendx_minio_password
```

- [ ] **Step 2: Write package tests first**

Create `packages/domain/src/index.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SERVICE_NAMES, makeCompanyScopedId } from "./index";

describe("domain contracts", () => {
  it("exposes stable service names", () => {
    expect(SERVICE_NAMES.api).toBe("opendx-api");
    expect(SERVICE_NAMES.aiRuntime).toBe("opendx-ai-runtime");
  });

  it("creates company-scoped identifiers", () => {
    expect(makeCompanyScopedId("company_123", "department_456")).toBe(
      "company_123:department_456",
    );
  });
});
```

Create `packages/config/src/index.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { readStringEnv } from "./index";

describe("readStringEnv", () => {
  it("returns the configured value", () => {
    expect(readStringEnv({ OPENDX_ENV: "development" }, "OPENDX_ENV")).toBe(
      "development",
    );
  });

  it("returns the fallback for a missing value", () => {
    expect(readStringEnv({}, "OPENDX_ENV", "test")).toBe("test");
  });
});
```

Create `packages/ui/src/index.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { opendxColors } from "./index";

describe("opendxColors", () => {
  it("keeps the approved dark canvas and accent", () => {
    expect(opendxColors.canvas).toBe("#010102");
    expect(opendxColors.primary).toBe("#5e6ad2");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install
pnpm --filter @opendx/domain test
pnpm --filter @opendx/config test
pnpm --filter @opendx/ui test
```

Expected: package tests fail because package manifests and implementations are not created yet.

- [ ] **Step 4: Create shared package implementations**

Create `packages/domain/package.json`:

```json
{
  "name": "@opendx/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "lint": "tsc --project tsconfig.json --noEmit",
    "typecheck": "tsc --project tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.1.10"
  }
}
```

Create `packages/domain/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

Create `packages/domain/src/index.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export const SERVICE_NAMES = {
  api: "opendx-api",
  aiRuntime: "opendx-ai-runtime",
} as const;

export type CompanyId = `company_${string}`;

export function makeCompanyScopedId(companyId: string, resourceId: string): string {
  return `${companyId}:${resourceId}`;
}
```

Create `packages/config/package.json`:

```json
{
  "name": "@opendx/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "lint": "tsc --project tsconfig.json --noEmit",
    "typecheck": "tsc --project tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.1.10"
  }
}
```

Create `packages/config/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

Create `packages/config/src/index.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type EnvSource = Record<string, string | undefined>;

export function readStringEnv(
  env: EnvSource,
  key: string,
  fallback = "",
): string {
  return env[key] ?? fallback;
}
```

Create `packages/ui/package.json`:

```json
{
  "name": "@opendx/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "lint": "tsc --project tsconfig.json --noEmit",
    "typecheck": "tsc --project tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.1.10"
  }
}
```

Create `packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

Create `packages/ui/src/index.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export const opendxColors = {
  canvas: "#010102",
  primary: "#5e6ad2",
  primaryHover: "#828fff",
  primaryFocus: "#5e69d1",
  ink: "#f7f8f8",
  inkMuted: "#d0d6e0",
  inkSubtle: "#8a8f98",
  inkTertiary: "#62666d",
  surface1: "#0f1011",
  surface2: "#141516",
  surface3: "#18191a",
  surface4: "#191a1b",
  hairline: "#23252a",
  hairlineStrong: "#34343a",
  hairlineTertiary: "#3e3e44",
} as const;
```

- [ ] **Step 5: Run package validation**

Run:

```bash
pnpm --filter @opendx/domain test
pnpm --filter @opendx/config test
pnpm --filter @opendx/ui test
pnpm --filter @opendx/domain typecheck
pnpm --filter @opendx/config typecheck
pnpm --filter @opendx/ui typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 6: Update changelog and commit**

Add to `CHANGELOG.md` under `[Unreleased]` / `### Added`:

```markdown
- Add the pnpm workspace and initial shared packages for configuration, domain contracts, and UI tokens.
```

Run:

```bash
git diff --check
git add package.json pnpm-workspace.yaml tsconfig.base.json .env.example packages/config packages/domain packages/ui CHANGELOG.md
git diff --cached --stat
git diff --cached
git commit -m "build(workspace): add pnpm workspace and shared packages"
```

Expected: one atomic commit containing root workspace files, shared packages, tests, and changelog entry.

### Task 2: API Health Shell

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/app.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `@opendx/domain` `SERVICE_NAMES.api`.
- Produces: Express app with `GET /health` for local API validation.

- [ ] **Step 1: Write failing API health test**

Create `apps/api/src/app.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "./app";

describe("api health", () => {
  it("returns deterministic health JSON", async () => {
    const response = await request(createApiApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "opendx-api",
    });
  });
});
```

- [ ] **Step 2: Run API test to verify it fails**

Run:

```bash
pnpm --filter @opendx/api test
```

Expected: command fails because `apps/api/package.json` and `createApiApp` are not created yet.

- [ ] **Step 3: Create API package and implementation**

Create `apps/api/package.json`:

```json
{
  "name": "@opendx/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "lint": "tsc --project tsconfig.json --noEmit",
    "typecheck": "tsc --project tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@opendx/domain": "workspace:*",
    "express": "^5.2.1"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/supertest": "^7.2.1",
    "supertest": "^7.2.2",
    "tsx": "^4.23.1",
    "vitest": "^4.1.10"
  }
}
```

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/api/src/app.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import { SERVICE_NAMES } from "@opendx/domain";

export function createApiApp() {
  const app = express();

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: SERVICE_NAMES.api,
    });
  });

  return app;
}
```

Create `apps/api/src/server.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createApiApp } from "./app";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const app = createApiApp();

app.listen(port, () => {
  console.log(`OpenDX API listening on http://localhost:${port}`);
});
```

- [ ] **Step 4: Run API validation**

Run:

```bash
pnpm install
pnpm --filter @opendx/api test
pnpm --filter @opendx/api typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 5: Update changelog and commit**

Add to `CHANGELOG.md`:

```markdown
- Add the Express API shell with deterministic health endpoint tests.
```

Run:

```bash
git diff --check
git add apps/api CHANGELOG.md pnpm-lock.yaml
git diff --cached --stat
git diff --cached
git commit -m "feat(api): add health shell"
```

Expected: one atomic commit containing API package, tests, lockfile update, and changelog entry.

### Task 3: AI Runtime Health Shell

**Files:**
- Create: `services/ai-runtime/pyproject.toml`
- Create: `services/ai-runtime/app/__init__.py`
- Create: `services/ai-runtime/app/main.py`
- Create: `services/ai-runtime/tests/test_health.py`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: FastAPI app with `GET /health`.
- Later phases consume: `services/ai-runtime/app/main.py` for AI service extension.

- [ ] **Step 1: Write failing AI runtime test**

Create `services/ai-runtime/tests/test_health.py`:

```python
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_returns_service_status() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "opendx-ai-runtime",
    }
```

- [ ] **Step 2: Run AI runtime test to verify it fails**

Run:

```bash
cd services/ai-runtime && python3 -m pytest
```

Expected: command fails because `pyproject.toml` and `app.main` are not created yet.

- [ ] **Step 3: Create AI runtime package and implementation**

Create `services/ai-runtime/pyproject.toml`:

```toml
[project]
name = "opendx-ai-runtime"
version = "0.0.0"
requires-python = ">=3.13"
dependencies = [
  "fastapi==0.141.1",
  "httpx==0.28.1",
  "uvicorn==0.52.0",
]

[dependency-groups]
dev = [
  "pytest==9.1.1",
]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

Create `services/ai-runtime/app/__init__.py`:

```python
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0
```

Create `services/ai-runtime/app/main.py`:

```python
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from fastapi import FastAPI

app = FastAPI(title="OpenDX AI Runtime")


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "opendx-ai-runtime",
    }
```

- [ ] **Step 4: Run AI runtime validation**

Run:

```bash
cd services/ai-runtime && python3 -m pip install -e ".[dev]"
cd services/ai-runtime && python3 -m pytest
```

Expected: pytest exits `0`.

- [ ] **Step 5: Update changelog and commit**

Add to `CHANGELOG.md`:

```markdown
- Add the FastAPI AI runtime shell with deterministic health endpoint tests.
```

Run:

```bash
git diff --check
git add services/ai-runtime CHANGELOG.md
git diff --cached --stat
git diff --cached
git commit -m "feat(ai-runtime): add health shell"
```

Expected: one atomic commit containing AI runtime package, tests, and changelog entry.

### Task 4: Console Product Shell

**Files:**
- Create: `apps/console/package.json`
- Create: `apps/console/tsconfig.json`
- Create: `apps/console/next-env.d.ts`
- Create: `apps/console/next.config.ts`
- Create: `apps/console/app/globals.css`
- Create: `apps/console/app/layout.tsx`
- Create: `apps/console/app/page.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `@opendx/ui` `opendxColors`.
- Produces: Next.js operational console shell.

- [ ] **Step 1: Create console package and app shell**

Create `apps/console/package.json`:

```json
{
  "name": "@opendx/console",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "lint": "tsc --project tsconfig.json --noEmit",
    "typecheck": "tsc --project tsconfig.json --noEmit",
    "test": "next build"
  },
  "dependencies": {
    "@opendx/ui": "workspace:*",
    "lucide-react": "^1.28.0",
    "next": "^16.2.12",
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "typescript": "^7.0.2"
  }
}
```

Create `apps/console/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "jsx": "preserve",
    "incremental": true,
    "module": "ESNext",
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `apps/console/next-env.d.ts`:

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is generated by Next.js conventions and kept minimal for TypeScript.
```

Create `apps/console/next.config.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@opendx/ui"],
};

export default nextConfig;
```

Create `apps/console/app/layout.tsx`:

```tsx
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenDX CompanyOS",
  description: "Company-first operating platform for digital companies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/console/app/globals.css`:

```css
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

:root {
  color-scheme: dark;
  --canvas: #010102;
  --surface-1: #0f1011;
  --surface-2: #141516;
  --hairline: #23252a;
  --ink: #f7f8f8;
  --ink-muted: #d0d6e0;
  --ink-subtle: #8a8f98;
  --primary: #5e6ad2;
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  letter-spacing: 0;
}

button,
input,
textarea,
select {
  font: inherit;
}
```

Create `apps/console/app/page.tsx` with a single operational shell using static arrays:

```tsx
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Activity, CheckCircle2, GitBranch, Network, ShieldCheck } from "lucide-react";
import { opendxColors } from "@opendx/ui";

const panels = [
  { label: "Mission Control", value: "Company overview", detail: "Goals, risks, approvals" },
  { label: "Digital Workforce", value: "7 planned agents", detail: "Governed by role and skill" },
  { label: "Workflow Operations", value: "Temporal boundary", detail: "Durable execution planned" },
  { label: "Approval Inbox", value: "Human-governed", detail: "Risk actions wait for approval" },
];

const guardrails = [
  "Company-first modeling",
  "Backend permission enforcement",
  "GraphRAG pre-retrieval filtering",
  "Audit and provenance by default",
];

export default function ConsoleHome() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <div className="eyebrow">OpenDX CompanyOS</div>
          <h1>Company operating console</h1>
          <p>
            A dark, dense product surface for governing companies, workflows,
            digital employees, approvals, graph memory, and audit trails.
          </p>
        </div>
        <div className="status" style={{ borderColor: opendxColors.hairline }}>
          <ShieldCheck size={18} />
          <span>Phase 1 foundation shell</span>
        </div>
      </section>

      <section className="grid" aria-label="Mission control panels">
        {panels.map((panel) => (
          <article className="panel" key={panel.label}>
            <div className="panelLabel">{panel.label}</div>
            <strong>{panel.value}</strong>
            <span>{panel.detail}</span>
          </article>
        ))}
      </section>

      <section className="lower">
        <article className="widePanel">
          <div className="sectionTitle">
            <Activity size={18} />
            Operating timeline
          </div>
          <div className="timelineRow">
            <CheckCircle2 size={16} />
            <span>Repository foundation committed</span>
          </div>
          <div className="timelineRow">
            <GitBranch size={16} />
            <span>Phase-gated specs and plans active</span>
          </div>
          <div className="timelineRow">
            <Network size={16} />
            <span>Company graph and workflow modules remain gated</span>
          </div>
        </article>

        <article className="widePanel">
          <div className="sectionTitle">
            <ShieldCheck size={18} />
            Guardrail gates
          </div>
          <ul>
            {guardrails.map((guardrail) => (
              <li key={guardrail}>{guardrail}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
```

Append CSS classes to `apps/console/app/globals.css`:

```css
.shell {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 40px 0;
}

.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: start;
  margin-bottom: 24px;
}

.eyebrow {
  margin-bottom: 12px;
  color: var(--primary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

h1 {
  max-width: 760px;
  margin: 0;
  font-size: clamp(40px, 8vw, 72px);
  line-height: 1.05;
  letter-spacing: 0;
}

p {
  max-width: 720px;
  color: var(--ink-muted);
  font-size: 18px;
  line-height: 1.55;
}

.status,
.panel,
.widePanel {
  border: 1px solid var(--hairline);
  background: var(--surface-1);
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--ink-muted);
  white-space: nowrap;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.panel,
.widePanel {
  border-radius: 12px;
  padding: 20px;
}

.panel {
  min-height: 148px;
}

.panelLabel,
.widePanel span,
li {
  color: var(--ink-subtle);
}

.panel strong {
  display: block;
  margin: 12px 0 8px;
  font-size: 22px;
  font-weight: 600;
}

.lower {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 12px;
  margin-top: 12px;
}

.sectionTitle,
.timelineRow {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sectionTitle {
  margin-bottom: 18px;
  font-weight: 600;
}

.timelineRow {
  min-height: 38px;
  color: var(--ink-muted);
}

ul {
  display: grid;
  gap: 10px;
  margin: 0;
  padding-left: 18px;
}

@media (max-width: 900px) {
  .hero,
  .lower {
    grid-template-columns: 1fr;
  }

  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .status {
    width: 100%;
    justify-content: center;
  }
}
```

- [ ] **Step 2: Run console validation**

Run:

```bash
pnpm install
pnpm --filter @opendx/console typecheck
pnpm --filter @opendx/console test
```

Expected: typecheck and `next build` exit `0`.

- [ ] **Step 3: Update changelog and commit**

Add to `CHANGELOG.md`:

```markdown
- Add the Next.js console shell using the approved dark operational product canvas.
```

Run:

```bash
git diff --check
git add apps/console CHANGELOG.md pnpm-lock.yaml
git diff --cached --stat
git diff --cached
git commit -m "feat(console): add product shell"
```

Expected: one atomic commit containing console shell, lockfile update, and changelog entry.

### Task 5: Local Infrastructure and Scripts

**Files:**
- Create: `infra/docker/docker-compose.yml`
- Create: `infra/docker/README.md`
- Create: `scripts/audit/repo.sh`
- Create: `scripts/dev/check.sh`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: documented local infrastructure and shared validation scripts.
- Later tasks consume: `pnpm audit:repo` and `pnpm check`.

- [ ] **Step 1: Create infrastructure files**

Create `infra/docker/docker-compose.yml`:

```yaml
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

name: opendx-companyos

services:
  postgres:
    image: pgvector/pgvector:pg18
    environment:
      POSTGRES_DB: opendx
      POSTGRES_USER: opendx_local
      POSTGRES_PASSWORD: opendx_local_password
    ports:
      - "5432:5432"
    volumes:
      - opendx_postgres:/var/lib/postgresql/data

  keycloak:
    image: quay.io/keycloak/keycloak:26.4.2
    command: ["start-dev"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: opendx_admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: opendx_admin_password
    ports:
      - "8080:8080"

  temporal:
    image: temporalio/auto-setup:1.29.1
    environment:
      DB: postgresql
      DB_PORT: 5432
      POSTGRES_USER: opendx_local
      POSTGRES_PWD: opendx_local_password
      POSTGRES_SEEDS: postgres
    depends_on:
      - postgres
    ports:
      - "7233:7233"

  minio:
    image: minio/minio:latest
    command: ["server", "/data", "--console-address", ":9001"]
    environment:
      MINIO_ROOT_USER: opendx_minio
      MINIO_ROOT_PASSWORD: opendx_minio_password
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - opendx_minio:/data

volumes:
  opendx_postgres:
  opendx_minio:
```

Create `infra/docker/README.md`:

```markdown
<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Local Docker Infrastructure

This directory contains local-only infrastructure for OpenDX CompanyOS.

## Services

- PostgreSQL with pgvector target: `localhost:5432`
- Keycloak: `http://localhost:8080`
- Temporal: `localhost:7233`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`

The credentials and MinIO image tag in `docker-compose.yml` are local development choices and must not be reused in production.

## Commands

```bash
docker compose -f infra/docker/docker-compose.yml config
docker compose -f infra/docker/docker-compose.yml up -d
docker compose -f infra/docker/docker-compose.yml down
```
```

- [ ] **Step 2: Create script files**

Create `scripts/audit/repo.sh`:

```bash
#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
```

Create `scripts/dev/check.sh`:

```bash
#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

git diff --check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:py
pnpm audit:repo
docker compose -f infra/docker/docker-compose.yml config >/dev/null
```

Run:

```bash
chmod +x scripts/audit/repo.sh scripts/dev/check.sh
```

- [ ] **Step 3: Validate infrastructure and scripts**

Run:

```bash
pnpm audit:repo
docker compose -f infra/docker/docker-compose.yml config >/dev/null
```

Expected: both commands exit `0`.

- [ ] **Step 4: Update changelog and commit**

Add to `CHANGELOG.md`:

```markdown
- Add local Docker infrastructure and shared audit/check scripts.
```

Run:

```bash
git diff --check
git add infra/docker scripts/audit scripts/dev CHANGELOG.md
git diff --cached --stat
git diff --cached
git commit -m "build(infra): add local docker foundation"
```

Expected: one atomic commit containing infra, scripts, and changelog entry.

### Task 6: README and Roadmap Status

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: all Phase 1 scaffold files and verified commands.
- Produces: accurate development instructions and roadmap status with active spec and plan.

- [ ] **Step 1: Update README development section**

Replace the `## Development` section in `README.md` with:

```markdown
## Development

OpenDX CompanyOS uses a pnpm workspace for TypeScript apps and packages, plus a Python FastAPI service for AI runtime support.

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

### Run Validation

```bash
pnpm check
```

### Run Services

```bash
pnpm --filter @opendx/console dev
pnpm --filter @opendx/api dev
docker compose -f infra/docker/docker-compose.yml up -d
```

AI runtime can be served from `services/ai-runtime` with:

```bash
python3 -m uvicorn app.main:app --reload --port 8000
```
```

- [ ] **Step 2: Update roadmap status**

Set Phase 1 row in `docs/roadmap/mvp-status.md`:

```markdown
| Phase 1: Foundation | In progress | `docs/superpowers/specs/2026-07-30-app-foundation-design.md` | `docs/superpowers/plans/2026-07-30-app-foundation.md` | Not decided |
```

Add to `Latest Validation Evidence`:

```markdown
- Phase 1 plan created; implementation validation begins after scaffold execution.
```

- [ ] **Step 3: Update changelog and commit**

Add to `CHANGELOG.md`:

```markdown
- Document verified Phase 1 development commands and roadmap status.
```

Run:

```bash
git diff --check
git add README.md docs/roadmap/mvp-status.md CHANGELOG.md
git diff --cached --stat
git diff --cached
git commit -m "docs(dev): document foundation commands"
```

Expected: one atomic commit containing README, roadmap status, and changelog updates.

### Task 7: Final Phase 1 Validation

**Files:**
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: all Phase 1 implementation commits.
- Produces: Phase 1 exit decision.

- [ ] **Step 1: Run final validation**

Run:

```bash
git diff --check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:py
pnpm audit:repo
docker compose -f infra/docker/docker-compose.yml config >/dev/null
```

Expected: every command exits `0`.

- [ ] **Step 2: Update roadmap status**

Set Phase 1 row in `docs/roadmap/mvp-status.md`:

```markdown
| Phase 1: Foundation | Complete | `docs/superpowers/specs/2026-07-30-app-foundation-design.md` | `docs/superpowers/plans/2026-07-30-app-foundation.md` | Complete after validation |
```

Add validation evidence:

```markdown
- Phase 1 validation: `git diff --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:py`, `pnpm audit:repo`, and Docker Compose config all passed.
```

- [ ] **Step 3: Commit Phase 1 completion**

Run:

```bash
git add docs/roadmap/mvp-status.md CHANGELOG.md
git diff --cached --stat
git diff --cached
git commit -m "docs(roadmap): mark foundation phase complete"
```

Expected: one atomic commit recording Phase 1 completion.

## Self-Review

Spec coverage:

- Runnable workspace is covered by Task 1.
- API shell is covered by Task 2.
- AI runtime shell is covered by Task 3.
- Console shell is covered by Task 4.
- Local infrastructure is covered by Task 5.
- README and roadmap status are covered by Task 6.
- Final validation and exit decision are covered by Task 7.

Completeness scan:

- Runtime business logic beyond health checks and static console content is out of scope.
- `modules/*` directories are intentionally not created in Phase 1.

Type consistency:

- API health service name matches `SERVICE_NAMES.api`.
- AI runtime health service name matches the approved spec.
- Console consumes `@opendx/ui` design tokens.

Scope:

- This plan implements Phase 1 Foundation only.
