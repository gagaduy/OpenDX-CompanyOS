// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ApprovalRequest,
  BusinessEvent,
  CompanyOperatingCoreSnapshot,
  Department,
  Task,
} from "../../../domain/entities/company-operating-core";

export interface ICompanyOperatingCoreRepository {
  getSnapshot(): Promise<CompanyOperatingCoreSnapshot>;
  listDepartments(): Promise<readonly Department[]>;
  listTasks(): Promise<readonly Task[]>;
  listEvents(): Promise<readonly BusinessEvent[]>;
  listApprovals(): Promise<readonly ApprovalRequest[]>;
}
