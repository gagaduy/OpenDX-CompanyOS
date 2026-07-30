<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# App Foundation Design

## Purpose

Phase 1 creates the runnable application foundation for OpenDX CompanyOS. It turns the repository from documentation-only into a structured, validated, local-development workspace without implementing deep Company Core, workflow, agent, or GraphRAG behavior.

The foundation must make OpenDX look and behave like an open-source platform repository, not a starter web app.

## Scope

Phase 1 includes:

- Root pnpm workspace.
- `apps/console` as the Next.js product console shell.
- `apps/api` as the Express + TypeScript modular monolith entrypoint.
- `services/ai-runtime` as the Python FastAPI AI runtime shell.
- Minimal shared packages for configuration, domain contracts, and UI tokens.
- Local infrastructure under `infra/docker`.
- Development and audit scripts under `scripts`.
- Root validation commands.
- README development instructions that match verified commands.

Phase 1 does not include:

- Company Core database models.
- Real SSO login flow.
- Workflow DSL or Temporal worker logic.
- Digital Employee execution.
- Tool Registry implementation.
- GraphRAG ingestion or retrieval.
- Production deployment.

## Repository Shape

The long-term repository shape is:

```text
apps/
services/
packages/
modules/
infra/
docs/
scripts/
.github/
```

Phase 1 creates only directories with useful content:

```text
apps/
├── console/
└── api/
services/
└── ai-runtime/
packages/
├── config/
├── domain/
└── ui/
infra/
└── docker/
scripts/
├── audit/
└── dev/
```

Do not create empty `modules/company`, `modules/workflow`, `modules/agent`, or `modules/graph` folders in Phase 1. Those module folders should appear when their phase creates real code, tests, or docs.

## Workspace Strategy

Use pnpm workspaces directly. Do not add Nx, Turborepo, or another monorepo orchestration tool in Phase 1.

Rationale:

- pnpm is enough for current scale.
- Fewer build abstractions make the repo easier for contributors and AI agents to inspect.
- A monorepo tool can be added later only if validation speed or dependency graph complexity justifies it.

## Frontend Console

`apps/console` owns the product UI shell.

Requirements:

- Next.js App Router.
- TypeScript.
- First screen is an operational console, not a marketing landing page.
- Uses the approved Linear-style dark product canvas.
- Shows static example surfaces for Mission Control, Digital Workforce, Workflow Operations, Approval Inbox, Graph Explorer, and Audit Explorer.
- Does not implement real authentication, workflow execution, agent activity, or GraphRAG.

Design constraints:

- Canvas `#010102`.
- Primary accent `#5e6ad2` used sparingly.
- Dense product panels with hairline borders.
- No atmospheric gradients, decorative orbs, spotlight cards, or multi-accent marketing palette.
- No negative letter spacing in coded UI.

## API Entrypoint

`apps/api` owns the Express + TypeScript backend entrypoint for the future modular monolith.

Requirements:

- Express app factory separated from server startup.
- `GET /health` returns deterministic JSON.
- Tests can import the app without opening a network port.
- No database model in Phase 1.
- No frontend-only authorization assumptions.

Health response:

```json
{
  "status": "ok",
  "service": "opendx-api"
}
```

## AI Runtime Shell

`services/ai-runtime` owns the Python FastAPI shell for future document parsing, extraction, embeddings, reranking, and GraphRAG support.

Requirements:

- FastAPI app.
- `GET /health` returns deterministic JSON.
- Python tests validate the health endpoint.
- No model provider integration in Phase 1.
- No GraphRAG retrieval in Phase 1.

Health response:

```json
{
  "status": "ok",
  "service": "opendx-ai-runtime"
}
```

## Shared Packages

`packages/config` owns typed configuration helpers and shared constants safe to use across TypeScript apps.

`packages/domain` owns minimal cross-boundary contracts such as branded IDs, service names, and event-name constants. It must not define full Company Core entity models in Phase 1.

`packages/ui` owns design tokens and minimal UI primitives for `apps/console`. It should encode the Linear-style color tokens and restrained component foundations.

## Infrastructure

`infra/docker` owns local Docker Compose assets.

Required local services:

- PostgreSQL with pgvector target.
- Keycloak.
- Temporal.
- MinIO.

The Docker Compose file may use local example credentials that are clearly non-production. Real secrets must never be committed.

Phase 1 only needs local containers and documented ports. Deep wiring to app code can wait for later phase specs.

## Scripts

`scripts/audit` owns repository audit helpers.

`scripts/dev` owns developer convenience scripts only when they are actually used by documented commands.

Scripts must be small, readable, and avoid hiding important business behavior.

## Configuration and Secrets

Create `.env.example` with sample values only.

Rules:

- Do not commit `.env`.
- Do not commit real credentials.
- Do not commit private endpoints.
- Do not store secrets in source code, docs, tests, prompts, or workflow JSON.
- Development credentials in Docker Compose must be obviously local-only.

## Validation

Root validation must include:

- Repository audit.
- TypeScript lint.
- TypeScript typecheck.
- TypeScript tests.
- Python tests for `services/ai-runtime`.
- Docker Compose config validation where feasible.

The baseline validation always includes:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
```

## Exit Criteria

Phase 1 is complete when:

- A clean checkout can install dependencies.
- `apps/console` validates and renders an OpenDX operational console shell.
- `apps/api` health endpoint test passes.
- `services/ai-runtime` health endpoint test passes.
- `infra/docker` contains documented local infrastructure.
- Root validation commands pass.
- README development instructions match verified commands.
- `docs/roadmap/mvp-status.md` records the Phase 1 spec and plan.
- No secrets are committed.
- No runtime business logic is hidden in prompts.
