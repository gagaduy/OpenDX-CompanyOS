// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CustomerOperationsSummary } from "../../../../customer";
import type { CustomerSegment } from "../../../domain/services/crm-rules";
import type {
  CrmNoteDto,
  CrmContext,
  CrmPage,
  Customer360Dto,
  CustomerSegmentListDto,
  FollowupDto,
  SegmentCustomerDto,
} from "../../dtos/crm.dto";

export interface CrmServiceContract {
  searchCustomers(query: { readonly search?: string; readonly page: number; readonly pageSize: number }, context: CrmContext): Promise<CrmPage<CustomerOperationsSummary>>;
  getCustomer(customerId: string, context: CrmContext): Promise<Customer360Dto>;
  listNotes(customerId: string, context: CrmContext): Promise<readonly CrmNoteDto[]>;
  createNote(customerId: string, input: { readonly body: string; readonly correctsNoteId?: string }, context: CrmContext): Promise<CrmNoteDto>;
  listFollowups(customerId: string, context: CrmContext): Promise<readonly FollowupDto[]>;
  createFollowup(customerId: string, input: { readonly dueAt: string; readonly description: string }, context: CrmContext): Promise<FollowupDto>;
  updateFollowup(customerId: string, followupId: string, input: { readonly action: "claim" | "complete"; readonly version: number }, context: CrmContext): Promise<FollowupDto>;
  listSegments(context: CrmContext): Promise<CustomerSegmentListDto>;
  listSegmentCustomers(segmentId: CustomerSegment, query: { readonly page: number; readonly pageSize: number }, context: CrmContext): Promise<CrmPage<SegmentCustomerDto> & { readonly calculatedAt: string }>;
}

export interface CrmOperationsSummaryReader {
  countOverdueFollowups(asOf: string): Promise<number>;
}
