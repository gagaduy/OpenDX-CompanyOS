<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Repository & Product Foundation Design

## Purpose

OpenDX CompanyOS is an open-source Company-first operating platform for modeling and running a digital company. The first project unit establishes the repository, documentation, product constraints, architecture baseline, and frontend design direction before application code is scaffolded.

This unit exists to prevent the project from drifting into a chatbot, generic workflow tool, or ungoverned agent playground.

## Scope

This foundation covers:

- Open-source repository health files and contributor workflow.
- Product and MVP baseline documentation.
- Architecture baseline documentation.
- Agent implementation guardrails.
- Frontend design system requirements based on the approved Linear-style dark product canvas.
- A first implementation plan for scaffolding repository files and documentation.

This foundation does not implement runtime application features. App scaffolding starts in the next unit after this spec and its plan are reviewed.

## Product Principles

OpenDX CompanyOS is Company-first. The central object is `Company`; agents, workflows, skills, connectors, memory, and data scopes belong to a company or workspace.

The system is human-governed. High-risk actions must support approval, pause, cancel, retry, override, reassign, and escalation.

The system is process-driven. Agent work must be tied to a skill, workflow, policy, input schema, output schema, quality gate, and audit trail.

The system is identity-aware and permission-aware. Every action must identify the actor, and backend, workflow, GraphRAG, and connector layers must enforce authorization. Frontend checks are never sufficient.

GraphRAG is graph-grounded but not the source of truth. Operational database records remain authoritative. GraphRAG retrieval must filter by identity, company, role, and data scope before LLM context is built.

The agent runtime is model-agnostic. Provider, embedding, reranker, and extraction models must sit behind replaceable abstractions.

The repository is auditable by default. Important operations must capture actor, time, input, output, tool calls, accessed data, decisions, approvals, errors, retries, and model cost.

## MVP Architecture Baseline

The MVP uses a modular monolith before service extraction:

- Frontend: Next.js.
- Backend: Express + TypeScript modular monolith.
- Durable workflows: Temporal.
- Identity provider: Keycloak with OIDC.
- Operational database: PostgreSQL.
- Vector search: pgvector.
- Graph storage: PostgreSQL projection tables for MVP, with an optional adapter path for Neo4j or another graph database.
- Object storage: MinIO.
- AI service: Python for document parsing, extraction, embeddings, reranking, and GraphRAG support.
- Observability: structured logs, OpenTelemetry, and metrics dashboards.
- Deployment: Docker Compose for MVP.

Backend modules start as clear internal boundaries:

- Company.
- Organization.
- Identity adapter.
- Workflow.
- Agent.
- Skill.
- Policy.
- Approval.
- Graph.
- Integration.
- Audit.

## Repository Design

The repository will be initialized as an Apache-2.0 open-source project with:

- `README.md` for purpose, status, features, quick start, architecture links, contribution, security, and license.
- `LICENSE` with the unmodified Apache License 2.0 text.
- `CHANGELOG.md` using Keep a Changelog and SemVer with `[Unreleased]`.
- `CONTRIBUTING.md` with setup, branch naming, Conventional Commits, tests, changelog requirements, and PR process.
- `CODE_OF_CONDUCT.md` with usable enforcement contact information.
- `SECURITY.md` with private vulnerability reporting expectations.
- `.gitignore` for Node, Python, Docker, environment files, build outputs, caches, and local secrets.
- `.github/PULL_REQUEST_TEMPLATE.md`.
- `.github/ISSUE_TEMPLATE/bug_report.yml`.
- `.github/ISSUE_TEMPLATE/feature_request.yml`.
- Documentation folders under `docs/`.

New license-capable source and documentation files should include SPDX headers where the format supports comments. JSON, lockfiles, generated files, and strict data formats should not be made invalid for the sake of inline headers.

## Documentation Structure

The first documentation pass will create:

- `docs/product/vision.md`: product vision, positioning, MVP acceptance criteria, and non-goals.
- `docs/architecture/system-baseline.md`: functional layers, deployment architecture, entity families, and cross-cutting constraints.
- `docs/architecture/mvp-phases.md`: phased implementation path from Foundation to Hardening.
- `docs/design/linear-product-canvas.md`: approved Linear-style design direction for OpenDX frontend work.
- `docs/agent-guidelines/implementation-guardrails.md`: mandatory guardrails for AI coding agents working on the repo.
- `docs/superpowers/plans/`: implementation plans created by the writing-plans skill.
- `docs/superpowers/specs/`: approved design specs created by the brainstorming skill.

The long master product brief can be represented as distilled documentation rather than copied verbatim into one huge file. The distilled docs must preserve the intent and mandatory guardrails.

## Frontend Design Direction

Frontend work must follow the approved Linear-style product canvas:

- Canvas: `#010102`.
- Primary accent: `#5e6ad2`.
- Text: `#f7f8f8`, `#d0d6e0`, `#8a8f98`, `#62666d`.
- Surfaces: `#0f1011`, `#141516`, `#18191a`, `#191a1b`.
- Hairlines: `#23252a`, `#34343a`, `#3e3e44`.
- Primary accent is scarce: brand mark, primary CTA, focus rings, and link emphasis.
- No atmospheric gradients, decorative orbs, spotlight cards, or multi-accent marketing palette.
- UI should feel dense, technical, product-focused, and quietly luxurious.
- Product UI panels and screenshots should carry the visual weight.
- Cards use restrained radii: 8px for controls, 12px for most cards, 16px for product screenshot panels.

Implementation must reconcile this direction with the platform frontend rules:

- Do not rely on negative letter spacing in coded UI.
- Do not build a pure marketing landing page when the user asks for an app or tool.
- Use dense operational product surfaces for Mission Control, Workflow Builder, Approval Inbox, Graph Explorer, Audit Explorer, and Digital Workforce.

## Demo Anchor

All meaningful MVP features must support at least one cross-department demo:

- Lead-to-Cash for NovaCommerce.
- Complaint-to-Resolution for NovaCommerce.
- Hire-to-Onboard for NovaCommerce.

The primary MVP acceptance chain remains:

1. User logs in through SSO.
2. System resolves company, department, and role.
3. Business event triggers a workflow.
4. Workflow assigns work to a Digital Employee.
5. Agent uses an authorized skill and data scope.
6. GraphRAG provides cited context.
7. Agent calls connectors only through Tool Registry.
8. Policy Engine detects approval requirements.
9. Workflow waits for the correct approver.
10. Approval resumes the workflow.
11. Business data is updated.
12. Graph and memory are updated.
13. Mission Control shows status.
14. Audit Log records the process.

## Error Handling and Governance Expectations

The foundation docs must make these constraints explicit:

- No shared credentials across agents.
- No secrets in source, prompt, workflow JSON, or docs.
- No production workflow mutation without versioning.
- No LLM-based calculation where deterministic code is appropriate.
- No LLM-created operational graph relationships without authoritative source records.
- No automatic risky financial or legal actions.
- No permission filtering delegated to the LLM.

## Testing and Validation

The repository foundation unit is validated by:

- `git diff --check`.
- Repository audit script from the approved `build-open-source-repository` skill.
- Manual review that every repository-changing unit appears in `CHANGELOG.md`.
- Manual check that no empty ceremonial files were created.

Later app units will add executable validation suites for frontend, backend, AI service, and infrastructure.

## Open Decisions

Resolved:

- License: Apache-2.0.
- Initial branch: `main`.
- Repository remote: `https://github.com/gagaduy/OpenDX-CompanyOS.git`.
- First implementation direction: Foundation Repository + Product Specs before app scaffolding.

Deferred:

- Exact package manager for JavaScript workspace.
- Exact monorepo tool.
- Exact first UI screen.
- Exact Keycloak realm bootstrap format.

These deferred choices belong in the app scaffolding spec and plan, not this repository foundation unit.
