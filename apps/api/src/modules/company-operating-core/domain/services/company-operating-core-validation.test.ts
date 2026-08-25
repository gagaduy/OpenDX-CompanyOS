// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { CompanyOperatingCoreSnapshot } from "../entities/company-operating-core";
import { validateCompanyOperatingCoreSnapshot } from "./company-operating-core-validation";

const validSnapshot: CompanyOperatingCoreSnapshot = {
  company: {
    name: "NovaCommerce",
    industry: "E-commerce",
    size: "51-200",
    createdAt: "2026-07-31T00:00:00.000Z",
  },
  departments: [
    {
      id: "department_sales",
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
  it("accepts a valid single-company snapshot without company identifiers", () => {
    expect(validateCompanyOperatingCoreSnapshot(validSnapshot)).toEqual([]);
    expect(JSON.stringify(validSnapshot)).not.toContain("companyId");
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
