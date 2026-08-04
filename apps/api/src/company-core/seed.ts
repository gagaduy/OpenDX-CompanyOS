// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CompanyId } from "@opendx/domain";
import type {
  ActorType,
  AuditEvent,
  CompanyOperatingCoreSnapshot,
  Department,
  HumanEmployee,
  Position,
} from "../modules/company-operating-core/domain/entities/company-operating-core";

export const NOVACOMMERCE_COMPANY_ID = "company_novacommerce" as CompanyId;

const COMPASS_COMPANY_ID = "company_compass_demo" as CompanyId;
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
      department(
        "department_customer_service",
        "Customer Service",
        "customer-service",
      ),
      department("department_operations", "Operations", "operations"),
      department("department_finance", "Finance", "finance"),
      department("department_hr", "Human Resources", "human-resources"),
      department(
        "department_it_compliance",
        "IT and Compliance",
        "it-compliance",
      ),
    ],
    positions: [
      position(
        "position_ceo",
        "department_executive",
        "Chief Executive Officer",
        "executive",
      ),
      position(
        "position_sales_manager",
        "department_sales",
        "Sales Manager",
        "manager",
      ),
      position(
        "position_finance_manager",
        "department_finance",
        "Finance Manager",
        "manager",
      ),
      position(
        "position_ops_manager",
        "department_operations",
        "Operations Manager",
        "manager",
      ),
      position(
        "position_cs_manager",
        "department_customer_service",
        "Customer Service Manager",
        "manager",
      ),
    ],
    humanEmployees: [
      employee(
        "employee_ceo",
        "department_executive",
        "position_ceo",
        "Mai Nguyen",
        "mai@novacommerce.example",
      ),
      employee(
        "employee_sales_manager",
        "department_sales",
        "position_sales_manager",
        "An Tran",
        "an.sales@novacommerce.example",
        "employee_ceo",
      ),
      employee(
        "employee_finance_manager",
        "department_finance",
        "position_finance_manager",
        "Linh Pham",
        "linh.finance@novacommerce.example",
        "employee_ceo",
      ),
      employee(
        "employee_ops_manager",
        "department_operations",
        "position_ops_manager",
        "Huy Le",
        "huy.ops@novacommerce.example",
        "employee_ceo",
      ),
      employee(
        "employee_cs_manager",
        "department_customer_service",
        "position_cs_manager",
        "Thao Do",
        "thao.cs@novacommerce.example",
        "employee_ceo",
      ),
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
      businessEvent(
        "event_lead_created",
        "lead.created",
        "website",
        "service_account",
        "svc_website",
        "corr_lead_to_cash",
      ),
      businessEvent(
        "event_approval_requested",
        "approval.requested",
        "workflow",
        "workflow",
        "workflow_lead_to_cash",
        "corr_lead_to_cash",
        "event_lead_created",
      ),
      businessEvent(
        "event_customer_complained",
        "customer.complained",
        "support_portal",
        "service_account",
        "svc_support_portal",
        "corr_complaint_resolution",
      ),
      businessEvent(
        "event_employee_onboarded",
        "employee.onboarded",
        "hr_system",
        "service_account",
        "svc_hr",
        "corr_hire_to_onboard",
      ),
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
      audit(
        "audit_lead_created",
        "service_account",
        "svc_website",
        "lead.created",
        "lead",
        "lead_acme",
        "success",
        "corr_lead_to_cash",
      ),
      audit(
        "audit_approval_requested",
        "workflow",
        "workflow_lead_to_cash",
        "approval.requested",
        "approval_request",
        "approval_discount_pending",
        "approval_required",
        "corr_lead_to_cash",
      ),
      audit(
        "audit_salary_export_denied",
        "agent",
        "agent_sales",
        "hr.export_salary_data",
        "employee_salary",
        "salary_dataset",
        "denied",
        "corr_salary_denied",
      ),
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
    departments: [
      department(
        "department_compass_ops",
        "Operations",
        "operations",
        COMPASS_COMPANY_ID,
      ),
    ],
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

function department(
  id: string,
  name: string,
  slug: string,
  companyId = NOVACOMMERCE_COMPANY_ID,
): Department {
  return { id, companyId, name, slug, createdAt: CREATED_AT };
}

function position(
  id: string,
  departmentId: string,
  title: string,
  level: string,
): Position {
  return {
    id,
    companyId: NOVACOMMERCE_COMPANY_ID,
    departmentId,
    title,
    level,
    createdAt: CREATED_AT,
  };
}

function employee(
  id: string,
  departmentId: string,
  positionId: string,
  displayName: string,
  workEmail: string,
  reportsToEmployeeId?: string,
): HumanEmployee {
  return {
    id,
    companyId: NOVACOMMERCE_COMPANY_ID,
    departmentId,
    positionId,
    displayName,
    workEmail,
    reportsToEmployeeId,
    status: "active",
    createdAt: CREATED_AT,
  };
}

function businessEvent(
  id: string,
  type: string,
  source: string,
  actorType: Extract<ActorType, "service_account" | "workflow">,
  actorId: string,
  correlationId: string,
  causationId?: string,
) {
  return {
    id,
    companyId: NOVACOMMERCE_COMPANY_ID,
    type,
    source,
    actor: { type: actorType, id: actorId },
    occurredAt: CREATED_AT,
    correlationId,
    causationId,
    sensitivity: "internal" as const,
  };
}

function audit(
  id: string,
  actorType: Extract<ActorType, "service_account" | "workflow" | "agent">,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  outcome: AuditEvent["outcome"],
  correlationId: string,
): AuditEvent {
  return {
    id,
    companyId: NOVACOMMERCE_COMPANY_ID,
    actor: { type: actorType, id: actorId },
    action,
    resourceType,
    resourceId,
    outcome,
    correlationId,
    occurredAt: CREATED_AT,
  };
}
