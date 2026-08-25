// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ApprovalResponseDto,
  BusinessEventResponseDto,
  CompanyOperatingCoreResponseDto,
  DepartmentResponseDto,
  TaskResponseDto,
} from "../../dtos/responses/company-operating-core-response.dto";

export interface ICompanyOperatingCoreService {
  getSnapshot(): Promise<CompanyOperatingCoreResponseDto>;
  listDepartments(): Promise<readonly DepartmentResponseDto[]>;
  listTasks(): Promise<readonly TaskResponseDto[]>;
  listEvents(): Promise<readonly BusinessEventResponseDto[]>;
  listApprovals(): Promise<readonly ApprovalResponseDto[]>;
}
