// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CustomerOperationsDetail, CustomerOperationsSummary } from "../../../customer";
import type { PaidCustomerFacts } from "../../../order";
import type { CustomerSegment } from "../../domain/services/crm-rules";

export interface CrmContext {
  readonly actorId: string;
  readonly roles: readonly ("administrator" | "crm_operator")[];
  readonly correlationId: string;
}

export interface Customer360Dto {
  readonly customer: CustomerOperationsDetail;
  readonly orders: readonly {
    readonly id: string;
    readonly publicNumber: string;
    readonly status: string;
    readonly totalVnd: number;
    readonly createdAt: string;
    readonly paidAt?: string;
  }[];
  readonly paidFacts: PaidCustomerFacts;
  readonly segments: readonly CustomerSegment[];
  readonly calculatedAt: string;
  readonly notes: readonly CrmNoteDto[];
  readonly followups: readonly FollowupDto[];
}

export interface CrmNoteDto {
  readonly id: string;
  readonly customerId: string;
  readonly authorId: string;
  readonly body: string;
  readonly correctsNoteId?: string;
  readonly createdAt: string;
}

export interface FollowupDto {
  readonly id: string;
  readonly customerId: string;
  readonly dueAt: string;
  readonly description: string;
  readonly status: "open" | "completed";
  readonly version: number;
  readonly createdById: string;
  readonly assigneeId?: string;
  readonly completedById?: string;
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CrmPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface CustomerSegmentDefinitionDto {
  readonly id: CustomerSegment;
  readonly name: string;
  readonly description: string;
  readonly customerCount: number;
}

export interface CustomerSegmentListDto {
  readonly items: readonly CustomerSegmentDefinitionDto[];
  readonly calculatedAt: string;
}

export interface SegmentCustomerDto {
  readonly customer: CustomerOperationsSummary;
  readonly paidFacts: PaidCustomerFacts;
  readonly segments: readonly CustomerSegment[];
}
