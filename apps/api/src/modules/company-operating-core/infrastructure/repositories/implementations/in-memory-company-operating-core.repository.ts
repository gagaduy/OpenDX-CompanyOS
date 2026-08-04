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
import { validateCompanyOperatingCoreSnapshot } from "../../../domain/services/company-operating-core-validation";

export class InMemoryCompanyOperatingCoreRepository
  implements ICompanyOperatingCoreRepository
{
  private readonly snapshot: CompanyOperatingCoreSnapshot;

  constructor(snapshot: CompanyOperatingCoreSnapshot) {
    const issues = validateCompanyOperatingCoreSnapshot(snapshot);
    if (issues.length > 0) {
      throw new Error(
        `Invalid Company Operating Core seed: ${issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      );
    }

    this.snapshot = structuredClone(snapshot);
  }

  async getSnapshot(): Promise<CompanyOperatingCoreSnapshot> {
    return structuredClone(this.snapshot);
  }

  async listDepartments(): Promise<readonly Department[]> {
    return structuredClone(this.snapshot.departments);
  }

  async listTasks(): Promise<readonly Task[]> {
    return structuredClone(this.snapshot.tasks);
  }

  async listEvents(): Promise<readonly BusinessEvent[]> {
    return structuredClone(this.snapshot.events);
  }

  async listApprovals(): Promise<readonly ApprovalRequest[]> {
    return structuredClone(this.snapshot.approvals);
  }
}
