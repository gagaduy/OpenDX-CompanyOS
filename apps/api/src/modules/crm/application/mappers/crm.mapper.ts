// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CustomerOperationsDetail, CustomerOperationsSummary } from "../../../customer";
import type { CrmNote } from "../../domain/entities/crm-note";
import type { Followup } from "../../domain/entities/followup";
import type { CrmNoteDto, FollowupDto } from "../dtos/crm.dto";

export function mapCustomerDetail(value: CustomerOperationsDetail): CustomerOperationsDetail {
  return { ...value, addresses: value.addresses.map((address) => ({ ...address })) };
}

export function mapCustomerSummary(value: CustomerOperationsSummary): CustomerOperationsSummary {
  return { ...value };
}

export function mapCrmNote(value: CrmNote): CrmNoteDto {
  return { ...value };
}

export function mapFollowup(value: Followup): FollowupDto {
  return { ...value };
}
