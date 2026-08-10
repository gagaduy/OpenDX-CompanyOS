// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import { authenticateStaff } from "../../shared/auth/staff-auth.middleware";
import type { DeniedAuditContext } from "../../shared/auth/audited-role-guard.middleware";
import { ReportingService } from "./application/services/implementations/reporting.service";
import { PostgresqlReportingRepository } from "./infrastructure/repositories/implementations/postgresql-reporting.repository";
import { ReportingController } from "./presentation/controllers/reporting.controller";
import { reportingErrorMiddleware } from "./presentation/middleware/reporting-error.middleware";
import { createReportingRouter } from "./presentation/routes/reporting.routes";

interface Queryable {
  query<Row extends object>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[] }>;
}

export interface ReportingModuleDependencies {
  readonly database: Queryable;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly generateId: () => string;
  readonly now: () => string;
}

export function createReportingModule(dependencies: ReportingModuleDependencies) {
  const repository = new PostgresqlReportingRepository(dependencies.database);
  const service = new ReportingService(repository, dependencies.now);
  const appendDenied = (context: DeniedAuditContext) =>
    dependencies.database.query(
      `INSERT INTO audit_events
       (id,actor_type,actor_id,action,resource_type,resource_id,outcome,correlation_id,metadata,occurred_at)
       VALUES ($1,'user',$2,$3,'reporting',$4,'denied',$5,'{}',$6)`,
      [
        dependencies.generateId(),
        context.actorId,
        context.action,
        context.resourceId,
        context.correlationId,
        dependencies.now(),
      ],
    ).then(() => undefined);
  const router = createReportingRouter(
    new ReportingController(service),
    authenticateStaff(dependencies.staffTokenVerifier),
    appendDenied,
  );
  router.use(reportingErrorMiddleware);
  return { router };
}
