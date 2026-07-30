<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Master Roadmap Design

## Purpose

This document defines the end-to-end roadmap for delivering the OpenDX CompanyOS MVP demo. It is a coordination spec, not an implementation spec. It exists to keep future sub-specs, sub-plans, commits, validation, and demo work aligned with the Company-first product vision.

The roadmap ends at a complete MVP demo, not a public 1.0 release.

## Target Outcome

The MVP is complete when OpenDX CompanyOS can demonstrate this chain:

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

## Roadmap Model

The roadmap is phase-gated. Each phase must produce committed specs, committed implementation plans, atomic implementation commits, validation evidence, changelog entries, and a clear exit decision before the next phase begins.

Each phase can contain multiple sub-specs and sub-plans. The master roadmap does not replace detailed implementation planning. It tells the project when to create those detailed plans and how to judge whether a phase is complete.

## Phase 1: Foundation

Goal: create the application foundation for a modular monolith MVP.

Expected scope:

- Monorepo or workspace structure.
- Next.js frontend shell.
- Express + TypeScript backend shell.
- Python AI service shell.
- Docker Compose for PostgreSQL, Keycloak, Temporal, MinIO, and local services.
- Shared lint, format, typecheck, and test commands.
- Baseline health checks.
- Initial environment examples without secrets.

Required sub-specs:

- App foundation scaffold.
- Local infrastructure and Docker Compose.
- Repository validation and CI baseline.

Exit criteria:

- A clean checkout can install dependencies and run validation commands.
- Local services can start or have documented fallback if a service is not yet wired.
- README development instructions are accurate.
- No application business logic is hidden in prompts.

## Phase 2: Company Operating Core

Goal: implement the source-of-truth company model and core operating entities.

Expected scope:

- Company, Department, Position, Human Employee, Digital Employee.
- Goal, KPI, Task, Event, Decision.
- Initial RBAC resources and audit events tied to company context.
- Seed data for NovaCommerce organization structure.

Required sub-specs:

- Company core data model.
- Organization graph projection.
- Audit event model.

Exit criteria:

- Company isolation is enforced in backend tests.
- Core entities can be created, listed, and read through authorized API boundaries.
- Audit events record important mutations.

## Phase 3: iPaaS and Workflow

Goal: implement durable workflow modeling and execution boundaries.

Expected scope:

- Workflow DSL.
- Workflow versioning with draft and published states.
- Temporal integration boundary.
- Node types for trigger, action, agent, skill, condition, transform, approval, delay, sub-workflow, and end.
- Execution history and error states.
- Simulation mode boundary.

Required sub-specs:

- Workflow DSL and versioning.
- Temporal execution integration.
- Approval node behavior.
- Connector registry MVP.

Exit criteria:

- A business event can start a workflow run.
- Workflow run state survives process restart where Temporal is responsible.
- Approval nodes pause and resume through authorized signals.
- Published workflow versions cannot be mutated in place.

## Phase 4: Digital Workforce

Goal: implement Digital Employees as governed company resources.

Expected scope:

- Agent profile.
- Agent service-account identity boundary.
- Skill Registry and SkillVersion.
- Tool Registry.
- Agent run tracking.
- Handoff model.
- Quality gate and budget tracking.
- Human approval integration.

Required sub-specs:

- Digital Employee profile model.
- Skill Registry format and versioning.
- Agent Harness execution boundary.
- Tool permission contract.

Exit criteria:

- Agents cannot access tools or memory outside their authorized scope.
- Agents do not share credentials.
- Agent runs produce audit events and evaluation metadata.
- Handoff records include source references and expected output.

## Phase 5: GraphRAG

Goal: implement permission-aware retrieval over operational and semantic company knowledge.

Expected scope:

- Document ingestion.
- Document chunks.
- Knowledge entities and relationships.
- Operational graph projection tables.
- Hybrid vector and graph retrieval.
- Permission filtering before LLM context construction.
- Citation and provenance records.
- Incremental indexing boundary.

Required sub-specs:

- Graph storage model.
- Document ingestion pipeline.
- Permission-aware retrieval pipeline.
- Citation and provenance contract.

Exit criteria:

- Retrieval tests prove tenant and permission filtering happens before context generation.
- Important answers include source references.
- Operational graph records are derived from source-of-truth data, not free-form LLM output.
- Permission leakage tests pass.

## Phase 6: Cross-Department Demo

Goal: connect implemented modules into deterministic NovaCommerce demos.

Expected scope:

- NovaCommerce seed/reset scripts.
- Lead-to-Cash demo.
- Complaint-to-Resolution demo.
- Basic Hire-to-Onboard demo.
- Mission Control views for demo state.
- Approval Inbox.
- Audit Explorer.
- Graph Explorer.
- Simulation mode examples.

Required sub-specs:

- NovaCommerce seed data.
- Lead-to-Cash workflow demo.
- Complaint-to-Resolution workflow demo.
- Hire-to-Onboard workflow demo.
- Mission Control MVP UI.

Exit criteria:

- Demo can be reset and rerun deterministically.
- The 14-step MVP acceptance chain can be shown end to end.
- Human approval is visible and enforceable.
- Mission Control and Audit Explorer show the relevant process state.

## Phase 7: Hardening

Goal: make the MVP credible, repeatable, and defensible.

Expected scope:

- Security tests.
- Tenant isolation tests.
- Agent permission tests.
- Workflow recovery tests.
- GraphRAG leakage tests.
- Observability baseline.
- Documentation cleanup.
- Install and reset verification.

Required sub-specs:

- MVP hardening test matrix.
- Observability baseline.
- Demo verification checklist.

Exit criteria:

- Full validation suite passes from a clean checkout.
- Permission leakage tests pass with zero leakage.
- Demo install and reset instructions are accurate.
- Changelog accounts for every committed unit.

## Sub-Spec and Sub-Plan Rules

Create a sub-spec when work changes architecture, data models, permission behavior, workflow behavior, agent behavior, GraphRAG behavior, or user-facing product surfaces.

Create a sub-plan after the sub-spec is approved. The sub-plan must be executable in atomic units with validation and commit steps.

Do not implement directly from this master roadmap unless the task is repository documentation maintenance that does not affect runtime behavior.

## Tracking Rules

Every phase must track:

- Current status: not started, in progress, blocked, or complete.
- Active sub-spec.
- Active sub-plan.
- Latest implementation commit.
- Validation evidence.
- Open risks.
- Exit decision.

Phase completion requires:

- Approved sub-specs.
- Committed sub-plans.
- Atomic implementation commits.
- Updated `CHANGELOG.md`.
- Passing the validation commands and demo checks defined in that phase's sub-plan.
- No known guardrail violation.

## Guardrail Gates

Every phase must preserve:

- Company-first modeling.
- Backend-enforced authorization.
- Tenant isolation.
- Agent service-account separation.
- Tool Registry mediation.
- Human approval for risky actions.
- Workflow versioning.
- GraphRAG permission filtering before LLM context construction.
- Audit and provenance for important operations.

## Documentation Gates

Documentation must stay close to implementation. When behavior changes, update the related product, architecture, design, agent guideline, API, or operations documentation in the same unit.

The README must only advertise commands and features that exist and have been verified.

## Validation Strategy

Validation expands by phase:

- Phase 1: repository audit, lint, typecheck, unit test shells, service health checks.
- Phase 2: backend tests for company isolation, core entity behavior, and audit.
- Phase 3: workflow DSL tests, Temporal integration tests, approval pause/resume tests.
- Phase 4: agent permission, tool access, skill versioning, and audit tests.
- Phase 5: GraphRAG permission leakage, citation, provenance, and retrieval tests.
- Phase 6: deterministic demo reset and end-to-end workflow checks.
- Phase 7: full clean-checkout validation and hardening matrix.

## Out of Scope

The master roadmap does not cover:

- Public 1.0 release readiness.
- Marketplace scale.
- Kubernetes deployment.
- Full ERP, CRM, HRM, payroll, or accounting depth.
- Mobile app.
- Broad connector catalog.
- Autonomous financial or legal execution without human approval.
