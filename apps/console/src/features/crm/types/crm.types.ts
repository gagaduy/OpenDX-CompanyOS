// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CustomerSegment, CustomerSummaryView } from "../../customers/types/customer.types";

export interface CustomerDetailView extends CustomerSummaryView { readonly addresses:readonly { readonly id:string; readonly recipientName:string; readonly phoneNumber:string; readonly addressLine:string; readonly ward:string; readonly provinceOrCity:string; readonly postalCode?:string; readonly isDefault:boolean; }[]; }
export interface CrmOrderView { readonly id:string; readonly publicNumber:string; readonly status:string; readonly totalVnd:number; readonly createdAt:string; readonly paidAt?:string; }
export interface PaidFactsView { readonly paidOrderCount:number; readonly lifetimePaidVnd:number; readonly latestPaidAt?:string; }
export interface CrmNoteView { readonly id:string; readonly customerId:string; readonly authorId:string; readonly body:string; readonly correctsNoteId?:string; readonly createdAt:string; }
export interface FollowupView { readonly id:string; readonly customerId:string; readonly dueAt:string; readonly description:string; readonly status:"open"|"completed"; readonly version:number; readonly createdById:string; readonly assigneeId?:string; readonly completedById?:string; readonly completedAt?:string; readonly createdAt:string; readonly updatedAt:string; }
export interface Customer360View { readonly customer:CustomerDetailView; readonly orders:readonly CrmOrderView[]; readonly paidFacts:PaidFactsView; readonly segments:readonly CustomerSegment[]; readonly calculatedAt:string; readonly notes:readonly CrmNoteView[]; readonly followups:readonly FollowupView[]; }
export type FollowupUpdateInput = { readonly action:"claim"; readonly version:number } | { readonly action:"complete"; readonly version:number };
