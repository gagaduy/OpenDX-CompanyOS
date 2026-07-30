<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Company Operating Core Design

## Purpose

Phase 2 establishes the backend and shared-domain foundation for the Company Operating Core. It turns the Phase 1 runtime shell into a testable business core that can represent a company, its organization, goals, work, events, decisions, approvals, and audit evidence.

The phase is backend/domain-first. It must create stable contracts and deterministic behavior before adding persistent storage, deep frontend workflows, Temporal orchestration, Digital Employee execution, or GraphRAG retrieval.

## Scope

Phase 2 includes:

- Shared TypeScript domain contracts for Company Operating Core entities.
- Runtime validation helpers for the core entity shapes.
- In-memory Company Operating Core repository seeded with NovaCommerce data.
- Express API routes that expose read-only operating-core views.
- Tenant-scoped access through explicit `companyId` path parameters.
- Deterministic audit/event shapes for future workflow and agent phases.
- Focused tests for domain validation, API response shape, tenant scoping, task/event relations, and approval state.
- Documentation updates for the Phase 2 status and API contract.

Phase 2 does not include:

- PostgreSQL persistence or migrations.
- ORM adoption.
- Keycloak/OIDC login integration.
- Temporal workflow execution.
- Digital Employee execution.
- Tool Registry implementation.
- GraphRAG ingestion or retrieval.
- Production authorization policy evaluation.
- Deep frontend implementation.

## Architecture

Phase 2 uses a domain/API-first structure:

```text
packages/domain
  Core entity types, branded IDs, enums, validators, and seed-safe constructors.

apps/api
  Express routes, in-memory repository, response mappers, and tests.
```

`packages/domain` owns cross-boundary contracts. It should contain types and small deterministic helpers only. It must not import Express, test-only fixtures, persistence adapters, frontend code, LLM libraries, or infrastructure clients.

`apps/api` owns API assembly and read-model behavior. In Phase 2 it may use an in-memory repository because the goal is to lock contracts and behavior before database design. The repository interface must be narrow enough that a PostgreSQL implementation can replace the in-memory implementation later.

## Entity Model

The first Company Operating Core slice includes these entities:

- `Company`
- `Department`
- `Position`
- `HumanEmployee`
- `Goal`
- `Kpi`
- `Task`
- `BusinessEvent`
- `Decision`
- `ApprovalRequest`
- `AuditEvent`

Digital Employee profiles are not implemented in Phase 2. The entity model may reserve `actorType: "agent"` and `assigneeType: "digital_employee"` enum values where needed so later phases do not need to rewrite audit, task, or approval contracts.

## Required Relationships

The phase must represent these relationships in deterministic data:

```text
Department belongs to Company
Position belongs to Department
HumanEmployee belongs to Department
HumanEmployee may report to another HumanEmployee
Goal is assigned to Company or Department
Kpi measures Goal
Task belongs to Company
Task may be assigned to HumanEmployee, Department, or future DigitalEmployee
BusinessEvent belongs to Company
Decision belongs to Company
Decision may create or reference Task
ApprovalRequest belongs to Company
ApprovalRequest references requested actor, approver role, status, and risk level
AuditEvent belongs to Company and references actor, action, resource, and correlation ID
```

## ID and Tenant Rules

All business entities must carry `companyId`.

IDs use branded string types in `packages/domain`. The exact string format may remain simple in Phase 2, but tests must verify that data returned from a company-scoped endpoint belongs only to the requested company.

The API must never expose all companies from a company-scoped endpoint.

## API Contract

Phase 2 exposes read-only endpoints:

```text
GET /v1/companies/:companyId/operating-core
GET /v1/companies/:companyId/departments
GET /v1/companies/:companyId/tasks
GET /v1/companies/:companyId/events
GET /v1/companies/:companyId/approvals
```

`GET /v1/companies/:companyId/operating-core` returns an aggregate snapshot suitable for a future Mission Control or Company Map UI:

```json
{
  "company": {},
  "departments": [],
  "positions": [],
  "humanEmployees": [],
  "goals": [],
  "kpis": [],
  "tasks": [],
  "events": [],
  "decisions": [],
  "approvals": [],
  "auditEvents": []
}
```

Unknown company IDs return `404` with deterministic JSON:

```json
{
  "error": {
    "code": "company_not_found",
    "message": "Company was not found"
  }
}
```

The Phase 2 API is intentionally read-only. Mutation endpoints wait until persistence, authorization, and audit write behavior are designed together.

## NovaCommerce Seed

Phase 2 includes deterministic NovaCommerce seed data covering:

- Company profile.
- Departments: Executive, Marketing, Sales, Customer Service, Operations, Finance, Human Resources, IT and Compliance.
- Positions and human employees sufficient to show reporting lines.
- Company and department goals.
- KPIs for revenue, pipeline, complaint resolution, operational risk, and approval latency.
- Tasks linked to demo-relevant flows.
- Business events such as `lead.created`, `approval.requested`, `customer.complained`, and `employee.onboarded`.
- Decisions that create or reference tasks.
- Approval requests with `pending`, `approved`, and `rejected` examples.
- Audit events with correlation IDs.

The seed must avoid fake secrets, private endpoints, personal data, or production-like credentials.

## Validation

Domain validation must reject or report:

- Empty required IDs.
- Entity records whose `companyId` does not match the requested company scope.
- Tasks without a known status.
- Approval requests without a known status.
- Business events without type, actor, timestamp, or correlation ID.

Validation is deterministic TypeScript code. Do not use an LLM for validation, classification, relationship creation, KPI calculation, or audit shaping.

## Error Handling

API errors use one JSON shape:

```json
{
  "error": {
    "code": "machine_readable_code",
    "message": "Human readable message"
  }
}
```

Phase 2 must avoid leaking internal stack traces in HTTP responses.

## Security and Governance

Phase 2 does not implement real SSO or RBAC, but it must preserve the future security boundary:

- Every endpoint is company-scoped.
- The API must be structured so authorization middleware can be inserted before route handlers.
- Audit contracts must include actor, action, resource, timestamp, correlation ID, and outcome.
- Approval contracts must distinguish `allow`, `require_approval`, and `deny` decisions where policy decisions are represented.
- No frontend-only authorization assumptions are introduced.

## Documentation

The implementation plan must update:

- `docs/roadmap/mvp-status.md`
- `docs/dependencies.md` if any dependency changes
- `docs/build-from-source.md` if validation or run commands change
- `CHANGELOG.md` under `[Unreleased]`

No dependency is expected for the first Phase 2 slice.

## Testing

Phase 2 tests must cover:

- Domain constructors or validators for valid and invalid records.
- In-memory repository returns only the requested company data.
- Aggregate operating-core endpoint response shape.
- Unknown company response.
- Department, task, event, approval endpoints.
- At least one test proving a cross-company record is not returned.

Use existing TypeScript test tooling. Do not add a database test stack in Phase 2.

## Exit Criteria

Phase 2 is complete when:

- Company Operating Core contracts exist in `packages/domain`.
- `apps/api` exposes the read-only company-scoped endpoints above.
- NovaCommerce seed data covers organization, goals, KPIs, tasks, events, decisions, approvals, and audit events.
- Tenant scoping behavior is tested.
- Domain validation behavior is tested.
- API tests pass.
- Root validation passes.
- `docs/roadmap/mvp-status.md` records Phase 2 completion.
- No persistence, workflow, agent runtime, GraphRAG, or frontend scope has leaked into this phase.
