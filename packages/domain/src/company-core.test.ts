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
    expect(assertValidCompanyScope(validSnapshot, "company_novacommerce")).toEqual(
      [],
    );
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

    expect(
      assertValidCompanyScope(invalid, "company_novacommerce"),
    ).toContainEqual({
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
        {
          path: "tasks[0].status",
          message: "Unknown task status: blocked_forever",
        },
        {
          path: "approvals[0].status",
          message: "Unknown approval status: waiting",
        },
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
        {
          path: "events[0].type",
          message: "Business event type is required",
        },
        {
          path: "events[0].correlationId",
          message: "Business event correlationId is required",
        },
      ]),
    );
  });
});
