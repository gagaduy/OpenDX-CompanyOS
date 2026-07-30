<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# App Foundation Design

## Purpose

Phase 1 creates the application foundation for OpenDX CompanyOS without implementing deep business behavior. It establishes the repo layout, service shells, local infrastructure, configuration policy, and validation commands needed for later Company Core, workflow, agent, and GraphRAG work.

The foundation must make the intended architecture real enough to run, test, and extend while preserving the Company-first and human-governed guardrails.

## Scope

Phase 1 includes:

- pnpm workspace scaffold.
- Next.js App Router frontend shell.
- Express + TypeScript backend shell.
- Python FastAPI AI service shell.
- Docker Compose local infrastructure for PostgreSQL, Keycloak, Temporal, and MinIO.
- Root validation commands for lint, typecheck, tests, and repository audit.
- `.env.example` with sample values only.
- README development instructions that match verified commands.

Phase 1 does not include:

- Company Core data model.
- Authentication flows beyond documented Keycloak container availability.
- Workflow DSL.
- Agent Harness.
- GraphRAG retrieval.
- Mission Control implementation beyond a shell-ready frontend.

## Workspace Structure

Use pnpm workspaces directly. Do not add Nx, Turborepo, or another monorepo orchestration tool in Phase 1.

Expected structure:

```text
apps/
├── web/
└── api/
services/
└── ai/
packages/
├── config/
└── types/
infra/
└── docker-compose.yml
```

Rationale:

- pnpm workspace is enough for the current scale.
- Avoiding a monorepo tool keeps the foundation easier to inspect and audit.
- The layout leaves clear boundaries for frontend, backend, AI service, shared config, and shared types.

## Frontend Shell

The frontend lives in `apps/web`.

Requirements:

- Next.js App Router.
- TypeScript.
- A first shell page that uses the approved Linear-style dark product canvas.
- No marketing-only landing page.
- First screen should feel like an operational product surface for OpenDX CompanyOS, with static example panels for Mission Control concepts.
- No real auth, workflow, agent, or GraphRAG behavior in Phase 1.

Design constraints:

- Canvas `#010102`.
- Accent `#5e6ad2` used sparingly.
- Dense product panels over decorative hero sections.
- No gradients, decorative orbs, or multi-accent visual palette.
- Do not rely on negative letter spacing in code.

## Backend Shell

The backend lives in `apps/api`.

Requirements:

- Express + TypeScript.
- `GET /health` endpoint returning deterministic JSON.
- Basic app factory separated from server startup so tests can import the app.
- No database business model yet.
- No shared agent credentials or direct connector behavior.

The health response shape is:

```json
{
  "status": "ok",
  "service": "opendx-api"
}
```

## AI Service Shell

The AI service lives in `services/ai`.

Requirements:

- Python FastAPI.
- `GET /health` endpoint returning deterministic JSON.
- Python dependency and test configuration kept local to `services/ai`.
- No model provider integration in Phase 1.
- No GraphRAG ingestion or retrieval behavior in Phase 1.

The health response shape is:

```json
{
  "status": "ok",
  "service": "opendx-ai"
}
```

## Local Infrastructure

Local infrastructure lives in `infra/docker-compose.yml`.

Required services:

- PostgreSQL.
- Keycloak.
- Temporal.
- MinIO.

The compose file must not contain real secrets. It may use local development example credentials that are clearly non-production.

Phase 1 only needs containers and documented access points. Deep service wiring belongs to later phase specs.

## Shared Packages

`packages/config` owns shared TypeScript configuration helpers or constants that are safe to use across apps.

`packages/types` owns shared TypeScript types that are stable enough to share. Phase 1 should keep this package minimal to avoid pretending domain contracts are already designed.

Do not define core business entities in shared packages during Phase 1. Company Core entities belong to Phase 2.

## Configuration and Secrets Policy

Create `.env.example` with sample values only.

Rules:

- Do not commit `.env`.
- Do not commit real credentials.
- Do not place secrets in README, docs, workflow JSON, prompts, or tests.
- Local development credentials in Docker Compose must be clearly scoped to local use.

## Validation Commands

The root project must expose commands for:

- Install dependencies.
- Lint.
- Typecheck.
- Test.
- Repository audit.

The exact package scripts are defined in the implementation plan, but README must only document commands after they have been verified.

Phase 1 validation must include:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
```

## Exit Criteria

Phase 1 is complete when:

- A clean checkout can install dependencies.
- Frontend shell validation passes.
- API health endpoint test passes.
- AI service health endpoint test passes.
- Docker Compose infrastructure file exists and is documented.
- Root validation commands pass.
- README development instructions match verified commands.
- `docs/roadmap/mvp-status.md` records Phase 1 spec and plan.
- No secrets are committed.
- No runtime business logic is hidden in prompts.
