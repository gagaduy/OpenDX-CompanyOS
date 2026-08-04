// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ApprovalResponseDto,
  BusinessEventResponseDto,
  CompanyOperatingCoreResponseDto,
  DepartmentResponseDto,
  TaskResponseDto,
} from "../../dtos/responses/company-operating-core-response.dto";
import type { CompanyOperatingCoreMapper } from "../../mappers/company-operating-core.mapper";
import type { ICompanyOperatingCoreRepository } from "../../repositories/interfaces/company-operating-core.repository";
import type { ICompanyOperatingCoreService } from "../interfaces/company-operating-core.service";

export class CompanyOperatingCoreService
  implements ICompanyOperatingCoreService
{
  constructor(
    private readonly repository: ICompanyOperatingCoreRepository,
    private readonly mapper: CompanyOperatingCoreMapper,
  ) {}

  async getSnapshot(): Promise<CompanyOperatingCoreResponseDto> {
    return this.mapper.toResponse(await this.repository.getSnapshot());
  }

  async listDepartments(): Promise<readonly DepartmentResponseDto[]> {
    return this.mapper.toDepartmentResponses(
      await this.repository.listDepartments(),
    );
  }

  async listTasks(): Promise<readonly TaskResponseDto[]> {
    return this.mapper.toTaskResponses(await this.repository.listTasks());
  }

  async listEvents(): Promise<readonly BusinessEventResponseDto[]> {
    return this.mapper.toBusinessEventResponses(
      await this.repository.listEvents(),
    );
  }

  async listApprovals(): Promise<readonly ApprovalResponseDto[]> {
    return this.mapper.toApprovalResponses(
      await this.repository.listApprovals(),
    );
  }
}
