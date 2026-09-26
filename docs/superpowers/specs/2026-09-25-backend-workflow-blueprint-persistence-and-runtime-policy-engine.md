<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Design Spec: Backend Workflow Blueprint Persistence & Runtime Policy Engine

## 1. Context & Business Intent

In OpenDX CompanyOS, the **Visual Business Workflow Studio** provides an intuitive, n8n-grade canvas where operators and department heads can inspect, modify, and compose multi-agent business flows. 

A critical question in real-world operations is:
> *"When an operator adjusts a threshold (e.g. auto-compensation limit from 200,000 VND to 500,000 VND) or changes a branch on the canvas, does that rule immediately dictate live backend execution?"*

Prior to this work, workflow blueprints and simulation states lived purely in client memory and React Flow state, while backend services (like `AiSupportService`) evaluated decisions using hardcoded thresholds.

This specification closes the loop:
1. **Database Blueprint Persistence**: Stores full React Flow graphs (nodes, edges, version, status, parameters) in PostgreSQL (`workflow_blueprints`).
2. **Governed Lifecycle API**: Provides audited REST endpoints to fetch, save drafts, validate, and publish workflow blueprints.
3. **Runtime Policy Engine**: Dynamically queries active, published blueprints and extracts operational rules (such as `auto_approval_threshold`, `vip_tier_bypass`, and `escalation_role`), so that live AI agent executions (e.g. CSKH customer recovery) automatically adhere to operator-defined canvas rules.

---

## 2. Architecture & Data Model

### 2.1 Database Schema: `workflow_blueprints`

```sql
CREATE TABLE IF NOT EXISTS workflow_blueprints (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  target_outcome TEXT,
  version VARCHAR(16) NOT NULL DEFAULT 'v1.0',
  status VARCHAR(32) NOT NULL DEFAULT 'published', -- 'draft' | 'published'
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL,
  policy_rules JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_workflow_blueprints_code ON workflow_blueprints(code);
CREATE INDEX IF NOT EXISTS idx_workflow_blueprints_status ON workflow_blueprints(status);
```

### 2.2 Standard Blueprint Seed Data
The database is pre-seeded with CompanyOS's 3 flagship blueprints:
1. **`WF-CSKH-RECOVERY`**: Customer Recovery Workflow (`auto_approval_threshold: 200000`).
2. **`WF-MKT-LAUNCH`**: Multi-Channel Marketing Campaign (`paid_budget_threshold: 0`).
3. **`WF-INV-REPLENISH`**: Low Stock Warning & Purchase Order (`auto_po_threshold: 10000000`).

---

## 3. API Contract

### 3.1 Endpoints
Base URL: `/api/v1/agentic/workflows`

1. **`GET /api/v1/agentic/workflows`**
   - Returns all registered workflow blueprints.
   - Reader roles: `administrator`, `agentic_operator`, `agentic_approver`, `agentic_governance_admin`, `agentic_auditor`.

2. **`GET /api/v1/agentic/workflows/:id`**
   - Returns detailed blueprint with nodes, edges, active version, status, and policy rules.

3. **`PUT /api/v1/agentic/workflows/:id/draft`**
   - Updates draft nodes, edges, or parameters.
   - Marks `status: 'draft'`.
   - Authorized roles: `administrator`, `agentic_operator`, `agentic_governance_admin`.

4. **`POST /api/v1/agentic/workflows/:id/publish`**
   - Validates graph structure.
   - Increments semantic version (`v1.0` -> `v1.1`).
   - Extracts policy rules (e.g. router thresholds) into `policy_rules` JSONB column.
   - Marks `status: 'published'`.
   - Records audit event in governance logs.

---

## 4. Runtime Policy Engine Integration

In `AiSupportService` (or any department agent service):
- When evaluating a support ticket compensation:
  ```ts
  const blueprint = await workflowBlueprintRepository.findByCode('WF-CSKH-RECOVERY');
  const threshold = blueprint?.policyRules?.auto_approval_threshold ?? 200000;
  ```
- If proposed compensation $\le$ threshold:
  - Node marks ticket as auto-eligible or executes auto-resolution.
- If proposed compensation > threshold:
  - Proposal is flagged as `escalation_required` and routed to the Human Approval Inbox.

---

## 5. Verification Plan
1. Integration test: Database migration runs cleanly, creates `workflow_blueprints`, and seeds standard blueprints.
2. Unit & API tests:
   - `workflow-blueprint.repository.test.ts`
   - `workflow-blueprint.service.test.ts`
   - `workflow-blueprint.api.test.ts`
3. Console Frontend test:
   - Fetching live blueprints from API.
   - Saving draft and publishing updates to backend.
   - Verifying updated threshold is reflected on reload.
