// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  mapApprovalRequestRow,
  mapBusinessEventRow,
  mapGoalRow,
  mapHumanEmployeeRow,
  mapKpiRow,
} from "./company-operating-core.row-mapper";

const timestamp = new Date("2026-07-31T00:00:00.000Z");

describe("Company Operating Core row mapper", () => {
  it("maps snake-case rows and omits nullable relationships", () => {
    expect(
      mapHumanEmployeeRow({
        id: "employee_ceo",
        department_id: "department_executive",
        position_id: "position_ceo",
        display_name: "Mai Nguyen",
        work_email: "mai@novacommerce.example",
        reports_to_employee_id: null,
        status: "active",
        created_at: timestamp,
      }),
    ).toEqual({
      id: "employee_ceo",
      departmentId: "department_executive",
      positionId: "position_ceo",
      displayName: "Mai Nguyen",
      workEmail: "mai@novacommerce.example",
      status: "active",
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    expect(
      mapGoalRow({
        id: "goal_company",
        owner_type: "company",
        owner_department_id: null,
        title: "Company goal",
        status: "active",
        created_at: timestamp,
      }),
    ).not.toHaveProperty("ownerId");
  });

  it("maps finite KPI values and rejects unsafe database values", () => {
    expect(
      mapKpiRow({
        id: "kpi_revenue",
        goal_id: "goal_company",
        name: "Revenue",
        unit: "usd",
        target: "1200000",
        current: 760000,
        direction: "increase",
        updated_at: timestamp,
      }),
    ).toMatchObject({ target: 1200000, current: 760000 });

    expect(() =>
      mapKpiRow({
        id: "kpi_invalid",
        goal_id: "goal_company",
        name: "Invalid",
        unit: "usd",
        target: "Infinity",
        current: 0,
        direction: "increase",
        updated_at: timestamp,
      }),
    ).toThrow("target");
  });

  it("validates enums and creates fresh nested actor objects", () => {
    const row = {
      id: "event_created",
      type: "lead.created",
      source: "website",
      actor_type: "service_account",
      actor_id: "svc_website",
      occurred_at: timestamp,
      correlation_id: "corr_lead",
      causation_id: null,
      sensitivity: "internal",
    } as const;
    const first = mapBusinessEventRow(row);
    const second = mapBusinessEventRow(row);
    expect(first.actor).toEqual({ type: "service_account", id: "svc_website" });
    expect(first.actor).not.toBe(second.actor);

    expect(() =>
      mapApprovalRequestRow({
        id: "approval_invalid",
        requested_action: "sales.discount",
        requested_by_type: "intruder",
        requested_by_id: "unknown",
        approver_role: "finance_manager",
        status: "pending",
        risk_level: "medium",
        decision: "require_approval",
        correlation_id: "corr",
        created_at: timestamp,
        resolved_at: null,
      }),
    ).toThrow("requested_by_type");
  });
});
