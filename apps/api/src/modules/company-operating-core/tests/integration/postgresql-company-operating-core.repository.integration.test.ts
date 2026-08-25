// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresqlCompanyOperatingCoreRepository } from "../../infrastructure/repositories/implementations/postgresql-company-operating-core.repository";
import {
  runCatalogMigrations,
  runCompanyCoreMigrations,
} from "../../../../shared/database/run-migrations";
import {
  PostgresTransactionRunner,
  type TransactionRunner,
} from "../../../../shared/database/transaction";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase("PostgresqlCompanyOperatingCoreRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await pool.query(`
      INSERT INTO company_profile (singleton_key, name, industry, size, created_at)
      VALUES (1, 'NovaCommerce', 'E-commerce', '51-200', '2026-07-31T00:00:00.000Z');
      INSERT INTO departments (id, name, slug, created_at) VALUES
        ('department_z', 'Zulu', 'zulu', '2026-07-31T00:00:00.000Z'),
        ('department_a', 'Alpha', 'alpha', '2026-07-31T00:00:00.000Z');
      INSERT INTO positions (id, department_id, title, level, created_at)
      VALUES ('position_a', 'department_a', 'Manager', 'manager', '2026-07-31T00:00:00.000Z');
      INSERT INTO human_employees
        (id, department_id, position_id, display_name, work_email, status, created_at)
      VALUES ('employee_a', 'department_a', 'position_a', 'Mai Nguyen', 'mai@example.test', 'active', '2026-07-31T00:00:00.000Z');
      INSERT INTO goals (id, owner_type, title, status, created_at)
      VALUES ('goal_a', 'company', 'Grow', 'active', '2026-07-31T00:00:00.000Z');
      INSERT INTO kpis (id, goal_id, name, unit, target, current, direction, updated_at)
      VALUES ('kpi_a', 'goal_a', 'Revenue', 'usd', 100, 50, 'increase', '2026-07-31T00:00:00.000Z');
      INSERT INTO business_events
        (id, type, source, actor_type, actor_id, occurred_at, correlation_id, sensitivity)
      VALUES ('event_a', 'lead.created', 'website', 'service_account', 'svc_web', '2026-07-31T00:00:00.000Z', 'corr_a', 'internal');
      INSERT INTO operating_tasks
        (id, title, status, priority, assignee_type, assignee_id, related_event_id, created_at)
      VALUES ('task_a', 'Qualify lead', 'in_progress', 'high', 'department', 'department_a', 'event_a', '2026-07-31T00:00:00.000Z');
      INSERT INTO decisions
        (id, title, decided_by_type, decided_by_id, outcome, related_task_id, correlation_id, decided_at)
      VALUES ('decision_a', 'Review', 'user', 'employee_a', 'Approved', 'task_a', 'corr_a', '2026-07-31T00:00:00.000Z');
      INSERT INTO approval_requests
        (id, requested_action, requested_by_type, requested_by_id, approver_role, status, risk_level, decision, correlation_id, created_at)
      VALUES ('approval_a', 'sales.discount', 'workflow', 'workflow_a', 'finance_manager', 'pending', 'medium', 'require_approval', 'corr_a', '2026-07-31T00:00:00.000Z');
      INSERT INTO audit_events
        (id, actor_type, actor_id, action, resource_type, resource_id, outcome, correlation_id, occurred_at)
      VALUES ('audit_a', 'user', 'employee_a', 'task.read', 'task', 'task_a', 'success', 'corr_a', '2026-07-31T00:00:00.000Z');
    `);
  });

  afterAll(async () => {
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("loads the complete snapshot in one read-only transaction", async () => {
    const postgresRunner = new PostgresTransactionRunner(pool);
    let readOnlyTransactions = 0;
    const runner: TransactionRunner = {
      run: (work) => postgresRunner.run(work),
      runReadOnly: (work) => {
        readOnlyTransactions += 1;
        return postgresRunner.runReadOnly(work);
      },
    };
    const repository = new PostgresqlCompanyOperatingCoreRepository(runner);

    const snapshot = await repository.getSnapshot();

    expect(readOnlyTransactions).toBe(1);
    expect(snapshot.company.name).toBe("NovaCommerce");
    expect(snapshot.departments.map(({ id }) => id)).toEqual([
      "department_a",
      "department_z",
    ]);
    expect(snapshot.events[0]?.actor).toEqual({
      type: "service_account",
      id: "svc_web",
    });
    snapshot.company.name = "Changed";
    expect((await repository.getSnapshot()).company.name).toBe("NovaCommerce");
  });

  it("returns deterministically ordered route collections", async () => {
    const repository = new PostgresqlCompanyOperatingCoreRepository(
      new PostgresTransactionRunner(pool),
    );

    const [departments, tasks, events, approvals] = await Promise.all([
      repository.listDepartments(),
      repository.listTasks(),
      repository.listEvents(),
      repository.listApprovals(),
    ]);

    expect(departments.map(({ id }) => id)).toEqual(["department_a", "department_z"]);
    expect(tasks.map(({ id }) => id)).toEqual(["task_a"]);
    expect(events.map(({ id }) => id)).toEqual(["event_a"]);
    expect(approvals.map(({ id }) => id)).toEqual(["approval_a"]);
  });
});
