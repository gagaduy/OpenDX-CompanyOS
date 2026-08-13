// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { ApprovalRequest, ApprovalState } from "../../../domain/entities/approval-request";

export interface ApprovalQuery { readonly page: number; readonly pageSize: number }
export interface ApprovalPage { readonly items: readonly ApprovalRequest[]; readonly totalItems: number }
export interface ApprovalDecisionInput { readonly approvalId: string; readonly expectedVersion: number; readonly decision: Exclude<ApprovalState, "pending">; readonly reason: string }

export interface ApprovalService {
  list(query: ApprovalQuery, principal: StaffPrincipal): Promise<ApprovalPage>;
  get(id: string, principal: StaffPrincipal): Promise<ApprovalRequest>;
  decide(input: ApprovalDecisionInput, principal: StaffPrincipal): Promise<ApprovalRequest>;
}
