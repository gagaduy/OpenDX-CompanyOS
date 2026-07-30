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
  findSnapshotByCompanyId(
    companyId: CompanyId,
  ): CompanyOperatingCoreSnapshot | undefined;
  findDepartmentsByCompanyId(companyId: CompanyId): Department[];
  findTasksByCompanyId(companyId: CompanyId): Task[];
  findEventsByCompanyId(companyId: CompanyId): BusinessEvent[];
  findApprovalsByCompanyId(companyId: CompanyId): ApprovalRequest[];
}

export class InMemoryCompanyOperatingCoreRepository
  implements CompanyOperatingCoreRepository
{
  private readonly snapshots: CompanyOperatingCoreSnapshot[];

  constructor(snapshots: CompanyOperatingCoreSnapshot[]) {
    const issues = snapshots.flatMap((snapshot) => [
      ...validateCompanyOperatingCoreSnapshot(snapshot),
      ...assertValidCompanyScope(snapshot, snapshot.company.id),
    ]);

    if (issues.length > 0) {
      throw new Error(
        `Invalid Company Operating Core seed: ${issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      );
    }

    this.snapshots = snapshots;
  }

  findSnapshotByCompanyId(
    companyId: CompanyId,
  ): CompanyOperatingCoreSnapshot | undefined {
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
