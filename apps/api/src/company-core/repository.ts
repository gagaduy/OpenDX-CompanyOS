// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ApprovalRequest,
  BusinessEvent,
  CompanyOperatingCoreSnapshot,
  Department,
  Task,
} from "../modules/company-operating-core/domain/entities/company-operating-core";
import { validateCompanyOperatingCoreSnapshot } from "../modules/company-operating-core/domain/services/company-operating-core-validation";

export interface CompanyOperatingCoreRepository {
  getSnapshot(): CompanyOperatingCoreSnapshot;
  listDepartments(): Department[];
  listTasks(): Task[];
  listEvents(): BusinessEvent[];
  listApprovals(): ApprovalRequest[];
}

export class InMemoryCompanyOperatingCoreRepository
  implements CompanyOperatingCoreRepository
{
  constructor(private readonly snapshot: CompanyOperatingCoreSnapshot) {
    const issues = validateCompanyOperatingCoreSnapshot(snapshot);
    if (issues.length > 0) {
      throw new Error(
        `Invalid Company Operating Core seed: ${issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      );
    }
  }

  getSnapshot(): CompanyOperatingCoreSnapshot {
    return this.snapshot;
  }

  listDepartments(): Department[] {
    return this.snapshot.departments;
  }

  listTasks(): Task[] {
    return this.snapshot.tasks;
  }

  listEvents(): BusinessEvent[] {
    return this.snapshot.events;
  }

  listApprovals(): ApprovalRequest[] {
    return this.snapshot.approvals;
  }
}
