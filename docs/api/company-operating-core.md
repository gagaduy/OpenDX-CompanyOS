<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Company Operating Core API

The Company Operating Core API is read-only in Phase 2. It exposes deterministic NovaCommerce seed data through company-scoped endpoints.

## Endpoints

```text
GET /v1/companies/:companyId/operating-core
GET /v1/companies/:companyId/departments
GET /v1/companies/:companyId/tasks
GET /v1/companies/:companyId/events
GET /v1/companies/:companyId/approvals
```

Use the NovaCommerce demo company ID:

```text
company_novacommerce
```

## Aggregate Snapshot

`GET /v1/companies/:companyId/operating-core` returns:

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

Collection endpoints return:

```json
{
  "data": []
}
```

## Error Shape

Unknown companies return:

```json
{
  "error": {
    "code": "company_not_found",
    "message": "Company was not found"
  }
}
```

## Phase 2 Boundaries

These endpoints do not implement persistence, SSO, RBAC, Temporal workflows, Digital Employee execution, Tool Registry behavior, or GraphRAG retrieval.

Every endpoint is company-scoped so future authorization middleware can be inserted before route handlers.
