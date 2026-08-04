<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Company Operating Core API

The Phase 2 API is read-only and exposes deterministic data for the one
configured company, NovaCommerce. CompanyOS does not select between companies
and therefore has no Company ID route parameter or response field.

## Endpoints

```text
GET /v1/operating-core
GET /v1/departments
GET /v1/tasks
GET /v1/events
GET /v1/approvals
```

## Aggregate Snapshot

`GET /v1/operating-core` returns:

```json
{
  "company": {
    "name": "NovaCommerce",
    "industry": "E-commerce",
    "size": "51-200",
    "createdAt": "2026-07-31T00:00:00.000Z"
  },
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

## Authorization Boundary

The configured company is implicit. Future authorization middleware evaluates
the authenticated actor's department, role, resource, action, data
classification, workflow context, and risk level before allowing access.

## Phase 2 Boundaries

These endpoints do not implement persistence, SSO, RBAC, Temporal workflows,
Digital Employee execution, Tool Registry behavior, or GraphRAG retrieval.
