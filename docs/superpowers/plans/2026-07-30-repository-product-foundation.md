<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Repository Product Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the GitHub-ready open-source foundation for OpenDX CompanyOS before scaffolding application code.

**Architecture:** This plan creates repository governance, product documentation, architecture documentation, agent guardrails, and design guidance as independent reviewable units. Runtime code is intentionally deferred so the project has stable constraints before implementation begins.

**Tech Stack:** Markdown documentation, GitHub issue forms, Apache-2.0 licensing, Keep a Changelog, Conventional Commits, repository audit script from `/home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py`.

## Global Constraints

- License is Apache-2.0.
- Initial branch is `main`.
- Remote is `https://github.com/gagaduy/OpenDX-CompanyOS.git`.
- Product center is `Company`, not chatbot or agent persona.
- Frontend direction is the approved Linear-style dark product canvas using `#010102` canvas and scarce `#5e6ad2` accent.
- Do not put secrets, real credentials, private endpoints, `.env`, signing keys, personal data, or production dumps in the repository.
- Every repository-changing unit updates `CHANGELOG.md` under `[Unreleased]`.
- New license-capable source and documentation files include SPDX headers where the format supports comments.
- Use atomic Conventional Commits.

---

## File Structure

Create or modify these files across the plan:

- `README.md`: project overview, status, quick start, architecture links, contribution, security, license.
- `LICENSE`: exact Apache License 2.0 text.
- `CHANGELOG.md`: Keep a Changelog structure with `[Unreleased]`.
- `CONTRIBUTING.md`: setup, branch policy, commit policy, changelog, validation, PR process.
- `CODE_OF_CONDUCT.md`: contributor covenant and enforcement route.
- `SECURITY.md`: supported versions, vulnerability reporting, response expectations.
- `.gitignore`: generated files, local caches, env files, secrets, build outputs.
- `.github/PULL_REQUEST_TEMPLATE.md`: PR checklist.
- `.github/ISSUE_TEMPLATE/bug_report.yml`: GitHub bug issue form.
- `.github/ISSUE_TEMPLATE/feature_request.yml`: GitHub feature issue form.
- `docs/product/vision.md`: distilled product vision, positioning, MVP scope, non-goals, acceptance chain.
- `docs/architecture/system-baseline.md`: functional layers, deployment baseline, modules, entity families.
- `docs/architecture/mvp-phases.md`: Phase 1 through Phase 7 implementation path.
- `docs/design/linear-product-canvas.md`: frontend visual system constraints.
- `docs/agent-guidelines/implementation-guardrails.md`: mandatory AI coding agent guardrails.

### Task 1: Open-Source Governance Baseline

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `CHANGELOG.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SECURITY.md`
- Create: `.gitignore`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-30-repository-product-foundation-design.md`
- Produces: repository governance files and `CHANGELOG.md` structure used by every later task.

- [ ] **Step 1: Create repository health files**

Create `README.md` with this structure:

```markdown
<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# OpenDX CompanyOS

OpenDX CompanyOS is an open-source Company-first operating platform for modeling and running a digital company.

## Status

OpenDX CompanyOS is in early foundation work. Runtime application code is being scaffolded after the repository, product, architecture, and design constraints are committed.

## What It Is

OpenDX CompanyOS models a company, its organization, people, digital employees, workflows, policies, business data, knowledge graph, integrations, approvals, and audit trail in one operating layer.

AI agents are represented as Digital Employees inside the company. They are governed by role, skill, tools, data scope, permissions, policies, and human approval.

## What It Is Not

- Not a chatbot product.
- Not a generic agent persona playground.
- Not a workflow builder without durable execution and governance.
- Not a full ERP, CRM, HRM, payroll, or accounting suite.
- Not a system that lets AI perform risky financial or legal actions without human approval.

## MVP Direction

The MVP is organized around:

- Company Core.
- Identity and RBAC.
- Workflow and iPaaS.
- Agent Runtime.
- GraphRAG.
- Mission Control.
- NovaCommerce cross-department demo data.

## Architecture

See:

- `docs/product/vision.md`
- `docs/architecture/system-baseline.md`
- `docs/architecture/mvp-phases.md`
- `docs/design/linear-product-canvas.md`
- `docs/agent-guidelines/implementation-guardrails.md`

## Development

Application setup commands will be added when the runtime workspace is scaffolded.

## Contributing

See `CONTRIBUTING.md`.

## Security

Do not open public issues for vulnerabilities. See `SECURITY.md`.

## License

Apache-2.0. See `LICENSE`.
```

Create `LICENSE` using the exact Apache License 2.0 text from <https://www.apache.org/licenses/LICENSE-2.0.txt>.

Create `CHANGELOG.md`:

```markdown
<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add initial repository governance files for the OpenDX CompanyOS open-source project.
- Add product, architecture, design, and agent implementation documentation foundation.
```

Create `CONTRIBUTING.md` with:

```markdown
<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Contributing

OpenDX CompanyOS is built as a Company-first, human-governed platform. Contributions must preserve the product guardrails in `docs/agent-guidelines/implementation-guardrails.md`.

## Branches

Use task-scoped branches named:

```text
<type>/<issue>-<short-name>
```

Use `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `security`, `hotfix`, or `release`. Omit the issue number when none exists.

## Commits

Use Conventional Commits:

```text
<type>(<scope>): <imperative summary>
```

Keep commits atomic. Update tests, docs, and `CHANGELOG.md` in the same commit as the change they describe.

## Changelog

Every repository-changing unit must update `CHANGELOG.md` under `[Unreleased]`.

## Validation

Before committing, run:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
```

Run project-specific tests once application code exists.

## Pull Requests

PRs should describe scope, tests, security impact, changelog changes, and breaking changes.
```

Create `CODE_OF_CONDUCT.md` with a Contributor Covenant style policy and enforcement route through GitHub repository maintainers.

Create `SECURITY.md` with supported version `Unreleased` and a private reporting route through GitHub Security Advisories for `gagaduy/OpenDX-CompanyOS`.

Create `.gitignore` with Node, Python, Docker, env, cache, logs, coverage, build output, editor, and OS patterns:

```gitignore
# Environment and secrets
.env
.env.*
!.env.example
*.pem
*.key
*.p12
*.pfx

# Node
node_modules/
.next/
dist/
build/
coverage/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Python
__pycache__/
*.py[cod]
.pytest_cache/
.ruff_cache/
.mypy_cache/
.venv/
venv/

# Docker and local data
.docker/
data/
tmp/

# Logs
*.log
logs/

# Editors and OS
.idea/
.vscode/
*.swp
.DS_Store
Thumbs.db
```

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Summary

## Change Type

- [ ] Feature
- [ ] Fix
- [ ] Documentation
- [ ] Refactor
- [ ] Test
- [ ] Build or CI
- [ ] Security

## Validation

- [ ] `git diff --check`
- [ ] Repository audit
- [ ] Focused tests
- [ ] Wider tests or build

## Product and Security Checks

- [ ] Preserves Company-first design
- [ ] Preserves permission and tenant boundaries
- [ ] Adds or updates audit/provenance behavior where relevant
- [ ] Does not introduce secrets
- [ ] Updates `CHANGELOG.md`

## Breaking Changes

```

Create GitHub issue forms with required summary, context, expected behavior, actual behavior for bugs, and acceptance criteria for features.

- [ ] **Step 2: Validate governance files**

Run:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
```

Expected: both commands exit `0`.

- [ ] **Step 3: Commit governance baseline**

Run:

```bash
git add README.md LICENSE CHANGELOG.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md .gitignore .github/PULL_REQUEST_TEMPLATE.md .github/ISSUE_TEMPLATE/bug_report.yml .github/ISSUE_TEMPLATE/feature_request.yml
git diff --cached --stat
git diff --cached
git commit -m "chore(repo): add open-source governance baseline"
```

Expected: one atomic commit with only governance files.

### Task 2: Product Documentation Foundation

**Files:**
- Create: `docs/product/vision.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: approved master product brief and Task 1 changelog structure.
- Produces: product baseline for later architecture, data model, workflow, agent, and frontend work.

- [ ] **Step 1: Create product vision documentation**

Create `docs/product/vision.md` with sections:

```markdown
<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Product Vision

## Product Statement

OpenDX CompanyOS is an open-source platform that helps businesses model their organization, data, workflows, human employees, and digital employees in one governed operating system.

## Core Formula

```text
Company Blueprint
+ Organization Graph
+ Human Employees
+ Digital Employees
+ Skills
+ iPaaS
+ Workflow Engine
+ SSO
+ Policy Engine
+ GraphRAG
+ Shared Memory
+ Mission Control
= OpenDX CompanyOS
```

## Product Positioning

OpenDX CompanyOS is the operating layer above business data, applications, workflows, and AI agents.

It is not a chatbot, a simple agent builder, a RAG-only document Q&A tool, a generic n8n clone, a full ERP, a full CRM, a full HRM, or an autonomous company that removes human accountability.

## Design Principles

- Company-first.
- Human-governed.
- Process-driven.
- Identity-aware.
- Permission-aware.
- Graph-grounded.
- Model-agnostic.
- Open and extensible.
- Auditable by default.

## MVP Scope

The MVP must include Company Core, Identity, Workflow and iPaaS, Agent Runtime, GraphRAG, Mission Control, and NovaCommerce demo data.

## MVP Non-Goals

The MVP will not build full ERP, payroll, accounting, Salesforce-class CRM, Workday-class HRM, mobile apps, Kubernetes, broad connector marketplace, or uncontrolled agent self-creation.

## Acceptance Chain

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
```

- [ ] **Step 2: Update changelog**

Add under `## [Unreleased]` / `### Added`:

```markdown
- Document the OpenDX CompanyOS product vision, MVP scope, non-goals, and acceptance chain.
```

- [ ] **Step 3: Validate and commit**

Run:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
git add docs/product/vision.md CHANGELOG.md
git diff --cached --stat
git diff --cached
git commit -m "docs(product): define product vision"
```

Expected: one atomic commit containing product documentation and changelog update.

### Task 3: Architecture Documentation Foundation

**Files:**
- Create: `docs/architecture/system-baseline.md`
- Create: `docs/architecture/mvp-phases.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `docs/product/vision.md`.
- Produces: architecture baseline for later app scaffolding and implementation specs.

- [ ] **Step 1: Create system baseline**

Create `docs/architecture/system-baseline.md` with:

```markdown
<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# System Baseline

## Functional Layers

OpenDX CompanyOS has six functional layers:

- Experience Layer.
- Identity Plane.
- Company Operating Core.
- iPaaS and Workflow Engine.
- Agent Runtime.
- Company Graph and GraphRAG.

## MVP Deployment

- Frontend: Next.js.
- Backend: Express + TypeScript modular monolith.
- Durable workflow: Temporal.
- Identity provider: Keycloak.
- Operational database: PostgreSQL.
- Vector search: pgvector.
- Graph storage: PostgreSQL graph projection tables.
- Object storage: MinIO.
- AI service: Python.
- Observability: structured logs, OpenTelemetry, metrics.
- Deployment: Docker Compose.

## Backend Modules

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

## Core Entity Families

- Company, Department, Position, User, HumanEmployee, DigitalEmployee.
- Role, Permission, Policy.
- Goal, KPI, Task, Decision.
- SkillDefinition, SkillVersion.
- AgentRun, AgentHandoff, ToolDefinition, ToolCall.
- WorkflowDefinition, WorkflowVersion, WorkflowRun, WorkflowNodeRun.
- ConnectorDefinition, ConnectorConnection, CredentialReference.
- BusinessEvent, ApprovalRequest, AuditEvent, Notification.
- Document, DocumentChunk, KnowledgeEntity, KnowledgeRelationship, GraphSource, MemoryEntry.

## Durable Workflow Boundary

Temporal owns durable state, retry, timers, signals, and resume after crash. OpenDX owns the workflow DSL, node model, connector registry, agent node, skill node, approval node, company event integration, and permission enforcement.

## GraphRAG Boundary

Operational graph is a projection of source-of-truth database records. Semantic graph is extracted from authorized documents and events with provenance. Retrieval must apply permission filters before context reaches an LLM.
```

- [ ] **Step 2: Create MVP phases**

Create `docs/architecture/mvp-phases.md` with:

```markdown
<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# MVP Phases

## Phase 1: Foundation

Repository, Docker Compose, PostgreSQL, Keycloak, Company model, Department, Human User, RBAC, and Audit.

## Phase 2: Company Operating Core

Organization Graph, Goal, KPI, Task, Event, Decision, and Approval.

## Phase 3: iPaaS and Workflow

Workflow DSL, Temporal, Workflow Builder, triggers, conditions, transforms, connectors, approvals, and execution UI.

## Phase 4: Digital Workforce

Digital Employee, Skill Registry, Tool Registry, Agent Harness, handoff, quality gate, and Agent Activity UI.

## Phase 5: GraphRAG

Document ingestion, operational graph, semantic graph, hybrid retrieval, permission-aware query, citation, and Graph Explorer.

## Phase 6: Cross-Department Demo

NovaCommerce seed data, Lead-to-Cash, Complaint-to-Resolution, Hire-to-Onboard, Simulation Mode, and AI War Room.

## Phase 7: Hardening

Security tests, actor and department permission tests, agent permission tests, workflow recovery tests, GraphRAG leakage tests, observability, documentation, seed/reset scripts, and clean installation.
```

- [ ] **Step 3: Update changelog**

Add under `## [Unreleased]` / `### Added`:

```markdown
- Document the MVP architecture baseline and phased implementation path.
```

- [ ] **Step 4: Validate and commit**

Run:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
git add docs/architecture/system-baseline.md docs/architecture/mvp-phases.md CHANGELOG.md
git diff --cached --stat
git diff --cached
git commit -m "docs(architecture): define mvp system baseline"
```

Expected: one atomic commit containing architecture docs and changelog update.

### Task 4: Design and Agent Guardrails Documentation

**Files:**
- Create: `docs/design/linear-product-canvas.md`
- Create: `docs/agent-guidelines/implementation-guardrails.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: approved Linear-style design direction and master product guardrails.
- Produces: design and agent implementation constraints for frontend and coding work.

- [ ] **Step 1: Create frontend design guidance**

Create `docs/design/linear-product-canvas.md` with:

```markdown
<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Linear-Style Product Canvas

## Intent

OpenDX CompanyOS frontend surfaces should feel dense, technical, product-focused, and quietly luxurious. The UI should prioritize operational product panels over marketing decoration.

## Color Tokens

- Canvas: `#010102`.
- Primary: `#5e6ad2`.
- Primary hover: `#828fff`.
- Primary focus: `#5e69d1`.
- Ink: `#f7f8f8`.
- Ink muted: `#d0d6e0`.
- Ink subtle: `#8a8f98`.
- Ink tertiary: `#62666d`.
- Surface 1: `#0f1011`.
- Surface 2: `#141516`.
- Surface 3: `#18191a`.
- Surface 4: `#191a1b`.
- Hairline: `#23252a`.
- Hairline strong: `#34343a`.
- Hairline tertiary: `#3e3e44`.

## Usage Rules

- Use lavender only for brand mark, primary CTA, focus ring, and link emphasis.
- Use surface ladder and hairline borders for hierarchy.
- Do not use atmospheric gradients, decorative orbs, spotlight cards, or multiple bright accents.
- Use product UI panels, screenshots, and operational states as the primary visual material.
- Use 8px radius for controls, 12px for most cards, and 16px for product screenshot panels.
- Do not rely on negative letter spacing in coded UI.

## Product Areas

Mission Control, Workflow Builder, Approval Inbox, Graph Explorer, Audit Explorer, and Digital Workforce should be implemented as dense operational interfaces, not landing-page sections.
```

- [ ] **Step 2: Create agent guardrails**

Create `docs/agent-guidelines/implementation-guardrails.md` with:

```markdown
<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Implementation Guardrails

AI coding agents working on OpenDX CompanyOS must follow these rules:

1. Do not turn the project into a chatbot with multiple personas.
2. Do not put business logic only in prompts.
3. Do not give agents direct database access through shared credentials.
4. Do not let agents decide their own permissions.
5. Do not let GraphRAG bypass tenant or permission filters.
6. Do not use an LLM for calculations that deterministic code can perform.
7. Do not use an LLM to create operational relationships without authoritative sources.
8. Do not store secrets in source code, prompts, workflow JSON, or docs.
9. Do not mutate production workflows without versioning.
10. Do not rely on frontend-only authorization.
11. Do not automate risky financial or legal actions without human approval.
12. Do not build every department at equal depth in the MVP.
13. Do not add technology only to make the architecture look more complex.
14. Every meaningful feature must serve at least one cross-department demo.
15. Every important result must include audit and provenance.
```

- [ ] **Step 3: Update changelog**

Add under `## [Unreleased]` / `### Added`:

```markdown
- Document frontend design constraints and mandatory AI coding agent guardrails.
```

- [ ] **Step 4: Validate and commit**

Run:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
git add docs/design/linear-product-canvas.md docs/agent-guidelines/implementation-guardrails.md CHANGELOG.md
git diff --cached --stat
git diff --cached
git commit -m "docs(standards): add design and agent guardrails"
```

Expected: one atomic commit containing design and guardrail docs plus changelog update.

### Task 5: Final Repository Foundation Audit

**Files:**
- Modify: no source files expected unless audit reveals a concrete issue.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: validated repository foundation ready for app scaffolding.

- [ ] **Step 1: Run final validation**

Run:

```bash
git diff --check
python3 /home/duy/Olympic/TraceGuard/.agents/skills/build-open-source-repository/scripts/audit_repo.py . --spdx-id Apache-2.0
git status --short --branch
git log --oneline --max-count=8
```

Expected:

- `git diff --check` exits `0`.
- Repository audit exits `0`.
- Worktree is clean.
- Recent commits are atomic and use Conventional Commits.

- [ ] **Step 2: Push branch when requested**

Only push if the user asks. When pushing is approved, run:

```bash
git push -u origin main
```

Expected: GitHub repository receives the committed foundation.

## Self-Review

Spec coverage:

- Repository governance is covered by Task 1.
- Product baseline is covered by Task 2.
- Architecture baseline and MVP phases are covered by Task 3.
- Linear-style design direction and agent guardrails are covered by Task 4.
- Validation and repository audit are covered by Task 5.

Completeness scan:

- No unresolved markers or unspecified file paths are intentionally present.

Type consistency:

- This plan is documentation-first and does not define runtime code interfaces.

Scope:

- Runtime app scaffolding is intentionally deferred to a separate spec and plan after this repository foundation is complete.
