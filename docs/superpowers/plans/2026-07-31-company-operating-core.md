<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Company Operating Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend/domain-first Company Operating Core slice with deterministic Company, organization, goal, KPI, task, event, decision, approval, and audit read models.

**Architecture:** `packages/domain` owns shared entity contracts and deterministic validators. `apps/api` owns in-memory NovaCommerce data, repository interfaces, route handlers, and API response tests. Persistence, SSO, Temporal, Agent Runtime, GraphRAG, and deep frontend work stay out of this phase.

**Tech Stack:** TypeScript, Express 5, Vitest, Supertest, pnpm workspace.

## Global Constraints

- Work on branch `feat/company-operating-core`.
- Do not add PostgreSQL persistence, migrations, ORM, Keycloak/OIDC integration, Temporal execution, Digital Employee execution, Tool Registry, GraphRAG, or deep frontend implementation.
- Do not add new dependencies unless a task explicitly justifies and documents them.
- Every business entity carries `companyId`.
- Company-scoped endpoints must never expose records from another company.
- API errors use `{ "error": { "code": "...", "message": "..." } }`.
- Validation is deterministic TypeScript code; do not use an LLM for validation, classification, relationship creation, KPI calculation, or audit shaping.
- Update `CHANGELOG.md` under `[Unreleased]` for each repository-changing unit.
- Add SPDX headers to new license-capable files.

---

## File Structure

Create or modify these files:

- `packages/domain/src/ids.ts`: shared branded ID helpers currently defined in `index.ts`.
- `packages/domain/src/company-core.ts`: Company Operating Core entity types, enum values, aggregate type, validator functions, and `CORE_ENTITY_KINDS`.
- `packages/domain/src/company-core.test.ts`: focused domain validation tests.
- `packages/domain/src/index.ts`: exports the Company Operating Core contracts.
- `apps/api/src/company-core/seed.ts`: deterministic NovaCommerce and second-company seed data.
- `apps/api/src/company-core/repository.ts`: repository interface and in-memory implementation with tenant filtering.
- `apps/api/src/company-core/routes.ts`: Express router for read-only company-scoped endpoints.
- `apps/api/src/company-core/routes.test.ts`: Supertest coverage for API shape, unknown company, tenant scoping, tasks, events, and approvals.
- `apps/api/src/app.ts`: mounts the Company Operating Core router.
- `docs/roadmap/mvp-status.md`: records Phase 2 implementation status and exit evidence.
- `CHANGELOG.md`: records each completed unit.

---

### Task 1: Domain Contracts and Validators

**Files:**
- Create: `packages/domain/src/company-core.ts`
- Create: `packages/domain/src/ids.ts`
- Create: `packages/domain/src/company-core.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/index.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing `CompanyId` and `makeCompanyScopedId` behavior from `packages/domain/src/index.ts`
- Produces:
  - `packages/domain/src/ids.ts` exporting `CompanyId` and `makeCompanyScopedId`
  - Types: `Company`, `Department`, `Position`, `HumanEmployee`, `Goal`, `Kpi`, `Task`, `BusinessEvent`, `Decision`, `ApprovalRequest`, `AuditEvent`, `CompanyOperatingCoreSnapshot`
  - Enums/unions: `TaskStatus`, `ApprovalStatus`, `RiskLevel`, `ActorType`, `ApprovalDecision`
  - Functions: `validateCompanyOperatingCoreSnapshot(snapshot: CompanyOperatingCoreSnapshot): ValidationIssue[]`, `assertValidCompanyScope(snapshot: CompanyOperatingCoreSnapshot, companyId: CompanyId): ValidationIssue[]`

- [ ] **Step 1: Write failing domain tests**

Create `packages/domain/src/company-core.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  assertValidCompanyScope,
  validateCompanyOperatingCoreSnapshot,
  type CompanyOperatingCoreSnapshot,
} from "./company-core";

const validSnapshot: CompanyOperatingCoreSnapshot = {
  company: {
    id: "company_novacommerce",
    name: "NovaCommerce",
    industry: "E-commerce",
    size: "51-200",
    createdAt: "2026-07-31T00:00:00.000Z",
  },
  departments: [
    {
      id: "department_sales",
      companyId: "company_novacommerce",
      name: "Sales",
      slug: "sales",
      createdAt: "2026-07-31T00:00:00.000Z",
    },
  ],
  positions: [],
  humanEmployees: [],
  goals: [
    {
      id: "goal_pipeline",
      companyId: "company_novacommerce",
      ownerType: "department",
      ownerId: "department_sales",
      title: "Grow qualified pipeline",
      status: "active",
      createdAt: "2026-07-31T00:00:00.000Z",
    },
  ],
  kpis: [
    {
      id: "kpi_pipeline_value",
      companyId: "company_novacommerce",
      goalId: "goal_pipeline",
      name: "Qualified pipeline value",
      unit: "usd",
      target: 500000,
      current: 275000,
      direction: "increase",
      updatedAt: "2026-07-31T00:00:00.000Z",
    },
  ],
  tasks: [
    {
      id: "task_qualify_lead",
      companyId: "company_novacommerce",
      title: "Qualify Acme inbound lead",
      status: "in_progress",
      priority: "high",
      assigneeType: "department",
      assigneeId: "department_sales",
      createdAt: "2026-07-31T00:00:00.000Z",
    },
  ],
  events: [
    {
      id: "event_lead_created",
      companyId: "company_novacommerce",
      type: "lead.created",
      source: "website",
      actor: { type: "service_account", id: "svc_website" },
      occurredAt: "2026-07-31T00:00:00.000Z",
      correlationId: "corr_lead_to_cash",
      sensitivity: "internal",
    },
  ],
  decisions: [],
  approvals: [
    {
      id: "approval_discount",
      companyId: "company_novacommerce",
      requestedAction: "sales.apply_discount",
      requestedBy: { type: "user", id: "employee_sales_manager" },
      approverRole: "finance_manager",
      status: "pending",
      riskLevel: "medium",
      decision: "require_approval",
      correlationId: "corr_lead_to_cash",
      createdAt: "2026-07-31T00:00:00.000Z",
    },
  ],
  auditEvents: [
    {
      id: "audit_lead_created",
      companyId: "company_novacommerce",
      actor: { type: "service_account", id: "svc_website" },
      action: "lead.created",
      resourceType: "lead",
      resourceId: "lead_acme",
      outcome: "success",
      correlationId: "corr_lead_to_cash",
      occurredAt: "2026-07-31T00:00:00.000Z",
    },
  ],
};

describe("Company Operating Core validation", () => {
  it("accepts a valid company-scoped snapshot", () => {
    expect(validateCompanyOperatingCoreSnapshot(validSnapshot)).toEqual([]);
    expect(assertValidCompanyScope(validSnapshot, "company_novacommerce")).toEqual([]);
  });

  it("reports records outside the requested company scope", () => {
    const invalid: CompanyOperatingCoreSnapshot = {
      ...validSnapshot,
      tasks: [
        ...validSnapshot.tasks,
        {
          ...validSnapshot.tasks[0],
          id: "task_other_company",
          companyId: "company_other",
        },
      ],
    };

    expect(assertValidCompanyScope(invalid, "company_novacommerce")).toContainEqual({
      path: "tasks[1].companyId",
      message: "Expected company_novacommerce but received company_other",
    });
  });

  it("reports unknown task and approval statuses", () => {
    const invalid = {
      ...validSnapshot,
      tasks: [{ ...validSnapshot.tasks[0], status: "blocked_forever" }],
      approvals: [{ ...validSnapshot.approvals[0], status: "waiting" }],
    } as unknown as CompanyOperatingCoreSnapshot;

    expect(validateCompanyOperatingCoreSnapshot(invalid)).toEqual(
      expect.arrayContaining([
        { path: "tasks[0].status", message: "Unknown task status: blocked_forever" },
        { path: "approvals[0].status", message: "Unknown approval status: waiting" },
      ]),
    );
  });

  it("reports business events missing required audit fields", () => {
    const invalid = {
      ...validSnapshot,
      events: [{ ...validSnapshot.events[0], type: "", correlationId: "" }],
    };

    expect(validateCompanyOperatingCoreSnapshot(invalid)).toEqual(
      expect.arrayContaining([
        { path: "events[0].type", message: "Business event type is required" },
        { path: "events[0].correlationId", message: "Business event correlationId is required" },
      ]),
    );
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm --filter @opendx/domain test -- company-core.test.ts
```

Expected: FAIL because `company-core.ts` does not exist.

- [ ] **Step 3: Move shared ID helpers out of the barrel**

Create `packages/domain/src/ids.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CompanyId = `company_${string}`;

export function makeCompanyScopedId(companyId: string, resourceId: string): string {
  return `${companyId}:${resourceId}`;
}
```

Modify `packages/domain/src/index.ts` so `CompanyId` and `makeCompanyScopedId` are imported from `ids.ts` through a barrel export, while `SERVICE_NAMES` remains in `index.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export const SERVICE_NAMES = {
  api: "opendx-api",
  aiRuntime: "opendx-ai-runtime",
} as const;

export * from "./ids";
```

Run existing tests to ensure behavior is unchanged:

```bash
pnpm --filter @opendx/domain test -- index.test.ts
```

Expected: PASS.

- [ ] **Step 4: Implement domain contracts and validators**

Create `packages/domain/src/company-core.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CompanyId } from "./ids";

export type EntityId = string;
export type IsoTimestamp = string;

export type ActorType = "user" | "agent" | "workflow" | "service_account" | "connector";
export type TaskStatus = "todo" | "in_progress" | "waiting_approval" | "done" | "canceled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "changes_requested" | "canceled";
export type ApprovalDecision = "allow" | "require_approval" | "deny";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type SensitivityLevel = "public" | "internal" | "confidential" | "restricted";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ActorRef {
  type: ActorType;
  id: EntityId;
}

export interface Company {
  id: CompanyId;
  name: string;
  industry: string;
  size: string;
  createdAt: IsoTimestamp;
}

export interface Department {
  id: EntityId;
  companyId: CompanyId;
  name: string;
  slug: string;
  headEmployeeId?: EntityId;
  createdAt: IsoTimestamp;
}

export interface Position {
  id: EntityId;
  companyId: CompanyId;
  departmentId: EntityId;
  title: string;
  level: string;
  createdAt: IsoTimestamp;
}

export interface HumanEmployee {
  id: EntityId;
  companyId: CompanyId;
  departmentId: EntityId;
  positionId: EntityId;
  displayName: string;
  workEmail: string;
  reportsToEmployeeId?: EntityId;
  status: "active" | "invited" | "archived";
  createdAt: IsoTimestamp;
}

export interface Goal {
  id: EntityId;
  companyId: CompanyId;
  ownerType: "company" | "department";
  ownerId: EntityId;
  title: string;
  status: "active" | "at_risk" | "complete" | "paused";
  createdAt: IsoTimestamp;
}

export interface Kpi {
  id: EntityId;
  companyId: CompanyId;
  goalId: EntityId;
  name: string;
  unit: string;
  target: number;
  current: number;
  direction: "increase" | "decrease" | "maintain";
  updatedAt: IsoTimestamp;
}

export interface Task {
  id: EntityId;
  companyId: CompanyId;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeType: "human_employee" | "department" | "digital_employee";
  assigneeId: EntityId;
  relatedEventId?: EntityId;
  createdAt: IsoTimestamp;
  dueAt?: IsoTimestamp;
}

export interface BusinessEvent {
  id: EntityId;
  companyId: CompanyId;
  type: string;
  source: string;
  actor: ActorRef;
  occurredAt: IsoTimestamp;
  correlationId: string;
  causationId?: string;
  sensitivity: SensitivityLevel;
}

export interface Decision {
  id: EntityId;
  companyId: CompanyId;
  title: string;
  decidedBy: ActorRef;
  outcome: string;
  relatedTaskId?: EntityId;
  correlationId: string;
  decidedAt: IsoTimestamp;
}

export interface ApprovalRequest {
  id: EntityId;
  companyId: CompanyId;
  requestedAction: string;
  requestedBy: ActorRef;
  approverRole: string;
  status: ApprovalStatus;
  riskLevel: RiskLevel;
  decision: ApprovalDecision;
  correlationId: string;
  createdAt: IsoTimestamp;
  resolvedAt?: IsoTimestamp;
}

export interface AuditEvent {
  id: EntityId;
  companyId: CompanyId;
  actor: ActorRef;
  action: string;
  resourceType: string;
  resourceId: EntityId;
  outcome: "success" | "failure" | "denied" | "approval_required";
  correlationId: string;
  occurredAt: IsoTimestamp;
}

export interface CompanyOperatingCoreSnapshot {
  company: Company;
  departments: Department[];
  positions: Position[];
  humanEmployees: HumanEmployee[];
  goals: Goal[];
  kpis: Kpi[];
  tasks: Task[];
  events: BusinessEvent[];
  decisions: Decision[];
  approvals: ApprovalRequest[];
  auditEvents: AuditEvent[];
}

export const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "waiting_approval",
  "done",
  "canceled",
] as const;

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  "pending",
  "approved",
  "rejected",
  "changes_requested",
  "canceled",
] as const;

export const CORE_ENTITY_KINDS = [
  "company",
  "department",
  "position",
  "human_employee",
  "goal",
  "kpi",
  "task",
  "business_event",
  "decision",
  "approval_request",
  "audit_event",
] as const;

export function assertValidCompanyScope(
  snapshot: CompanyOperatingCoreSnapshot,
  companyId: CompanyId,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (snapshot.company.id !== companyId) {
    issues.push({
      path: "company.id",
      message: `Expected ${companyId} but received ${snapshot.company.id}`,
    });
  }

  const collections = [
    ["departments", snapshot.departments],
    ["positions", snapshot.positions],
    ["humanEmployees", snapshot.humanEmployees],
    ["goals", snapshot.goals],
    ["kpis", snapshot.kpis],
    ["tasks", snapshot.tasks],
    ["events", snapshot.events],
    ["decisions", snapshot.decisions],
    ["approvals", snapshot.approvals],
    ["auditEvents", snapshot.auditEvents],
  ] as const;

  for (const [collectionName, records] of collections) {
    records.forEach((record, index) => {
      if (record.companyId !== companyId) {
        issues.push({
          path: `${collectionName}[${index}].companyId`,
          message: `Expected ${companyId} but received ${record.companyId}`,
        });
      }
    });
  }

  return issues;
}

export function validateCompanyOperatingCoreSnapshot(
  snapshot: CompanyOperatingCoreSnapshot,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!snapshot.company.id) {
    issues.push({ path: "company.id", message: "Company id is required" });
  }

  snapshot.tasks.forEach((task, index) => {
    if (!TASK_STATUSES.includes(task.status)) {
      issues.push({
        path: `tasks[${index}].status`,
        message: `Unknown task status: ${task.status}`,
      });
    }
  });

  snapshot.approvals.forEach((approval, index) => {
    if (!APPROVAL_STATUSES.includes(approval.status)) {
      issues.push({
        path: `approvals[${index}].status`,
        message: `Unknown approval status: ${approval.status}`,
      });
    }
  });

  snapshot.events.forEach((event, index) => {
    if (!event.type) {
      issues.push({ path: `events[${index}].type`, message: "Business event type is required" });
    }
    if (!event.actor.id) {
      issues.push({ path: `events[${index}].actor.id`, message: "Business event actor id is required" });
    }
    if (!event.occurredAt) {
      issues.push({ path: `events[${index}].occurredAt`, message: "Business event timestamp is required" });
    }
    if (!event.correlationId) {
      issues.push({
        path: `events[${index}].correlationId`,
        message: "Business event correlationId is required",
      });
    }
  });

  return issues;
}
```

Modify `packages/domain/src/index.ts`:

```typescript
export * from "./company-core";
```

- [ ] **Step 5: Run focused and package validation**

Run:

```bash
pnpm --filter @opendx/domain test -- company-core.test.ts
pnpm --filter @opendx/domain typecheck
```

Expected: PASS.

- [ ] **Step 6: Update changelog**

Add under `[Unreleased]` > `### Added`:

```markdown
- Add Company Operating Core domain contracts and deterministic validation helpers.
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/domain/src/ids.ts packages/domain/src/company-core.ts packages/domain/src/company-core.test.ts packages/domain/src/index.ts packages/domain/src/index.test.ts CHANGELOG.md
git diff --cached --check
git commit -m "feat(domain): add company operating core contracts"
```

---

### Task 2: In-Memory Repository and NovaCommerce Seed

**Files:**
- Create: `apps/api/src/company-core/seed.ts`
- Create: `apps/api/src/company-core/repository.ts`
- Create: `apps/api/src/company-core/repository.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `CompanyOperatingCoreSnapshot`, `CompanyId`, `validateCompanyOperatingCoreSnapshot`, `assertValidCompanyScope`
- Produces:
  - `NOVACOMMERCE_COMPANY_ID: CompanyId`
  - `createCompanyCoreSeed(): CompanyOperatingCoreSnapshot[]`
  - `CompanyOperatingCoreRepository`
  - `InMemoryCompanyOperatingCoreRepository`

- [ ] **Step 1: Write failing repository tests**

Create `apps/api/src/company-core/repository.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { NOVACOMMERCE_COMPANY_ID, createCompanyCoreSeed } from "./seed";
import { InMemoryCompanyOperatingCoreRepository } from "./repository";

describe("InMemoryCompanyOperatingCoreRepository", () => {
  it("returns the NovaCommerce operating core snapshot", () => {
    const repository = new InMemoryCompanyOperatingCoreRepository(createCompanyCoreSeed());

    const snapshot = repository.findSnapshotByCompanyId(NOVACOMMERCE_COMPANY_ID);

    expect(snapshot?.company.name).toBe("NovaCommerce");
    expect(snapshot?.departments.map((department) => department.slug)).toEqual([
      "executive",
      "marketing",
      "sales",
      "customer-service",
      "operations",
      "finance",
      "human-resources",
      "it-compliance",
    ]);
  });

  it("returns undefined for an unknown company", () => {
    const repository = new InMemoryCompanyOperatingCoreRepository(createCompanyCoreSeed());

    expect(repository.findSnapshotByCompanyId("company_missing")).toBeUndefined();
  });

  it("does not return cross-company records from scoped collection methods", () => {
    const repository = new InMemoryCompanyOperatingCoreRepository(createCompanyCoreSeed());

    expect(repository.findTasksByCompanyId(NOVACOMMERCE_COMPANY_ID)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ companyId: NOVACOMMERCE_COMPANY_ID }),
      ]),
    );
    expect(
      repository.findTasksByCompanyId(NOVACOMMERCE_COMPANY_ID).every(
        (task) => task.companyId === NOVACOMMERCE_COMPANY_ID,
      ),
    ).toBe(true);
  });

  it("keeps task, event, approval, and audit correlation ids aligned for demo flows", () => {
    const repository = new InMemoryCompanyOperatingCoreRepository(createCompanyCoreSeed());
    const snapshot = repository.findSnapshotByCompanyId(NOVACOMMERCE_COMPANY_ID);

    expect(snapshot?.events.map((event) => event.correlationId)).toContain("corr_lead_to_cash");
    expect(snapshot?.tasks.map((task) => task.relatedEventId)).toContain("event_lead_created");
    expect(snapshot?.approvals.map((approval) => approval.correlationId)).toContain("corr_lead_to_cash");
    expect(snapshot?.auditEvents.map((auditEvent) => auditEvent.correlationId)).toContain("corr_lead_to_cash");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm --filter @opendx/api test -- company-core/repository.test.ts
```

Expected: FAIL because repository and seed files do not exist.

- [ ] **Step 3: Implement deterministic seed data**

Create `apps/api/src/company-core/seed.ts` with:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CompanyId, CompanyOperatingCoreSnapshot } from "@opendx/domain";

export const NOVACOMMERCE_COMPANY_ID = "company_novacommerce" as CompanyId;
const COMPASS_COMPANY_ID = "company_compass-demo" as CompanyId;
const CREATED_AT = "2026-07-31T00:00:00.000Z";

export function createCompanyCoreSeed(): CompanyOperatingCoreSnapshot[] {
  return [createNovaCommerceSnapshot(), createCompassSnapshot()];
}

function createNovaCommerceSnapshot(): CompanyOperatingCoreSnapshot {
  return {
    company: {
      id: NOVACOMMERCE_COMPANY_ID,
      name: "NovaCommerce",
      industry: "E-commerce",
      size: "51-200",
      createdAt: CREATED_AT,
    },
    departments: [
      department("department_executive", "Executive", "executive"),
      department("department_marketing", "Marketing", "marketing"),
      department("department_sales", "Sales", "sales"),
      department("department_customer_service", "Customer Service", "customer-service"),
      department("department_operations", "Operations", "operations"),
      department("department_finance", "Finance", "finance"),
      department("department_hr", "Human Resources", "human-resources"),
      department("department_it_compliance", "IT and Compliance", "it-compliance"),
    ],
    positions: [
      position("position_ceo", "department_executive", "Chief Executive Officer", "executive"),
      position("position_sales_manager", "department_sales", "Sales Manager", "manager"),
      position("position_finance_manager", "department_finance", "Finance Manager", "manager"),
      position("position_ops_manager", "department_operations", "Operations Manager", "manager"),
      position("position_cs_manager", "department_customer_service", "Customer Service Manager", "manager"),
    ],
    humanEmployees: [
      employee("employee_ceo", "department_executive", "position_ceo", "Mai Nguyen", "mai@novacommerce.example"),
      employee("employee_sales_manager", "department_sales", "position_sales_manager", "An Tran", "an.sales@novacommerce.example", "employee_ceo"),
      employee("employee_finance_manager", "department_finance", "position_finance_manager", "Linh Pham", "linh.finance@novacommerce.example", "employee_ceo"),
      employee("employee_ops_manager", "department_operations", "position_ops_manager", "Huy Le", "huy.ops@novacommerce.example", "employee_ceo"),
      employee("employee_cs_manager", "department_customer_service", "position_cs_manager", "Thao Do", "thao.cs@novacommerce.example", "employee_ceo"),
    ],
    goals: [
      {
        id: "goal_company_growth",
        companyId: NOVACOMMERCE_COMPANY_ID,
        ownerType: "company",
        ownerId: NOVACOMMERCE_COMPANY_ID,
        title: "Increase cross-department operating visibility",
        status: "active",
        createdAt: CREATED_AT,
      },
      {
        id: "goal_sales_pipeline",
        companyId: NOVACOMMERCE_COMPANY_ID,
        ownerType: "department",
        ownerId: "department_sales",
        title: "Grow qualified lead-to-cash pipeline",
        status: "active",
        createdAt: CREATED_AT,
      },
    ],
    kpis: [
      {
        id: "kpi_revenue_forecast",
        companyId: NOVACOMMERCE_COMPANY_ID,
        goalId: "goal_company_growth",
        name: "Revenue forecast",
        unit: "usd",
        target: 1200000,
        current: 760000,
        direction: "increase",
        updatedAt: CREATED_AT,
      },
      {
        id: "kpi_pipeline_value",
        companyId: NOVACOMMERCE_COMPANY_ID,
        goalId: "goal_sales_pipeline",
        name: "Qualified pipeline value",
        unit: "usd",
        target: 500000,
        current: 275000,
        direction: "increase",
        updatedAt: CREATED_AT,
      },
    ],
    tasks: [
      {
        id: "task_qualify_acme_lead",
        companyId: NOVACOMMERCE_COMPANY_ID,
        title: "Qualify Acme inbound lead",
        status: "in_progress",
        priority: "high",
        assigneeType: "department",
        assigneeId: "department_sales",
        relatedEventId: "event_lead_created",
        createdAt: CREATED_AT,
      },
      {
        id: "task_review_discount",
        companyId: NOVACOMMERCE_COMPANY_ID,
        title: "Review lead-to-cash discount request",
        status: "waiting_approval",
        priority: "high",
        assigneeType: "human_employee",
        assigneeId: "employee_finance_manager",
        relatedEventId: "event_approval_requested",
        createdAt: CREATED_AT,
      },
    ],
    events: [
      event("event_lead_created", "lead.created", "website", "service_account", "svc_website", "corr_lead_to_cash"),
      event("event_approval_requested", "approval.requested", "workflow", "workflow_lead_to_cash", "corr_lead_to_cash", "event_lead_created"),
      event("event_customer_complained", "customer.complained", "support_portal", "service_account", "svc_support_portal", "corr_complaint_resolution"),
      event("event_employee_onboarded", "employee.onboarded", "hr_system", "service_account", "svc_hr", "corr_hire_to_onboard"),
    ],
    decisions: [
      {
        id: "decision_discount_requires_finance",
        companyId: NOVACOMMERCE_COMPANY_ID,
        title: "Discount requires finance approval",
        decidedBy: { type: "user", id: "employee_sales_manager" },
        outcome: "Route discount over 15 percent to Finance Manager",
        relatedTaskId: "task_review_discount",
        correlationId: "corr_lead_to_cash",
        decidedAt: CREATED_AT,
      },
    ],
    approvals: [
      {
        id: "approval_discount_pending",
        companyId: NOVACOMMERCE_COMPANY_ID,
        requestedAction: "sales.apply_discount",
        requestedBy: { type: "workflow", id: "workflow_lead_to_cash" },
        approverRole: "finance_manager",
        status: "pending",
        riskLevel: "medium",
        decision: "require_approval",
        correlationId: "corr_lead_to_cash",
        createdAt: CREATED_AT,
      },
      {
        id: "approval_refund_approved",
        companyId: NOVACOMMERCE_COMPANY_ID,
        requestedAction: "finance.issue_refund",
        requestedBy: { type: "user", id: "employee_cs_manager" },
        approverRole: "finance_manager",
        status: "approved",
        riskLevel: "low",
        decision: "allow",
        correlationId: "corr_complaint_resolution",
        createdAt: CREATED_AT,
        resolvedAt: CREATED_AT,
      },
      {
        id: "approval_salary_export_rejected",
        companyId: NOVACOMMERCE_COMPANY_ID,
        requestedAction: "hr.export_salary_data",
        requestedBy: { type: "agent", id: "agent_sales" },
        approverRole: "hr_manager",
        status: "rejected",
        riskLevel: "high",
        decision: "deny",
        correlationId: "corr_salary_denied",
        createdAt: CREATED_AT,
        resolvedAt: CREATED_AT,
      },
    ],
    auditEvents: [
      audit("audit_lead_created", "service_account", "svc_website", "lead.created", "lead", "lead_acme", "success", "corr_lead_to_cash"),
      audit("audit_approval_requested", "workflow", "workflow_lead_to_cash", "approval.requested", "approval_request", "approval_discount_pending", "approval_required", "corr_lead_to_cash"),
      audit("audit_salary_export_denied", "agent", "agent_sales", "hr.export_salary_data", "employee_salary", "salary_dataset", "denied", "corr_salary_denied"),
    ],
  };
}

function createCompassSnapshot(): CompanyOperatingCoreSnapshot {
  return {
    company: {
      id: COMPASS_COMPANY_ID,
      name: "Compass Demo",
      industry: "Internal test tenant",
      size: "1-10",
      createdAt: CREATED_AT,
    },
    departments: [department("department_compass_ops", "Operations", "operations", COMPASS_COMPANY_ID)],
    positions: [],
    humanEmployees: [],
    goals: [],
    kpis: [],
    tasks: [
      {
        id: "task_compass_private",
        companyId: COMPASS_COMPANY_ID,
        title: "Private cross-tenant task",
        status: "todo",
        priority: "low",
        assigneeType: "department",
        assigneeId: "department_compass_ops",
        createdAt: CREATED_AT,
      },
    ],
    events: [],
    decisions: [],
    approvals: [],
    auditEvents: [],
  };
}

function department(id: string, name: string, slug: string, companyId = NOVACOMMERCE_COMPANY_ID) {
  return { id, companyId, name, slug, createdAt: CREATED_AT };
}

function position(id: string, departmentId: string, title: string, level: string) {
  return { id, companyId: NOVACOMMERCE_COMPANY_ID, departmentId, title, level, createdAt: CREATED_AT };
}

function employee(id: string, departmentId: string, positionId: string, displayName: string, workEmail: string, reportsToEmployeeId?: string) {
  return { id, companyId: NOVACOMMERCE_COMPANY_ID, departmentId, positionId, displayName, workEmail, reportsToEmployeeId, status: "active" as const, createdAt: CREATED_AT };
}

function event(id: string, type: string, source: string, actorType: "service_account" | "workflow", actorId: string, correlationId: string, causationId?: string) {
  return { id, companyId: NOVACOMMERCE_COMPANY_ID, type, source, actor: { type: actorType, id: actorId }, occurredAt: CREATED_AT, correlationId, causationId, sensitivity: "internal" as const };
}

function audit(id: string, actorType: "service_account" | "workflow" | "agent", actorId: string, action: string, resourceType: string, resourceId: string, outcome: "success" | "failure" | "denied" | "approval_required", correlationId: string) {
  return { id, companyId: NOVACOMMERCE_COMPANY_ID, actor: { type: actorType, id: actorId }, action, resourceType, resourceId, outcome, correlationId, occurredAt: CREATED_AT };
}
```

- [ ] **Step 4: Implement the repository**

Create `apps/api/src/company-core/repository.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  assertValidCompanyScope,
  validateCompanyOperatingCoreSnapshot,
  type ApprovalRequest,
  type BusinessEvent,
  type CompanyId,
  type CompanyOperatingCoreSnapshot,
  type Department,
  type Task,
} from "@opendx/domain";

export interface CompanyOperatingCoreRepository {
  findSnapshotByCompanyId(companyId: CompanyId): CompanyOperatingCoreSnapshot | undefined;
  findDepartmentsByCompanyId(companyId: CompanyId): Department[];
  findTasksByCompanyId(companyId: CompanyId): Task[];
  findEventsByCompanyId(companyId: CompanyId): BusinessEvent[];
  findApprovalsByCompanyId(companyId: CompanyId): ApprovalRequest[];
}

export class InMemoryCompanyOperatingCoreRepository implements CompanyOperatingCoreRepository {
  private readonly snapshots: CompanyOperatingCoreSnapshot[];

  constructor(snapshots: CompanyOperatingCoreSnapshot[]) {
    const issues = snapshots.flatMap((snapshot) => [
      ...validateCompanyOperatingCoreSnapshot(snapshot),
      ...assertValidCompanyScope(snapshot, snapshot.company.id),
    ]);

    if (issues.length > 0) {
      throw new Error(`Invalid Company Operating Core seed: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
    }

    this.snapshots = snapshots;
  }

  findSnapshotByCompanyId(companyId: CompanyId): CompanyOperatingCoreSnapshot | undefined {
    return this.snapshots.find((snapshot) => snapshot.company.id === companyId);
  }

  findDepartmentsByCompanyId(companyId: CompanyId): Department[] {
    return this.findSnapshotByCompanyId(companyId)?.departments ?? [];
  }

  findTasksByCompanyId(companyId: CompanyId): Task[] {
    return this.findSnapshotByCompanyId(companyId)?.tasks ?? [];
  }

  findEventsByCompanyId(companyId: CompanyId): BusinessEvent[] {
    return this.findSnapshotByCompanyId(companyId)?.events ?? [];
  }

  findApprovalsByCompanyId(companyId: CompanyId): ApprovalRequest[] {
    return this.findSnapshotByCompanyId(companyId)?.approvals ?? [];
  }
}
```

- [ ] **Step 5: Run focused validation**

Run:

```bash
pnpm --filter @opendx/api test -- company-core/repository.test.ts
pnpm --filter @opendx/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Update changelog**

Add under `[Unreleased]` > `### Added`:

```markdown
- Add NovaCommerce Company Operating Core seed data and in-memory repository.
```

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/api/src/company-core/seed.ts apps/api/src/company-core/repository.ts apps/api/src/company-core/repository.test.ts CHANGELOG.md
git diff --cached --check
git commit -m "feat(api): add company core repository"
```

---

### Task 3: Read-Only Company Operating Core API Routes

**Files:**
- Create: `apps/api/src/company-core/routes.ts`
- Create: `apps/api/src/company-core/routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `CompanyOperatingCoreRepository`, `InMemoryCompanyOperatingCoreRepository`, `createCompanyCoreSeed`, `CompanyId`
- Produces: `createCompanyOperatingCoreRouter(repository: CompanyOperatingCoreRepository): Router`

- [ ] **Step 1: Write failing API route tests**

Create `apps/api/src/company-core/routes.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../app";
import { NOVACOMMERCE_COMPANY_ID } from "./seed";

describe("Company Operating Core API", () => {
  const app = createApiApp();

  it("returns an aggregate operating-core snapshot for NovaCommerce", async () => {
    const response = await request(app)
      .get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/operating-core`)
      .expect(200);

    expect(response.body.company.name).toBe("NovaCommerce");
    expect(response.body.departments).toHaveLength(8);
    expect(response.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "task_qualify_acme_lead", relatedEventId: "event_lead_created" }),
      ]),
    );
    expect(response.body.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: "approval_required", correlationId: "corr_lead_to_cash" }),
      ]),
    );
  });

  it("returns deterministic not found errors for unknown companies", async () => {
    const response = await request(app)
      .get("/v1/companies/company_missing/operating-core")
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: "company_not_found",
        message: "Company was not found",
      },
    });
  });

  it("returns department, task, event, and approval collections", async () => {
    const [departments, tasks, events, approvals] = await Promise.all([
      request(app).get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/departments`).expect(200),
      request(app).get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/tasks`).expect(200),
      request(app).get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/events`).expect(200),
      request(app).get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/approvals`).expect(200),
    ]);

    expect(departments.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ slug: "sales" })]));
    expect(tasks.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ status: "waiting_approval" })]));
    expect(events.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ type: "lead.created" })]));
    expect(approvals.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ status: "pending" })]));
  });

  it("does not expose cross-company records from company-scoped endpoints", async () => {
    const response = await request(app)
      .get(`/v1/companies/${NOVACOMMERCE_COMPANY_ID}/tasks`)
      .expect(200);

    expect(response.body.data.every((task: { companyId: string }) => task.companyId === NOVACOMMERCE_COMPANY_ID)).toBe(true);
    expect(response.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "task_compass_private" })]),
    );
  });
});
```

- [ ] **Step 2: Run the focused API test and confirm it fails**

Run:

```bash
pnpm --filter @opendx/api test -- company-core/routes.test.ts
```

Expected: FAIL because routes are not implemented or mounted.

- [ ] **Step 3: Implement routes**

Create `apps/api/src/company-core/routes.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Router } from "express";
import type { CompanyId } from "@opendx/domain";
import type { CompanyOperatingCoreRepository } from "./repository";

const companyNotFound = {
  error: {
    code: "company_not_found",
    message: "Company was not found",
  },
};

export function createCompanyOperatingCoreRouter(repository: CompanyOperatingCoreRepository): Router {
  const router = Router();

  router.get("/companies/:companyId/operating-core", (request, response) => {
    const companyId = request.params.companyId as CompanyId;
    const snapshot = repository.findSnapshotByCompanyId(companyId);

    if (!snapshot) {
      response.status(404).json(companyNotFound);
      return;
    }

    response.json(snapshot);
  });

  router.get("/companies/:companyId/departments", (request, response) => {
    const companyId = request.params.companyId as CompanyId;
    if (!repository.findSnapshotByCompanyId(companyId)) {
      response.status(404).json(companyNotFound);
      return;
    }
    response.json({ data: repository.findDepartmentsByCompanyId(companyId) });
  });

  router.get("/companies/:companyId/tasks", (request, response) => {
    const companyId = request.params.companyId as CompanyId;
    if (!repository.findSnapshotByCompanyId(companyId)) {
      response.status(404).json(companyNotFound);
      return;
    }
    response.json({ data: repository.findTasksByCompanyId(companyId) });
  });

  router.get("/companies/:companyId/events", (request, response) => {
    const companyId = request.params.companyId as CompanyId;
    if (!repository.findSnapshotByCompanyId(companyId)) {
      response.status(404).json(companyNotFound);
      return;
    }
    response.json({ data: repository.findEventsByCompanyId(companyId) });
  });

  router.get("/companies/:companyId/approvals", (request, response) => {
    const companyId = request.params.companyId as CompanyId;
    if (!repository.findSnapshotByCompanyId(companyId)) {
      response.status(404).json(companyNotFound);
      return;
    }
    response.json({ data: repository.findApprovalsByCompanyId(companyId) });
  });

  return router;
}
```

Modify `apps/api/src/app.ts`:

```typescript
import { createCompanyOperatingCoreRouter } from "./company-core/routes";
import { InMemoryCompanyOperatingCoreRepository } from "./company-core/repository";
import { createCompanyCoreSeed } from "./company-core/seed";
```

Inside `createApiApp()` after the health route:

```typescript
  const companyCoreRepository = new InMemoryCompanyOperatingCoreRepository(createCompanyCoreSeed());
  app.use("/v1", createCompanyOperatingCoreRouter(companyCoreRepository));
```

- [ ] **Step 4: Run focused API validation**

Run:

```bash
pnpm --filter @opendx/api test -- company-core/routes.test.ts
pnpm --filter @opendx/api typecheck
```

Expected: PASS.

- [ ] **Step 5: Update changelog**

Add under `[Unreleased]` > `### Added`:

```markdown
- Add read-only company-scoped Company Operating Core API endpoints.
```

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/api/src/app.ts apps/api/src/company-core/routes.ts apps/api/src/company-core/routes.test.ts CHANGELOG.md
git diff --cached --check
git commit -m "feat(api): expose company operating core endpoints"
```

---

### Task 4: Phase 2 Documentation and Status

**Files:**
- Create: `docs/api/company-operating-core.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: API endpoints from Task 3
- Produces: public API documentation and Phase 2 status evidence

- [ ] **Step 1: Create API documentation**

Create `docs/api/company-operating-core.md`:

```markdown
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
```

- [ ] **Step 2: Update README architecture links**

Add `docs/api/company-operating-core.md` to the README documentation list.

- [ ] **Step 3: Update roadmap status**

Change Phase 2 row in `docs/roadmap/mvp-status.md` after implementation validation:

```markdown
| Phase 2: Company Operating Core | Complete | `docs/superpowers/specs/2026-07-31-company-operating-core-design.md` | `docs/superpowers/plans/2026-07-31-company-operating-core.md` | Complete after validation |
```

Add latest validation evidence:

```markdown
- Phase 2 validation: domain tests, API tests, root TypeScript validation, repository audit, and root validation passed.
```

Remove open risk:

```markdown
- Company Core models are not implemented.
```

- [ ] **Step 4: Update changelog**

Add under `[Unreleased]` > `### Added`:

```markdown
- Document the Company Operating Core API contract and Phase 2 completion status.
```

- [ ] **Step 5: Run documentation validation**

Run:

```bash
git diff --check
pnpm audit:repo
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add docs/api/company-operating-core.md docs/roadmap/mvp-status.md README.md CHANGELOG.md
git diff --cached --check
git commit -m "docs(api): document company operating core"
```

---

### Task 5: Full Phase Validation

**Files:**
- Modify only if validation reveals a defect in files changed by Tasks 1-4.

**Interfaces:**
- Consumes: all Phase 2 code and docs.
- Produces: verified Phase 2 completion evidence.

- [ ] **Step 1: Run focused domain tests**

Run:

```bash
pnpm --filter @opendx/domain test
```

Expected: PASS.

- [ ] **Step 2: Run focused API tests**

Run:

```bash
pnpm --filter @opendx/api test
```

Expected: PASS.

- [ ] **Step 3: Run root validation**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 4: Run repository audit**

Run:

```bash
pnpm audit:repo
```

Expected: PASS with `0 errors, 0 warning(s)`.

- [ ] **Step 5: Inspect final history and worktree**

Run:

```bash
git log --oneline -6
git status --short --branch
```

Expected:

- Branch is `feat/company-operating-core`.
- Worktree is clean.
- Recent commits are atomic and use Conventional Commits.

- [ ] **Step 6: Push the feature branch**

Run:

```bash
git push -u origin feat/company-operating-core
```

Expected: branch is available on GitHub for review or merge into `develop`.
