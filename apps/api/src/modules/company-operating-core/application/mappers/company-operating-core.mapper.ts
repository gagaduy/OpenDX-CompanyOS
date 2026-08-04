// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ApprovalRequest,
  BusinessEvent,
  CompanyOperatingCoreSnapshot,
  Department,
  Task,
} from "../../domain/entities/company-operating-core";
import type {
  ApprovalResponseDto,
  BusinessEventResponseDto,
  CompanyOperatingCoreResponseDto,
  DepartmentResponseDto,
  TaskResponseDto,
} from "../dtos/responses/company-operating-core-response.dto";

export class CompanyOperatingCoreMapper {
  toResponse(
    snapshot: CompanyOperatingCoreSnapshot,
  ): CompanyOperatingCoreResponseDto {
    return structuredClone(snapshot);
  }

  toDepartmentResponses(
    departments: readonly Department[],
  ): readonly DepartmentResponseDto[] {
    return structuredClone(departments);
  }

  toTaskResponses(tasks: readonly Task[]): readonly TaskResponseDto[] {
    return structuredClone(tasks);
  }

  toBusinessEventResponses(
    events: readonly BusinessEvent[],
  ): readonly BusinessEventResponseDto[] {
    return structuredClone(events);
  }

  toApprovalResponses(
    approvals: readonly ApprovalRequest[],
  ): readonly ApprovalResponseDto[] {
    return structuredClone(approvals);
  }
}
