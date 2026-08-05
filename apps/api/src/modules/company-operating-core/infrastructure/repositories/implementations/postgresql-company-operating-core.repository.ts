// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ICompanyOperatingCoreRepository } from "../../../application/repositories/interfaces/company-operating-core.repository";
import type {
  ApprovalRequest,
  BusinessEvent,
  CompanyOperatingCoreSnapshot,
  Department,
  Task,
} from "../../../domain/entities/company-operating-core";
import type {
  DatabaseSession,
  TransactionRunner,
} from "../../../../../shared/database/transaction";
import {
  mapApprovalRequestRow,
  mapAuditEventRow,
  mapBusinessEventRow,
  mapCompanyOperatingCoreRows,
  mapDepartmentRow,
  mapOperatingTaskRow,
} from "../../database/company-operating-core.row-mapper";
import type {
  ApprovalRequestRow,
  AuditEventRow,
  BusinessEventRow,
  CompanyProfileRow,
  DecisionRow,
  DepartmentRow,
  GoalRow,
  HumanEmployeeRow,
  KpiRow,
  OperatingTaskRow,
  PositionRow,
} from "../../database/company-operating-core.rows";

export class PostgresqlCompanyOperatingCoreRepository
  implements ICompanyOperatingCoreRepository
{
  constructor(private readonly transactions: TransactionRunner) {}

  async getSnapshot(): Promise<CompanyOperatingCoreSnapshot> {
    return this.transactions.runReadOnly(async (session) => {
      const company = await session.query<CompanyProfileRow>(
        "SELECT name, industry, size, created_at FROM company_profile WHERE singleton_key = 1",
      );
      if (company.rows[0] === undefined) {
        throw new Error("Company Operating Core is not initialized");
      }

      const departments = await this.query<DepartmentRow>(session, "departments");
      const positions = await this.query<PositionRow>(session, "positions");
      const humanEmployees = await this.query<HumanEmployeeRow>(session, "human_employees");
      const goals = await this.query<GoalRow>(session, "goals");
      const kpis = await this.query<KpiRow>(session, "kpis");
      const tasks = await this.query<OperatingTaskRow>(session, "operating_tasks");
      const events = await this.query<BusinessEventRow>(session, "business_events");
      const decisions = await this.query<DecisionRow>(session, "decisions");
      const approvals = await this.query<ApprovalRequestRow>(session, "approval_requests");
      const auditEvents = await this.query<AuditEventRow>(session, "audit_events");

      return mapCompanyOperatingCoreRows({
        company: company.rows[0],
        departments,
        positions,
        humanEmployees,
        goals,
        kpis,
        tasks,
        events,
        decisions,
        approvals,
        auditEvents,
      });
    });
  }

  async listDepartments(): Promise<readonly Department[]> {
    return this.transactions.runReadOnly(async (session) =>
      (await this.query<DepartmentRow>(session, "departments")).map(mapDepartmentRow),
    );
  }

  async listTasks(): Promise<readonly Task[]> {
    return this.transactions.runReadOnly(async (session) =>
      (await this.query<OperatingTaskRow>(session, "operating_tasks")).map(mapOperatingTaskRow),
    );
  }

  async listEvents(): Promise<readonly BusinessEvent[]> {
    return this.transactions.runReadOnly(async (session) =>
      (await this.query<BusinessEventRow>(session, "business_events")).map(mapBusinessEventRow),
    );
  }

  async listApprovals(): Promise<readonly ApprovalRequest[]> {
    return this.transactions.runReadOnly(async (session) =>
      (await this.query<ApprovalRequestRow>(session, "approval_requests")).map(mapApprovalRequestRow),
    );
  }

  private async query<Row extends object>(
    session: DatabaseSession,
    table: string,
  ): Promise<readonly Row[]> {
    const result = await session.query<Row>(`SELECT * FROM ${table} ORDER BY id`);
    return result.rows;
  }
}
